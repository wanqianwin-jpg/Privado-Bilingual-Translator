async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  let host = ''
  try { host = new URL(tab.url).hostname } catch {}

  const { siteSettings = {}, displayMode = 'bilingual', targetLang = 'zh', apiEnabled = false, apiModel = '', apiProvider = '' }
    = await chrome.storage.local.get(['siteSettings', 'displayMode', 'targetLang', 'apiEnabled', 'apiModel', 'apiProvider'])

  document.getElementById('site').textContent = host

  // API toggle
  const apiToggle = document.getElementById('api-toggle')
  const apiModelDisplay = document.getElementById('api-model-display')
  apiToggle.checked = apiEnabled
  apiModelDisplay.textContent = apiEnabled ? (apiModel || apiProvider || '') : ''

  apiToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ apiEnabled: apiToggle.checked })
    chrome.tabs.reload(tab.id)
    window.close()
  })

  // Site toggle
  const siteToggle = document.getElementById('site-toggle')
  siteToggle.checked = siteSettings[host] !== 'never'
  siteToggle.addEventListener('change', async () => {
    const updated = { ...siteSettings }
    if (siteToggle.checked) delete updated[host]
    else updated[host] = 'never'
    await chrome.storage.local.set({ siteSettings: updated })
    chrome.tabs.reload(tab.id)
    window.close()
  })

  // Target language
  const langSel = document.getElementById('target-lang')
  langSel.value = targetLang
  langSel.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ targetLang: e.target.value })
    chrome.tabs.reload(tab.id)
  })

  // Display mode
  const modeSel = document.getElementById('display-mode')
  modeSel.value = displayMode
  modeSel.addEventListener('change', async (e) => {
    const mode = e.target.value
    await chrome.storage.local.set({ displayMode: mode })
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (m) => setDisplayMode(m),
      args: [mode]
    })
  })

  document.getElementById('options-link').addEventListener('click', (e) => {
    e.preventDefault()
    chrome.runtime.openOptionsPage()
  })
}

init()
