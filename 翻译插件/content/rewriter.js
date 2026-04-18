;(function () {
  const i18n = (key) => chrome.i18n.getMessage(key)

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'REWRITE_SELECTION') return
    handleRewrite(msg.text, msg.targetLang)
  })

  async function handleRewrite(providedText, targetLang) {
    const active = document.activeElement
    const isEditable = active && (
      active.tagName === 'TEXTAREA' ||
      (active.tagName === 'INPUT' && active.type === 'text') ||
      active.isContentEditable
    )

    const text = providedText || (isEditable ? getEditableText(active) : null)
    if (!text?.trim()) return

    if (typeof ai === 'undefined' || !ai.languageModel) {
      showRewriteToast(i18n('rewriteUnavailable'), 4000)
      return
    }

    const toast = showRewriteToast(i18n('rewriteWorking'), 0)

    let session
    try {
      const langName = new Intl.DisplayNames(['en'], { type: 'language' }).of(targetLang) || targetLang
      session = await ai.languageModel.create({
        systemPrompt: `You are a writing assistant. Rewrite the user's input in fluent ${langName}. Output only the rewritten text with no explanation.`
      })
      const result = await session.prompt(text)
      toast.remove()

      if (isEditable && active.isConnected) {
        setEditableText(active, result)
        showRestoreBar(active, text)
      } else if (providedText) {
        showRewriteToast(result, 8000)
      }
    } catch (e) {
      toast.remove()
      showRewriteToast('⚠ ' + (e.message || i18n('rewriteFailed')), 4000)
    } finally {
      session?.destroy()
    }
  }

  function getEditableText(el) {
    return el.isContentEditable ? el.innerText : el.value
  }

  function setEditableText(el, text) {
    if (el.isContentEditable) {
      el.innerText = text
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    } else {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      if (nativeSetter) nativeSetter.call(el, text)
      else el.value = text
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }

  function showRestoreBar(anchor, original) {
    document.getElementById('bt-rewrite-restore')?.remove()

    const bar = document.createElement('div')
    bar.id = 'bt-rewrite-restore'
    bar.style.cssText = [
      'display:flex', 'align-items:center', 'gap:8px',
      'margin-top:4px', 'font-size:12px', 'font-family:system-ui',
      'color:#888'
    ].join(';')

    const label = document.createElement('span')
    label.textContent = i18n('rewriteRestoreLabel') + ' ' + original.slice(0, 60) + (original.length > 60 ? '…' : '')

    const btn = document.createElement('button')
    btn.textContent = i18n('rewriteRestoreBtn')
    btn.style.cssText = 'background:transparent;border:1px solid #ccc;border-radius:3px;padding:1px 6px;cursor:pointer;color:#555;font-size:11px'
    btn.addEventListener('click', () => {
      if (anchor.isConnected) setEditableText(anchor, original)
      bar.remove()
    })

    bar.append(label, btn)
    anchor.insertAdjacentElement('afterend', bar)

    const cleanup = () => bar.remove()
    anchor.closest('form')?.addEventListener('submit', cleanup, { once: true })
    setTimeout(cleanup, 30000)
  }

  function showRewriteToast(message, duration) {
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
