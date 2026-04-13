# Chrome Web Store Review Explanation
## Privado — Bilingual Translator

---

## Overview

Privado is a lightweight, privacy-first bilingual translation extension for Chrome. It enables users to read any webpage in two languages simultaneously (original text + translation side by side), with special support for YouTube video subtitles.

---

## Why We Request `<all_urls>` Permission

### Core Functionality Requirement

Privado's primary purpose is to provide **universal bilingual translation across the entire web**. Users should be able to:

1. **Access any website** and instantly see bilingual content
2. **View translated YouTube subtitles** on any video
3. **Read translated Reddit/forum posts** in their preferred language
4. **Translate any academic paper, news article, or blog** without artificial restrictions

Restricting to a hardcoded list of domains (e.g., only Wikipedia, Reddit, YouTube) would:
- Break core functionality for 99% of other websites
- Force users to manually configure each domain
- Defeat the "zero-config, works out of the box" design goal
- Violate user trust (they installed a "universal translator," not a "translator for 5 websites")

### Technical Architecture

The extension uses a **TextNode Walker** approach:
1. Scans visible page content for translatable text blocks (≥20 characters, non-CJK-dominant)
2. Filters out navigation, headers, footers, ads, and code blocks
3. Sends only meaningful paragraph text to translation backend
4. Injects translated text as sibling elements below originals

This architecture is **deliberately generic** — it doesn't know or care what domain it's on. It works equally on Wikipedia, Medium blogs, GitHub documentation, or any other text-heavy site.

---

## Data Privacy & Security

### What We Collect: Nothing

Privado **does not collect, log, or transmit any personal user data**:
- ✗ No user tracking
- ✗ No browsing history
- ✗ No analytics or telemetry
- ✗ No form data or passwords
- ✗ No IP logging

All settings are stored locally in `chrome.storage.local` (on-device only).

### How Text Is Handled

Depending on the translation mode user selects:

**Local Mode (Chrome AI / Gemini Nano):**
- Text is processed entirely on the device
- Zero data transmission
- Requires Chrome 138+ on supported hardware

**Machine Mode (Free Fallback):**
- Text is sent to `translate.googleapis.com` (Google's public translation API)
- Subject to [Google's Privacy Policy](https://policies.google.com/privacy)
- No intermediary — we don't proxy or log these requests

**API Key Mode:**
- Text is sent directly to user's chosen provider (DeepL, OpenAI, Google Gemini, custom)
- API key is stored locally and never touches our servers
- Provider selection is entirely user-controlled

### Why We Read Page Content

The extension reads visible text **only to translate it**. It does NOT:
- ✗ Read password fields
- ✗ Read form submissions
- ✗ Monitor user input
- ✗ Extract personal information
- ✗ Log or transmit any data beyond translation

The `<all_urls>` permission exists solely to inject the translation UI. We filter aggressively (skipping navigation, footers, ads, code) to avoid cluttering the page.

---

## User Control & Transparency

### Per-Site Disable

Users can disable translation for any site via the popup menu — a persistent list maintained in storage.local.

### Clear Data Handling

The privacy policy (linked in extension pages) explicitly explains:
- Which APIs are contacted and under what conditions
- What data persists locally and what is ephemeral
- How to audit/disable each mode
- Third-party privacy policies (Google, etc.)

### Open Source

Privado is **MIT-licensed open source**. The code is fully auditable at:
https://github.com/wanqianwin-jpg/Privado-Bilingual-Translator

Users can verify our claims by reviewing the source, and security researchers can audit the codebase.

---

## Comparison to Similar Extensions

Leading bilingual translation extensions (Immersive Translate, DeepL, Google Translate) all request `<all_urls>` or equivalent broad permissions for the same reason: universal webpage translation is the core feature.

---

## Risk Mitigation

1. **Minimal Permission Surface**
   - Only 4 permissions: `<all_urls>`, `storage`, `scripting`, `activeTab`
   - No injected scripts from external sources
   - No network requests except translation APIs (user-chosen)

2. **Code Transparency**
   - Fully open-source with MIT license
   - No obfuscation or dynamic code injection
   - Simple, auditable architecture

3. **Strong Privacy Defaults**
   - Local-first: Gemini Nano (on Chrome 138+) is the default mode
   - No telemetry or analytics
   - No account system or third-party tracking

4. **User Agency**
   - Users choose their translation provider
   - Users can disable per-site via popup
   - Users control caching and API key storage

---

## Commitment to Responsible Use

We affirm that Privado:
- Does not collect or transmit personal user data
- Does not use `<all_urls>` access for any purpose other than bilingual translation
- Does not sell, share, or misuse user information
- Will maintain these commitments in future updates

---

## Contact

For questions or to discuss this extension further:
- GitHub Issues: https://github.com/wanqianwin-jpg/Privado-Bilingual-Translator/issues
- Privacy Policy: https://wanqianwin-jpg.github.io/Privado-Bilingual-Translator/privacy.html

---

**Submitted:** April 2026
