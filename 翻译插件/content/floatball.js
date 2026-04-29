function createFloatBall({ manualMode, onTranslate, initialMode = 'bilingual' }) {
  const POS_KEY = 'bt-ball-pos'

  // Inject styles
  if (!document.getElementById('bt-ball-styles')) {
    const style = document.createElement('style')
    style.id = 'bt-ball-styles'
    style.textContent = `
      #bt-floatball {
        position: fixed !important;
        width: 38px !important;
        height: 38px !important;
        border-radius: 50% !important;
        background: rgba(66, 133, 244, 0.88) !important;
        color: #fff !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        font-family: system-ui, -apple-system, sans-serif !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        cursor: pointer !important;
        z-index: 2147483647 !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.28) !important;
        user-select: none !important;
        transition: opacity 0.15s !important;
        letter-spacing: 0 !important;
        line-height: 1 !important;
        padding: 0 !important;
        margin: 0 !important;
        border: none !important;
        box-sizing: border-box !important;
      }
      #bt-floatball:hover { opacity: 0.82 !important; }
      #bt-floatball[data-state="done"] { background: rgba(52, 168, 83, 0.88) !important; }
      #bt-floatball[data-state="translating"] { background: rgba(66, 133, 244, 0.6) !important; }
    `
    document.head.appendChild(style)
  }

  const ball = document.createElement('div')
  ball.id = 'bt-floatball'

  const saved = (() => { try { return JSON.parse(localStorage.getItem(POS_KEY)) } catch { return null } })()
  ball.style.right = (saved?.right ?? 20) + 'px'
  ball.style.bottom = (saved?.bottom ?? 80) + 'px'

  let state = manualMode ? 'idle' : 'translating'
  let currentMode = initialMode
  // Remember last non-hidden mode so we can restore it when un-hiding
  let lastVisibleMode = (initialMode === 'original-only') ? 'bilingual' : initialMode
  let pointerMoved = false
  let dragStart = null

  const hidden = () => currentMode === 'original-only'

  function render() {
    if (state === 'idle') {
      ball.textContent = '译'
      ball.title = '点击翻译本页'
      ball.dataset.state = 'idle'
    } else if (state === 'translating') {
      ball.textContent = '···'
      ball.title = '翻译中...'
      ball.dataset.state = 'translating'
    } else {
      // done: toggle between showing and hiding translations
      if (hidden()) {
        ball.textContent = '译'
        ball.title = '点击显示译文'
        ball.dataset.state = 'idle'   // blue = hidden
      } else {
        ball.textContent = '双'
        ball.title = '点击隐藏译文'
        ball.dataset.state = 'done'   // green = showing
      }
    }
  }

  render()

  ball.addEventListener('mousedown', e => {
    const rect = ball.getBoundingClientRect()
    dragStart = {
      mx: e.clientX, my: e.clientY,
      right: window.innerWidth - rect.right,
      bottom: window.innerHeight - rect.bottom
    }
    pointerMoved = false
    e.preventDefault()
  })

  document.addEventListener('mousemove', e => {
    if (!dragStart) return
    const dx = e.clientX - dragStart.mx
    const dy = e.clientY - dragStart.my
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) pointerMoved = true
    if (!pointerMoved) return
    const r = Math.max(4, Math.min(window.innerWidth - 42, dragStart.right - dx))
    const b = Math.max(4, Math.min(window.innerHeight - 42, dragStart.bottom - dy))
    ball.style.right = r + 'px'
    ball.style.bottom = b + 'px'
  })

  document.addEventListener('mouseup', () => {
    if (dragStart && pointerMoved) {
      const rect = ball.getBoundingClientRect()
      try {
        localStorage.setItem(POS_KEY, JSON.stringify({
          right: window.innerWidth - rect.right,
          bottom: window.innerHeight - rect.bottom
        }))
      } catch {}
    }
    dragStart = null
  })

  ball.addEventListener('click', () => {
    if (pointerMoved) return
    if (state === 'idle') {
      onTranslate?.()
    } else if (state === 'done') {
      // Toggle: show translations ↔ hide translations (original-only)
      if (hidden()) {
        currentMode = lastVisibleMode
      } else {
        lastVisibleMode = currentMode
        currentMode = 'original-only'
      }
      setDisplayMode(currentMode)
      chrome.storage.local.set({ displayMode: currentMode })
      render()
    }
  })

  document.body.appendChild(ball)

  return {
    setState(s) { state = s; render() },
    // Called when popup changes display mode — keep ball in sync
    setMode(m) {
      currentMode = m
      if (m !== 'original-only') lastVisibleMode = m
      if (state === 'done') render()
    }
  }
}

if (typeof module !== 'undefined') module.exports = { createFloatBall }
