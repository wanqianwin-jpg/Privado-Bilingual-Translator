const PRIVACY_MODES = new Set(['chrome-local', 'apple-npu'])

async function init() {
  const [chromeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  let host = ''
  try { host = new URL(chromeTab.url).hostname } catch {}

  const stored = await chrome.storage.local.get([
    'siteSettings', 'displayMode', 'targetLang', 'translateMode', 'apiEnabled'
  ])
  const { siteSettings = {}, displayMode = 'bilingual', targetLang = 'zh' } = stored

  // Migration: 'privacy' → 'chrome-local', old apiEnabled → translateMode
  let savedMode = stored.translateMode === 'privacy' ? 'chrome-local' : stored.translateMode
  if (!savedMode) savedMode = stored.apiEnabled ? 'api' : 'machine'

  let pendingMode = savedMode  // what's visually selected, not yet applied

  // ── 静态元素引用 ──────────────────────────────────────────────────────────────

  const modeItems   = document.querySelectorAll('.mode-item')
  const privacySub  = document.getElementById('privacy-sub')
  const subOptions  = document.querySelectorAll('.sub-option')
  const applyBtn    = document.getElementById('apply-btn')
  const apiLink     = document.getElementById('api-link')
  const siteLabel   = document.getElementById('site-label')

  // ── 网站名称 ──────────────────────────────────────────────────────────────────

  document.getElementById('site').textContent = host
  siteLabel.textContent = host ? `翻译 ${host}` : '翻译此网站'

  // ── 渲染模式选中状态 ──────────────────────────────────────────────────────────

  function renderMode(mode) {
    const isPrivacy = PRIVACY_MODES.has(mode)
    const groupMode = isPrivacy ? 'privacy' : mode

    modeItems.forEach(btn => {
      const bm = btn.dataset.mode || btn.dataset.modeGroup
      btn.classList.toggle('selected', bm === groupMode)
    })

    privacySub.classList.toggle('open', isPrivacy)

    if (isPrivacy) {
      subOptions.forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.sub === mode)
      })
      runDetection(targetLang)
    }

    apiLink.classList.toggle('visible', mode === 'api')

    // 应用按钮：只在有待定变更时出现
    applyBtn.classList.toggle('visible', mode !== savedMode)
  }

  renderMode(pendingMode)

  // ── 模式卡片点击 ──────────────────────────────────────────────────────────────

  modeItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const clicked = btn.dataset.mode || btn.dataset.modeGroup
      if (clicked === 'privacy') {
        // 展开隐私子选项，默认选 chrome-local（或保持已有选择）
        pendingMode = PRIVACY_MODES.has(pendingMode) ? pendingMode : 'chrome-local'
      } else {
        pendingMode = clicked
      }
      renderMode(pendingMode)
    })
  })

  // ── 隐私子引擎选择 ────────────────────────────────────────────────────────────

  subOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      pendingMode = opt.dataset.sub
      renderMode(pendingMode)
    })
  })

  // ── 应用按钮：保存并刷新 ──────────────────────────────────────────────────────

  applyBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({ translateMode: pendingMode })
    chrome.tabs.reload(chromeTab.id)
    window.close()
  })

  // ── API Key 链接 ──────────────────────────────────────────────────────────────

  apiLink.addEventListener('click', e => {
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
  langSel.addEventListener('change', async e => {
    await chrome.storage.local.set({ targetLang: e.target.value })
    chrome.tabs.reload(chromeTab.id)
  })

  // ── 显示模式 ──────────────────────────────────────────────────────────────────

  const modeSel = document.getElementById('display-mode')
  modeSel.value = displayMode
  modeSel.addEventListener('change', async e => {
    const mode = e.target.value
    await chrome.storage.local.set({ displayMode: mode })
    chrome.scripting.executeScript({
      target: { tabId: chromeTab.id },
      func: m => setDisplayMode(m),
      args: [mode]
    })
  })
}

// ── 隐私引擎检测 ──────────────────────────────────────────────────────────────

let detectionRan = false
async function runDetection(targetLang) {
  if (detectionRan) return
  detectionRan = true
  detectChrome(targetLang)
  detectAppleNpu()
}

async function detectChrome(targetLang) {
  const el = document.getElementById('status-chrome')
  if (!('Translator' in self)) { setStatus(el, 'err', '不支持'); return }
  try {
    const r = await Translator.availability({ sourceLanguage: 'en', targetLanguage: targetLang })
    if (r === 'available')   setStatus(el, 'ok',   '可用')
    else if (r === 'downloading') setStatus(el, 'warn', '下载中')
    else                     setStatus(el, 'err',  '不可用')
  } catch { setStatus(el, 'err', '检测失败') }
}

async function detectAppleNpu() {
  const el = document.getElementById('status-apple')
  try {
    const res = await fetch('http://localhost:57312/ping', { signal: AbortSignal.timeout(1500) })
    res.ok ? setStatus(el, 'ok', '已连接') : setStatus(el, 'err', '未运行')
  } catch { setStatus(el, 'err', '未运行') }
}

function setStatus(el, type, text) {
  el.textContent = text
  el.className = `sub-status${type !== 'normal' ? ' ' + type : ''}`
}

init()
