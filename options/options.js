function setApiFieldsDisabled(disabled) {
  document.getElementById('api-provider').disabled = disabled
  document.getElementById('api-key').disabled = disabled
}

async function init() {
  const { apiEnabled = false, apiProvider = '', apiKey = '', enableCache = false }
    = await chrome.storage.local.get(['apiEnabled', 'apiProvider', 'apiKey', 'enableCache'])

  const apiEnabledEl = document.getElementById('api-enabled')
  apiEnabledEl.checked = apiEnabled
  document.getElementById('api-provider').value = apiProvider
  document.getElementById('api-key').value = apiKey
  document.getElementById('enable-cache').checked = enableCache

  setApiFieldsDisabled(!apiEnabled)

  apiEnabledEl.addEventListener('change', () => {
    setApiFieldsDisabled(!apiEnabledEl.checked)
  })

  document.getElementById('save').addEventListener('click', async () => {
    const enabled = document.getElementById('api-enabled').checked
    const provider = document.getElementById('api-provider').value
    const key = document.getElementById('api-key').value.trim()
    const cache = document.getElementById('enable-cache').checked

    await chrome.storage.local.set({
      apiEnabled: enabled,
      apiProvider: provider,
      apiKey: key,
      enableCache: cache
    })
    await chrome.storage.local.remove('userApiConfig')

    const status = document.getElementById('status')
    status.textContent = '已保存'
    setTimeout(() => { status.textContent = '' }, 2000)
  })
}

init()
