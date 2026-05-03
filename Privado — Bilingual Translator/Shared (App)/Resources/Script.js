// ── i18n ─────────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    tagline:              'Bilingual translation. On-device. Private.',
    extensionTitle:       'Safari Extension',
    extEnabled:           'Enabled',
    extDisabled:          'Disabled',
    extUnknown:           'Not detected',
    translationTitle:     'On-Device Translation',
    transAvailable:       'Ready',
    transNeedsDownload:   'Language pack missing',
    transNeedsDownloadHint: 'Settings → General → Language & Region → Translation Languages',
    transNeedsMacOS:      'Requires macOS 26',
    transNeedsMacOSHint:  'Available after upgrading to macOS 26',
    transUnavailable:     'Not supported',
    transChecking:        'Checking…',
    openSettings:         'Open Safari Settings',
    downloadLangPack:     'Open Language Settings',
    iosInstructions:      'Settings → Safari → Extensions → Privado',
    privacy:              'Privacy Policy',
  },
  zh: {
    tagline:              '双语对照翻译，本地处理，隐私优先。',
    extensionTitle:       'Safari 扩展',
    extEnabled:           '已启用',
    extDisabled:          '已停用',
    extUnknown:           '未检测到',
    translationTitle:     '本地翻译引擎',
    transAvailable:       '已就绪',
    transNeedsDownload:   '语言包未安装',
    transNeedsDownloadHint: '系统设置 → 通用 → 语言与地区 → 翻译语言',
    transNeedsMacOS:      '需要 macOS 26',
    transNeedsMacOSHint:  '升级到 macOS 26 后可启用本地翻译',
    transUnavailable:     '此设备不支持',
    transChecking:        '检测中…',
    openSettings:         '打开 Safari 设置',
    downloadLangPack:     '打开语言设置',
    iosInstructions:      '设置 → Safari → 扩展 → Privado',
    privacy:              '隐私政策',
  },
  'zh-TW': {
    tagline:              '雙語對照翻譯，本地處理，隱私優先。',
    extensionTitle:       'Safari 擴充功能',
    extEnabled:           '已啟用',
    extDisabled:          '已停用',
    extUnknown:           '未偵測到',
    translationTitle:     '本地翻譯引擎',
    transAvailable:       '已就緒',
    transNeedsDownload:   '語言包未安裝',
    transNeedsDownloadHint: '系統設定 → 一般 → 語言與地區 → 翻譯語言',
    transNeedsMacOS:      '需要 macOS 26',
    transNeedsMacOSHint:  '升級到 macOS 26 後可啟用本地翻譯',
    transUnavailable:     '此裝置不支援',
    transChecking:        '偵測中…',
    openSettings:         '開啟 Safari 設定',
    downloadLangPack:     '開啟語言設定',
    iosInstructions:      '設定 → Safari → 擴充功能 → Privado',
    privacy:              '隱私權政策',
  },
  fr: {
    tagline:              'Traduction bilingue. En local. Privée.',
    extensionTitle:       'Extension Safari',
    extEnabled:           'Activée',
    extDisabled:          'Désactivée',
    extUnknown:           'Non détectée',
    translationTitle:     'Traduction locale',
    transAvailable:       'Prête',
    transNeedsDownload:   'Pack de langue manquant',
    transNeedsDownloadHint: 'Réglages → Général → Langue et région → Langues de traduction',
    transNeedsMacOS:      'Requiert macOS 26',
    transNeedsMacOSHint:  'Disponible après la mise à jour vers macOS 26',
    transUnavailable:     'Non pris en charge',
    transChecking:        'Vérification…',
    openSettings:         'Ouvrir les réglages Safari',
    downloadLangPack:     'Ouvrir les réglages de langue',
    iosInstructions:      'Réglages → Safari → Extensions → Privado',
    privacy:              'Politique de confidentialité',
  },
  de: {
    tagline:              'Zweisprachige Übersetzung. Lokal. Privat.',
    extensionTitle:       'Safari-Erweiterung',
    extEnabled:           'Aktiviert',
    extDisabled:          'Deaktiviert',
    extUnknown:           'Nicht erkannt',
    translationTitle:     'Lokale Übersetzung',
    transAvailable:       'Bereit',
    transNeedsDownload:   'Sprachpaket fehlt',
    transNeedsDownloadHint: 'Systemeinstellungen → Allgemein → Sprache & Region → Übersetzungssprachen',
    transNeedsMacOS:      'Erfordert macOS 26',
    transNeedsMacOSHint:  'Verfügbar nach dem Upgrade auf macOS 26',
    transUnavailable:     'Nicht unterstützt',
    transChecking:        'Prüfen…',
    openSettings:         'Safari-Einstellungen öffnen',
    downloadLangPack:     'Spracheinstellungen öffnen',
    iosInstructions:      'Einstellungen → Safari → Erweiterungen → Privado',
    privacy:              'Datenschutzrichtlinie',
  },
  es: {
    tagline:              'Traducción bilingüe. Local. Privada.',
    extensionTitle:       'Extensión de Safari',
    extEnabled:           'Activada',
    extDisabled:          'Desactivada',
    extUnknown:           'No detectada',
    translationTitle:     'Traducción local',
    transAvailable:       'Lista',
    transNeedsDownload:   'Paquete de idioma no instalado',
    transNeedsDownloadHint: 'Ajustes → General → Idioma y región → Idiomas de traducción',
    transNeedsMacOS:      'Requiere macOS 26',
    transNeedsMacOSHint:  'Disponible tras actualizar a macOS 26',
    transUnavailable:     'No compatible',
    transChecking:        'Comprobando…',
    openSettings:         'Abrir ajustes de Safari',
    downloadLangPack:     'Abrir ajustes de idioma',
    iosInstructions:      'Ajustes → Safari → Extensiones → Privado',
    privacy:              'Política de privacidad',
  },
  it: {
    tagline:              'Traduzione bilingue. In locale. Privata.',
    extensionTitle:       'Estensione Safari',
    extEnabled:           'Attiva',
    extDisabled:          'Disattiva',
    extUnknown:           'Non rilevata',
    translationTitle:     'Traduzione locale',
    transAvailable:       'Pronta',
    transNeedsDownload:   'Pacchetto lingua mancante',
    transNeedsDownloadHint: 'Impostazioni → Generali → Lingua e area geografica → Lingue di traduzione',
    transNeedsMacOS:      'Richiede macOS 26',
    transNeedsMacOSHint:  'Disponibile dopo l\'aggiornamento a macOS 26',
    transUnavailable:     'Non supportata',
    transChecking:        'Verifica…',
    openSettings:         'Apri impostazioni Safari',
    downloadLangPack:     'Apri impostazioni lingua',
    iosInstructions:      'Impostazioni → Safari → Estensioni → Privado',
    privacy:              'Informativa sulla privacy',
  },
}

