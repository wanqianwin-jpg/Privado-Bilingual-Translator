//
//  SafariWebExtensionHandler.swift
//  Shared (Extension)
//

import SafariServices
import Translation
import Vision
import NaturalLanguage
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        guard let dict = message as? [String: Any],
              let type = dict["type"] as? String else {
            reply(context, ["error": "invalid message"])
            return
        }

        Task {
            do {
                let result = try await handle(type: type, payload: dict)
                reply(context, result)
            } catch {
                reply(context, ["error": error.localizedDescription])
            }
        }
    }

    // MARK: - Message Dispatch

    private func handle(type: String, payload: [String: Any]) async throws -> [String: Any] {
        switch type {
        case "TRANSLATE_STATUS":
            let fromLang = payload["fromLang"] as? String ?? "en"
            let toLang   = payload["toLang"]   as? String ?? "zh"
            return await handleStatus(fromLang: fromLang, toLang: toLang)

        case "TRANSLATE":
            let texts    = payload["texts"]    as? [String] ?? []
            let fromLang = payload["fromLang"] as? String ?? "auto"
            let toLang   = payload["toLang"]   as? String ?? "zh"
            return try await handleTranslate(texts: texts, fromLang: fromLang, toLang: toLang)

        case "DETECT_LANGUAGE":
            let text = payload["text"] as? String ?? ""
            return handleDetectLanguage(text: text)

        case "OCR":
            let dataUri = payload["image"] as? String ?? ""
            return try await handleOcr(dataUri: dataUri)

        case "OCR_TRANSLATE":
            let dataUri = payload["image"]  as? String ?? ""
            let toLang  = payload["toLang"] as? String ?? "zh"
            return try await handleOcrTranslate(dataUri: dataUri, toLang: toLang)

        default:
            return ["error": "unknown type: \(type)"]
        }
    }

    // MARK: - Language Detection

    private func detectLanguage(text: String) -> String {
        let recognizer = NLLanguageRecognizer()
        recognizer.processString(text)
        guard let lang = recognizer.dominantLanguage else { return "und" }
        // NLLanguage uses BCP-47; map a few common codes to match JS expectations
        switch lang.rawValue {
        case "zh-Hans": return "zh"
        case "zh-Hant": return "zh-TW"
        default:        return lang.rawValue
        }
    }

    private func handleDetectLanguage(text: String) -> [String: Any] {
        guard !text.isEmpty else { return ["language": "und", "confidence": 0.0] }
        let recognizer = NLLanguageRecognizer()
        recognizer.processString(text)
        guard let nlLang = recognizer.dominantLanguage else {
            return ["language": "und", "confidence": 0.0]
        }
        let confidence = recognizer.languageHypotheses(withMaximum: 1).values.first ?? 0.0
        let lang: String
        switch nlLang.rawValue {
        case "zh-Hans": lang = "zh"
        case "zh-Hant": lang = "zh-TW"
        default:        lang = nlLang.rawValue
        }
        return ["language": lang, "confidence": confidence]
    }

    // MARK: - Translation Status

    private func handleStatus(fromLang: String, toLang: String) async -> [String: Any] {
        guard #available(macOS 15.0, iOS 18.0, *) else {
            return ["status": "unavailable"]
        }
        let sourceLang = Locale.Language(identifier: normalizedLangCode(fromLang == "auto" ? "en" : fromLang))
        let targetLang = Locale.Language(identifier: normalizedLangCode(toLang))
        let availability = LanguageAvailability()
        let status = await availability.status(from: sourceLang, to: targetLang)
        switch status {
        case .installed:
            return ["status": "available"]
        case .supported:
            // Language pair supported but not yet downloaded — user must go to system settings
            return ["status": "needs-download"]
        default:
            return ["status": "unavailable"]
        }
    }

    // MARK: - Batch Translation

    @available(macOS 26.0, iOS 26.0, *)
    private func doTranslate(texts: [String], fromLang: String, toLang: String) async throws -> [String] {
        let target = Locale.Language(identifier: normalizedLangCode(toLang))
        var ordered = [String](repeating: "", count: texts.count)

        if fromLang == "auto" {
            // Group texts by detected source language, translate each group separately
            var groups: [String: [(index: Int, text: String)]] = [:]
            for (i, text) in texts.enumerated() {
                let lang = detectLanguage(text: text)
                groups[lang, default: []].append((i, text))
            }
            for (langCode, items) in groups {
                let source = Locale.Language(identifier: langCode)
                let session = TranslationSession(installedSource: source, target: target)
                let requests = items.enumerated().map {
                    TranslationSession.Request(sourceText: $0.element.text, clientIdentifier: "\($0.offset)")
                }
                let responses = try await session.translations(from: requests)
                for r in responses {
                    if let localIdx = r.clientIdentifier.flatMap(Int.init), localIdx < items.count {
                        ordered[items[localIdx].index] = r.targetText
                    }
                }
            }
        } else {
            let source = Locale.Language(identifier: fromLang)
            let session = TranslationSession(installedSource: source, target: target)
            let requests = texts.enumerated().map {
                TranslationSession.Request(sourceText: $0.element, clientIdentifier: "\($0.offset)")
            }
            let responses = try await session.translations(from: requests)
            for r in responses {
                if let idx = r.clientIdentifier.flatMap(Int.init), idx < ordered.count {
                    ordered[idx] = r.targetText
                }
            }
        }
        return ordered
    }

    private func handleTranslate(texts: [String], fromLang: String, toLang: String) async throws -> [String: Any] {
        guard #available(macOS 26.0, iOS 26.0, *) else {
            return ["ok": false, "error": "Translation requires macOS 26 / iOS 26"]
        }
        let translations = try await doTranslate(texts: texts, fromLang: fromLang, toLang: toLang)
        return ["ok": true, "translations": translations]
    }

    // MARK: - OCR

    private func recognizeText(in cgImage: CGImage) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            let request = VNRecognizeTextRequest { req, err in
                if let err { continuation.resume(throwing: err); return }
                let text = (req.results as? [VNRecognizedTextObservation] ?? [])
                    .compactMap { $0.topCandidates(1).first?.string }
                    .joined(separator: "\n")
                continuation.resume(returning: text)
            }
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            let handler = VNImageRequestHandler(cgImage: cgImage)
            do    { try handler.perform([request]) }
            catch { continuation.resume(throwing: error) }
        }
    }

    private func cgImage(fromDataUri dataUri: String) -> CGImage? {
        guard let comma = dataUri.firstIndex(of: ",") else { return nil }
        let base64 = String(dataUri[dataUri.index(after: comma)...])
        guard let data = Data(base64Encoded: base64),
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image  = CGImageSourceCreateImageAtIndex(source, 0, nil) else { return nil }
        return image
    }

    private func handleOcr(dataUri: String) async throws -> [String: Any] {
        guard let img = cgImage(fromDataUri: dataUri) else {
            return ["error": "invalid image data"]
        }
        let text = try await recognizeText(in: img)
        guard !text.isEmpty else { return ["error": "no_text"] }
        return ["full": text]
    }

    private func handleOcrTranslate(dataUri: String, toLang: String) async throws -> [String: Any] {
        guard let img = cgImage(fromDataUri: dataUri) else {
            return ["error": "invalid image data"]
        }
        let text = try await recognizeText(in: img)
        guard !text.isEmpty else { return ["error": "no_text"] }
        var result: [String: Any] = ["full": text]
        if #available(macOS 26.0, iOS 26.0, *) {
            if let translated = try? await doTranslate(texts: [text], fromLang: "auto", toLang: toLang).first {
                result["translation"] = translated
            }
        }
        return result
    }

    // MARK: - Helpers

    /// Maps JS-side BCP-47 codes to Apple framework identifiers.
    private func normalizedLangCode(_ code: String) -> String {
        switch code {
        case "zh":    return "zh-Hans"
        case "zh-TW": return "zh-Hant"
        default:      return code
        }
    }

    private func reply(_ context: NSExtensionContext, _ payload: [String: Any]) {
        let item = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            item.userInfo = [SFExtensionMessageKey: payload]
        } else {
            item.userInfo = ["message": payload]
        }
        context.completeRequest(returningItems: [item], completionHandler: nil)
    }
}
