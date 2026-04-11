async function init() {
  const [chromeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  let host = ''
  try { host = new URL(chromeTab.url).hostname } catch {}

  const stored = await chrome.storage.local.get([
    'siteSettings', 'displayMode', 'targetLang', 'translateMode', 'apiEnabled'
  ])
  const { siteSettings = {}, displayMode = 'bilingual', targetLang = 'zh' } = stored

  // Migration: old apiEnabled boolean → translateMode enum
  let translateMode = stored.translateMode
  if (!translateMode) {
    translateMode = stored.apiEnabled ? 'api' : 'machine'
  }

  document.getElementById('site').textContent = host

  // ── 三选一模式 ────────────────────────────────────────────────────────────────

  const modeBtns = document.querySelectorAll('.mode-tab')
  const privacyPanel = document.getElementById('privacy-panel')
  const apiPanel = document.getElementById('api-panel')

  function renderMode(mode) {
    modeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode))
    privacyPanel.style.display = mode === 'privacy' ? '' : 'none'
    apiPanel.style.display = mode === 'api' ? '' : 'none'
  }

  renderMode(translateMode)

  modeBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      translateMode = btn.dataset.mode
      renderMode(translateMode)
      await chrome.storage.local.set({ translateMode })
      chrome.tabs.reload(chromeTab.id)
      window.close()
    })
  })

  // ── 隐私翻译检测 ──────────────────────────────────────────────────────────────

  document.getElementById('detect-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('detect-status')
    statusEl.style.color = '#888'
    statusEl.textContent = '检测中…'

    // Chrome Translator API (Gemini Nano)
    if ('Translator' in self) {
      try {
        const result = await Translator.availability({ sourceLanguage: 'en', targetLanguage: targetLang })
        if (result === 'available') {
          statusEl.style.color = '#0a7d0a'
          statusEl.textContent = '✓ Chrome 本地模型可用'
          return
        }
        if (result === 'downloading') {
          statusEl.style.color = '#f09d00'
          statusEl.textContent = '⏳ Chrome 模型下载中…'
          return
        }
      } catch {}
    }

    // SnapFocus 本地 NPU
    try {
      const res = await fetch('http://localhost:57312/ping', {
        signal: AbortSignal.timeout(1500)
      })
      if (res.ok) {
        statusEl.style.color = '#0a7d0a'
        statusEl.textContent = '✓ SnapFocus 本地引擎可用'
        return
      }
    } catch {}

    statusEl.style.color = '#c00'
    statusEl.textContent = '✗ 当前设备不支持隐私翻译'
  })

  // ── API Key 设置入口 ───────────────────────────────────────────────────────────

  document.getElementById('options-link').addEventListener('click', (e) => {
    e.preventDefault()
    chrome.runtime.openOptionsPage()
  })

  // ── 网站开关 ──────────────────────────────────────────────────────────────────

  const siteToggle = document.getElementById('site-toggle')
  siteToggle.checked = siteSettings[host] !== 'never'
  siteToggle.addEventListener('change', async () => {
    const updated = { ...siteSettings }
    if (siteToggle.checked) delete updated[host]
    else updated[host] = 'never'
    await chrome.storage.local.set({ siteSettings: updated })
    chrome.tabs.reload(chromeTab.id)
    window.close()
  })

  // ── 目标语言 ──────────────────────────────────────────────────────────────────

  const langSel = document.getElementById('target-lang')
  langSel.value = targetLang
  langSel.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ targetLang: e.target.value })
    chrome.tabs.reload(chromeTab.id)
  })

  // ── 显示模式 ──────────────────────────────────────────────────────────────────

  const modeSel = document.getElementById('display-mode')
  modeSel.value = displayMode
  modeSel.addEventListener('change', async (e) => {
    const mode = e.target.value
    await chrome.storage.local.set({ displayMode: mode })
    chrome.scripting.executeScript({
      target: { tabId: chromeTab.id },
      func: (m) => setDisplayMode(m),
      args: [mode]
    })
  })
}

init()