function getStrings() {
  const lang = (navigator.language || 'en').replace('_', '-')
  if (lang.startsWith('zh-Hant') || lang === 'zh-TW' || lang === 'zh-HK') return STRINGS['zh-TW']
  if (lang.startsWith('zh')) return STRINGS.zh
  const base = lang.split('-')[0]
  return STRINGS[base] || STRINGS.en
}

// ── Apply strings ─────────────────────────────────────────────────────────────

let S = getStrings()

function applyStrings() {
  document.querySelectorAll('[data-str]').forEach(el => {
    const v = S[el.dataset.str]
    if (v != null) el.textContent = v
  })
}

// ── Translation status ────────────────────────────────────────────────────────

function setTranslationStatus(status) {
  const dot    = document.getElementById('dot-trans')
  const txt    = document.getElementById('txt-trans')
  const hint   = document.getElementById('txt-trans-hint')
  const action = document.getElementById('action-trans')
  const btn    = document.getElementById('btn-lang')

  dot.dataset.state = status

  switch (status) {
    case 'available':
      txt.textContent  = S.transAvailable
      hint.textContent = ''
      action.hidden    = true
      break
    case 'needs-download':
      txt.textContent  = S.transNeedsDownload
      hint.textContent = S.transNeedsDownloadHint
      btn.textContent  = S.downloadLangPack
      action.hidden    = false
      btn.onclick = () => {
        try { webkit.messageHandlers.controller.postMessage('open-language-settings') } catch(e) {}
      }
      break
    case 'needs-macos-26':
      txt.textContent  = S.transNeedsMacOS
      hint.textContent = S.transNeedsMacOSHint
      action.hidden    = true
      break
    default:
      txt.textContent  = S.transUnavailable
      hint.textContent = ''
      action.hidden    = true
  }
}

// ── Main entry point (called from Swift) ─────────────────────────────────────

function show(platform, enabled, useSettingsInsteadOfPreferences) {
  S = getStrings()
  applyStrings()

  document.body.dataset.platform = platform

  const dotExt = document.getElementById('dot-ext')
  const txtExt = document.getElementById('txt-ext')

  if (platform === 'mac') {
    if (typeof enabled === 'boolean') {
      dotExt.dataset.state = enabled ? 'on' : 'off'
      txtExt.textContent   = enabled ? S.extEnabled : S.extDisabled
    } else {
      dotExt.dataset.state = 'unknown'
      txtExt.textContent   = S.extUnknown
    }

    // Check translation status via Swift
    try {
      webkit.messageHandlers.controller.postMessage({ type: 'check-translation-status' })
    } catch(e) {
      setTranslationStatus('unavailable')
    }
  }

  if (platform === 'ios') {
    dotExt.dataset.state = 'unknown'
    txtExt.textContent   = ''
    try {
      webkit.messageHandlers.controller.postMessage({ type: 'check-translation-status' })
    } catch(e) {
      setTranslationStatus('unavailable')
    }
  }
}

// ── Button wiring ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  applyStrings()

  document.getElementById('btn-prefs').addEventListener('click', () => {
    try { webkit.messageHandlers.controller.postMessage('open-preferences') } catch(e) {}
  })

  // Privacy policy link — update href once GitHub Pages is live
  document.getElementById('link-privacy').addEventListener('click', e => {
    e.preventDefault()
    try { webkit.messageHandlers.controller.postMessage('open-privacy-policy') } catch(e) {}
  })
})
