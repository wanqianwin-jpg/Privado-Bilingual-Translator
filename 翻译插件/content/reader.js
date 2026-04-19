;(function () {
  const i18n = (key) => chrome.i18n.getMessage(key)

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'READ_ALOUD') handleReadAloud(msg.text)
    if (msg.type === 'STOP_READING') stopReading()
  })

  async function handleReadAloud(providedText) {
    const text = providedText || window.getSelection()?.toString().trim()
    if (!text) return

    if (!window.speechSynthesis) {
      showToast(i18n('readAloudUnavailable'), 4000)
      return
    }

    stopReading()

    const utterance = new SpeechSynthesisUtterance(text)

    if (chrome.i18n?.detectLanguage) {
      chrome.i18n.detectLanguage(text, ({ languages } = {}) => {
        const top = languages?.[0]
        if (top?.language && top.percentage > 50) utterance.lang = top.language
        speak(utterance)
      })
    } else {
      speak(utterance)
    }
  }

  function speak(utterance) {
    showStopBar()
    utterance.onend = cleanup
    utterance.onerror = cleanup
    window.speechSynthesis.speak(utterance)
  }

  function stopReading() {
    window.speechSynthesis?.cancel()
    cleanup()
  }

  function cleanup() {
    document.getElementById('bt-read-stop')?.remove()
  }

  function showStopBar() {
    cleanup()

    const bar = document.createElement('div')
    bar.id = 'bt-read-stop'
    bar.style.cssText = [
      'position:fixed', 'bottom:20px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:2147483647', 'background:#1e1e1e', 'color:#f0f0f0',
      'padding:8px 16px', 'border-radius:20px',
      'font-size:13px', 'font-family:system-ui',
      'display:flex', 'align-items:center', 'gap:10px',
      'box-shadow:0 4px 16px rgba(0,0,0,0.35)'
    ].join(';')

    const label = document.createElement('span')
    label.textContent = i18n('readAloudReading')

    const btn = document.createElement('button')
    btn.textContent = i18n('readAloudStop')
    btn.style.cssText = 'background:#ff3b30;color:#fff;border:none;border-radius:10px;padding:3px 10px;cursor:pointer;font-size:12px'
    btn.addEventListener('click', stopReading)

    bar.append(label, btn)
    document.body.appendChild(bar)
  }

  function showToast(message, duration) {
    const el = document.createElement('div')
    el.style.cssText = [
      'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
      'background:#333', 'color:#fff', 'padding:10px 14px', 'border-radius:6px',
      'font-size:13px', 'font-family:system-ui'
    ].join(';')
    el.textContent = message
    document.body.appendChild(el)
    if (duration > 0) setTimeout(() => el.remove(), duration)
    return el
  }
})()
