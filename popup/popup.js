function renderToggleButton(wrap, paused, tab) {
  // Remove existing button if present
  while (wrap.firstChild) wrap.removeChild(wrap.firstChild)

  const btn = document.createElement('button')
  btn.textContent = paused ? '翻译本页' : '停止翻译'
  btn.className = 'bt-toggle ' + (paused ? 'bt-start' : 'bt-stop')
  btn.addEventListener('click', () => {
    chrome.tabs.sendMessage(tab.id, { type: 'BT_TOGGLE_PAUSE' }, (res) => {
      if (chrome.runtime.lastError) return
      renderToggleButton(wrap, res.paused, tab)
    })
  })
  wrap.appendChild(btn)
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  let host = ''
  try { host = new URL(tab.url).hostname } catch {}

  // Render pause/resume toggle (per-tab, session only)
  const toggleWrap = document.getElementById('toggle-wrap')
  chrome.tabs.sendMessage(tab.id, { type: 'BT_GET_STATUS' }, (res) => {
    const paused = chrome.runtime.lastError ? false : (res?.paused ?? false)
    renderToggleButton(toggleWrap, paused, tab)
  })

  document.getElementById('site').textContent = host

  const { siteSettings = {}, displayMode = 'bilingual', targetLang = 'zh' }
    = await chrome.storage.local.get(['siteSettings', 'displayMode', 'targetLang'])

  document.getElementById('site-setting').value = siteSettings[host] || 'auto'
  document.getElementById('display-mode').value = displayMode
  document.getElementById('target-lang').value = targetLang

  document.getElementById('site-setting').addEventListener('change', async (e) => {
    const updated = { ...siteSettings, [host]: e.target.value }
    await chrome.storage.local.set({ siteSettings: updated })
    chrome.tabs.reload(tab.id)
  })

  document.getElementById('display-mode').addEventListener('change', async (e) => {
    const mode = e.target.value
    await chrome.storage.local.set({ displayMode: mode })
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (m) => setDisplayMode(m),
      args: [mode]
    })
  })

  document.getElementById('target-lang').addEventListener('change', async (e) => {
    await chrome.storage.local.set({ targetLang: e.target.value })
    chrome.tabs.reload(tab.id)
  })

  document.getElementById('options-link').addEventListener('click', (e) => {
    e.preventDefault()
    chrome.runtime.openOptionsPage()
  })
}

init()
