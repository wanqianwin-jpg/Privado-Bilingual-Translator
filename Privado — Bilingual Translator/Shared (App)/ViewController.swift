//
//  ViewController.swift
//  Shared (App)
//
//  Created by qian wan on 2026/4/14.
//

import WebKit
import Translation

#if os(iOS)
import UIKit
typealias PlatformViewController = UIViewController
#elseif os(macOS)
import Cocoa
import SafariServices
typealias PlatformViewController = NSViewController
#endif

let extensionBundleIdentifier = "com.wanqian.privado.extension"

class ViewController: PlatformViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

#if os(iOS)
        self.webView.scrollView.isScrollEnabled = false
#endif

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
#if os(iOS)
        webView.evaluateJavaScript("show('ios')")
#elseif os(macOS)
        webView.evaluateJavaScript("show('mac')")

        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            guard let state = state, error == nil else {
                // Insert code to inform the user that something went wrong.
                return
            }

            DispatchQueue.main.async {
                if #available(macOS 13, *) {
                    webView.evaluateJavaScript("show('mac', \(state.isEnabled), true)")
                } else {
                    webView.evaluateJavaScript("show('mac', \(state.isEnabled), false)")
                }
            }
        }
#endif
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        // Dict messages (check-translation-status, etc.)
        if let dict = message.body as? [String: Any],
           let type = dict["type"] as? String {
            if type == "check-translation-status" {
                Task {
                    let status = await self.checkTranslationStatus()
                    await MainActor.run {
                        self.webView.evaluateJavaScript("setTranslationStatus('\(status)')") { _, _ in }
                    }
                }
            }
            return
        }

        // String messages
        guard let cmd = message.body as? String else { return }

#if os(macOS)
        switch cmd {
        case "open-preferences":
            SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
                guard error == nil else { return }
                DispatchQueue.main.async { NSApp.terminate(self) }
            }
        case "open-language-settings":
            if let url = URL(string: "x-apple.systempreferences:com.apple.preference.LanguageRegion") {
                NSWorkspace.shared.open(url)
            }
        case "open-privacy-policy":
            // TODO: replace with GitHub Pages URL once live
            break
        default:
            break
        }
#endif
    }

    private func checkTranslationStatus() async -> String {
        guard #available(macOS 26.0, iOS 26.0, *) else {
            return "needs-macos-26"
        }
        if #available(macOS 15.0, iOS 18.0, *) {
            let availability = LanguageAvailability()
            let status = await availability.status(
                from: Locale.Language(identifier: "en"),
                to: Locale.Language(identifier: "zh-Hans")
            )
            switch status {
            case .installed: return "available"
            case .supported: return "needs-download"
            default:         return "unavailable"
            }
        }
        return "unavailable"
    }

}
