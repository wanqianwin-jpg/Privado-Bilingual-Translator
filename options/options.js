async function init() {
  const { userApiConfig = null, enableCache = false }
    = await chrome.storage.local.get(['userApiConfig', 'enableCache'])

  document.getElementById('api-provider').value = userApiConfig?.provider || ''
  document.getElementById('api-key').value = userApiConfig?.key || ''
  document.getElementById('enable-cache').checked = enableCache

  document.getElementById('save').addEventListener('click', async () => {
    const provider = document.getElementById('api-provider').value
    const key = document.getElementById('api-key').value.trim()
    const cache = document.getElementById('enable-cache').checked

    await chrome.storage.local.set({
      userApiConfig: provider && key ? { provider, key } : null,
      enableCache: cache
    })

    const status = document.getElementById('status')
    status.textContent = '已保存'
    setTimeout(() => { status.textContent = '' }, 2000)
  })
}

init()
