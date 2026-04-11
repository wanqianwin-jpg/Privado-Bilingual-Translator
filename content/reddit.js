// content/reddit.js — Reddit-specific translation. Mirrors youtube.js structure.
// Sets BT_IS_REDDIT so content.js skips its generic scan and hands the ball over.
window.BT_IS_REDDIT = true

let targetLang = 'zh'
let translateMode = 'machine'

// ── Post title translation ────────────────────────────────────────────────────
// Reads from post-title attribute — works before shadow DOM hydrates and is
// unaffected by the transparent position:absolute overlay covering the card.

async function translateRedditPost(post) {
  if (post.dataset.btReddit) return
  const titleText = post.getAttribute('post-title')?.trim()
  if (!titleText || titleText.length < 20) return
  if (typeof isMostlyCJK === 'function' && isMostlyCJK(titleText)) return

  post.dataset.btReddit = 'pending'
  const titleEl = post.querySelector('[slot="title"]')
  if (titleEl) titleEl.dataset.btTranslated = 'pending'

  // Inject INSIDE titleEl (not as a new slot="title" sibling).
  // A child of titleEl inherits color from titleEl via light DOM — and titleEl already
  // has the correct shadow DOM composed color (white on dark cards, dark on light).
  // A new top-level slot="title" element would inherit from shreddit-post instead,
  // missing the shadow DOM context entirely. That's why color:inherit kept failing.
  const div = document.createElement('div')
  div.dataset.btSiblingFor = 'true'
  div.style.cssText = [
    'display:block', 'color:inherit', 'font-weight:normal', 'opacity:0.8',
    'font-size:0.9em', 'line-height:1.5',
    'writing-mode:horizontal-tb', 'white-space:normal', 'overflow-wrap:break-word'
  ].join(';')
  div.textContent = '…'
  if (titleEl) {
    titleEl.appendChild(div)
  } else {
    post.after(div)  // fallback when no title element exists
  }

  try {
    const translation = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'TRANSLATE', id: Math.random().toString(36).slice(2), text: titleText, fromLang: 'auto', toLang: targetLang },
        (res) => {
          if (chrome.runtime.lastError || !res?.ok) { reject(); return }
          resolve(res.translation)
        }
      )
    })

    div.textContent = translation

    // 'handled' instead of 'true': CSS translation-only rule targets [data-bt-translated="true"],
    // so the original card title stays visible. Generic walker still sees the attribute and skips it.
    if (titleEl) titleEl.dataset.btTranslated = 'handled'
    post.dataset.btReddit = 'done'
  } catch {
    div.remove()
    if (titleEl) delete titleEl.dataset.btTranslated
    delete post.dataset.btReddit
  }
}

// ── Generic element translation (comments, post bodies, etc.) ────────────────

async function translateRedditEl(el) {
  if (el.dataset.btTranslated) return
  el.dataset.btTranslated = 'pending'
  const text = el.textContent.trim() || el.shadowRoot?.textContent?.trim() || ''
  if (!text) { delete el.dataset.btTranslated; return }

  if (translateMode === 'chrome-local') {
    try {
      if (typeof chromeTranslatorAvailable !== 'undefined' && await chromeTranslatorAvailable('auto', targetLang)) {
        const [translation] = await chromeTranslatorTranslate([text], 'auto', targetLang)
        injectTranslationSibling(el, translation)
        return
      }
    } catch {}
  }

  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: 'TRANSLATE', id: 'rdt-' + Math.random().toString(36).slice(2), text, fromLang: 'auto', toLang: targetLang },
        (res) => {
          if (chrome.runtime.lastError) { delete el.dataset.btTranslated; resolve(); return }
          if (res?.ok) injectTranslationSibling(el, res.translation)
          else delete el.dataset.btTranslated
          resolve()
        }
      )
    } catch { resolve() }
  })
}

let _pending = 0
function ballStart() { window.btBall?.setState('translating') }
function ballDone()  { if (_pending === 0) window.btBall?.setState('done') }

function translateRedditElTracked(el) {
  _pending++
  ballStart()
  translateRedditEl(el).finally(() => {
    _pending--
    ballDone()
  })
}

// ── Page scan ─────────────────────────────────────────────────────────────────

function scanPosts() {
  document.querySelectorAll('shreddit-post[post-title]').forEach(post => {
    if (!post.dataset.btReddit) translateRedditPost(post)
  })
}

function scanPage() {
  scanPosts()
  const root = document.querySelector('shreddit-app') || document.body
  getTranslatableElements(root).forEach(translateRedditElTracked)
}

function initPageTranslation() {
  setTimeout(scanPage, 800)
  setTimeout(scanPage, 2500)

  const mo = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue
        if (node.dataset.btSiblingFor) continue
        if (node.matches?.('shreddit-post[post-title]') && !node.dataset.btReddit) {
          translateRedditPost(node)
        }
        node.querySelectorAll?.('shreddit-post[post-title]').forEach(post => {
          if (!post.dataset.btReddit) translateRedditPost(post)
        })
        getTranslatableElements(node).forEach(translateRedditElTracked)
      }
    }
  })
  mo.observe(document.body, { childList: true, subtree: true })
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

chrome.storage.local.get(['siteSettings', 'targetLang', 'translateMode', 'apiEnabled'], (data) => {
  const { siteSettings = {}, targetLang: lang = 'zh' } = data
  if (siteSettings[location.hostname] === 'never') return
  targetLang = lang
  const raw = data.translateMode === 'privacy' ? 'chrome-local' : data.translateMode
  translateMode = raw || (data.apiEnabled ? 'api' : 'machine')
  initPageTranslation()
})
