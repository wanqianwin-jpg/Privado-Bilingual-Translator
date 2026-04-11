const PRIVACY_MODES = new Set(['chrome-local', 'apple-npu'])

async function init() {
  const [chromeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  let host = ''
  try { host = new URL(chromeTab.url).hostname } catch {}

  const stored = await chrome.storage.local.get([
    'siteSettings', 'displayMode', 'targetLang', 'translateMode', 'apiEnabled'
  ])
  const { siteSettings = {}, displayMode = 'bilingual', targetLang = 'zh' } = stored

  // Migration: privacy → chrome-local, old apiEnabled → translateMode
  let translateMode = stored.translateMode === 'privacy' ? 'chrome-local' : stored.translateMode
  if (!translateMode) translateMode = stored.apiEnabled ? 'api' : 'machine'

  document.getElementById('site').textContent = host

  // ── 三选一模式 ────────────────────────────────────────────────────────────────

  const modeBtns = document.querySelectorAll('.mode-tab')
  const privacyPanel = document.getElementById('privacy-panel')
  const apiPanel = document.getElementById('api-panel')

  function renderMode(mode) {
    const isPrivacy = PRIVACY_MODES.has(mode)
    modeBtns.forEach(btn => {
      const btnMode = btn.dataset.mode || btn.dataset.modeGroup
      btn.classList.toggle('active', btnMode === mode || (btnMode === 'privacy' && isPrivacy))
    })
    privacyPanel.style.display = isPrivacy ? '' : 'none'
    apiPanel.style.display = mode === 'api' ? '' : 'none'

    if (isPrivacy) {
      const radio = privacyPanel.querySelector(`input[value="${mode}"]`)
      if (radio) radio.checked = true
      runDetection(targetLang)
    }
  }

  renderMode(translateMode)

  // 机翻 / API Key 按钮
  modeBtns.forEach(btn => {
    if (!btn.dataset.mode) return  // privacy group button handled separately
    btn.addEventListener('click', async () => {
      translateMode = btn.dataset.mode
      renderMode(translateMode)
      await chrome.storage.local.set({ translateMode })
      chrome.tabs.reload(chromeTab.id)
      window.close()
    })
  })

  // 隐私翻译 tab 按钮 — 展开面板，默认选 chrome-local
  document.querySelector('[data-mode-group="privacy"]').addEventListener('click', async () => {
    if (!PRIVACY_MODES.has(translateMode)) {
      translateMode = 'chrome-local'
      await chrome.storage.local.set({ translateMode })
      chrome.tabs.reload(chromeTab.id)
    }
    renderMode(translateMode)
  })

  // 隐私子引擎单选
  privacyPanel.querySelectorAll('input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', async () => {
      translateMode = radio.value
      await chrome.storage.local.set({ translateMode })
      chrome.tabs.reload(chromeTab.id)
      window.close()
    })
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

// ── 隐私引擎检测（面板打开时自动跑） ─────────────────────────────────────────

async function runDetection(targetLang) {
  detectChrome(targetLang)
  detectAppleNpu()
}

async function detectChrome(targetLang) {
  const el = document.getElementById('status-chrome')
  if (!('Translator' in self)) {
    setStatus(el, 'err', '不支持')
    return
  }
  try {
    const result = await Translator.availability({ sourceLanguage: 'en', targetLanguage: targetLang })
    if (result === 'available') setStatus(el, 'ok', '可用')
    else if (result === 'downloading') setStatus(el, 'warn', '下载中')
    else setStatus(el, 'err', '不可用')
  } catch {
    setStatus(el, 'err', '检测失败')
  }
}

async function detectAppleNpu() {
  const el = document.getElementById('status-apple')
  try {
    const res = await fetch('http://localhost:57312/ping', {
      signal: AbortSignal.timeout(1500)
    })
    if (res.ok) setStatus(el, 'ok', '已连接')
    else setStatus(el, 'err', '未运行')
  } catch {
    setStatus(el, 'err', '未运行')
  }
}

function setStatus(el, type, text) {
  el.textContent = text
  el.className = 'privacy-status' + (type !== 'normal' ? ' ' + type : '')
}

init()
