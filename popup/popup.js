function renderToggleButton(wrap, paused, tab) {
  // Remove existing button if present
  while (wrap.firstChild) wrap.removeChild(wrap.firstChild)

  const btn = document.createElement('button')
  btn.textContent = paused ? '翻译本页' : '停止翻译'
  btn.className = 'bt-toggle ' + (paused ? 'bt-start' : 'bt-stop')
  btn.addEventListener('click', () => {
    btn.disabled = true
    chrome.tabs.sendMessage(tab.id, { type: 'BT_TOGGLE_PAUSE' }, (res) => {
      if (chrome.runtime.lastError) { btn.disabled = false; return }
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
    if (chrome.runtime.lastError || !res) {
      const label = document.createElement('div')
      label.className = 'bt-toggle bt-unavailable'
      label.textContent = '此页面不支持翻译'
      label.style.cssText = 'color:#999;font-size:13px;text-align:center;padding:10px 0;'
      toggleWrap.appendChild(label)
      return
    }
    renderToggleButton(toggleWrap, res.paused, tab)
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
