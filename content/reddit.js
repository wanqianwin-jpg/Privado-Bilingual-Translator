// content/reddit.js — Reddit-specific translation. Mirrors youtube.js structure.
// Sets BT_IS_REDDIT so content.js skips its generic scan and hands the ball over.
window.BT_IS_REDDIT = true

let targetLang = 'zh'
let translateMode = 'machine'

// ── Post title translation ────────────────────────────────────────────────────
// Injects translation INSIDE [slot="title"] (child injection) so it renders in the
// card body where the title lives. The generic walker must NOT also translate the
// shadow DOM title element (which renders in the header meta row — the blue link),
// so scanPage() filters out shreddit-post shadow DOM elements entirely.

async function translateRedditPost(post) {
  if (post.dataset.btReddit) return
  const titleText = post.getAttribute('post-title')?.trim()
  if (!titleText || titleText.length < 20) return
  if (typeof isMostlyCJK === 'function' && isMostlyCJK(titleText)) return

  post.dataset.btReddit = 'pending'
  const titleEl = post.querySelector('[slot="title"]')
  if (titleEl) titleEl.dataset.btTranslated = 'pending'

  const div = document.createElement('div')
  div.dataset.btSiblingFor = 'true'
  div.style.cssText = [
    'color:inherit', 'font-weight:normal', 'opacity:0.8',
    'font-size:0.9em', 'line-height:1.5',
    'writing-mode:horizontal-tb', 'white-space:normal', 'overflow-wrap:break-word'
  ].join(';')
  div.textContent = '…'

  if (titleEl) {
    // Inject as a SEPARATE slot="title" element appended to the post host — NOT inside titleEl.
    // This makes the two elements siblings in the shadow slot, so CSS can independently
    // show/hide each:
    //   translation-only  → titleEl[data-bt-translated="true"] display:none, this div visible
    //   original-only     → this div[data-bt-sibling-for]       display:none, titleEl visible
    // If we used titleEl.appendChild(div), hiding titleEl would also hide the child div.
    div.slot = 'title'
    post.appendChild(div)
  } else {
    post.after(div)
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
    // Use 'true' (not 'handled') so the CSS rule [data-bt-translated="true"] can hide
    // the original title in translation-only mode.
    if (titleEl) titleEl.dataset.btTranslated = 'true'
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

// Directly scan post body paragraphs (individual post page).
// The generic walker may miss these because rtjson-content divs have structural block children
// (blockquote, etc.) at the wrapper level, causing hasBlockChildren to skip the container.
// Targeting [property="schema:articleBody"] paragraphs is more reliable.
function scanPostBody() {
  document.querySelectorAll('[property="schema:articleBody"] p, [property="schema:articleBody"] li').forEach(el => {
    if (el.dataset.btTranslated) return
    const text = el.textContent.trim()
    if (text.length < 20) return
    if (typeof isMostlyCJK === 'function' && isMostlyCJK(text)) return
    translateRedditElTracked(el)
  })
}

function scanPage() {
  scanPosts()
  scanPostBody()
  const root = document.querySelector('shreddit-app') || document.body
  // Filters:
  // 1. Skip faceplate-screen-reader-content — visually-hidden a11y element; sibling injection
  //    lands inside the card header <a>, producing blue text in the meta row.
  // 2. Skip shreddit-post itself — would create a stray div after </shreddit-post>.
  // 3. Skip shadow DOM elements inside shreddit-post (title/media rendered in shadow root).
  // 4. Skip light-DOM elements that are inside a [slot] subtree of shreddit-post —
  //    these are slotted UI elements (slot="title", slot="media-*", etc.) whose translation
  //    would create stray divs or cause images to disappear in translation-only mode.
  //    Post body <p> elements have no [slot] ancestor, so they still get translated.
  getTranslatableElements(root)
    .filter(el => el.tagName !== 'FACEPLATE-SCREEN-READER-CONTENT' &&
                  !el.closest('faceplate-screen-reader-content') &&
                  el.tagName !== 'SHREDDIT-POST' &&
                  el.getRootNode()?.host?.tagName !== 'SHREDDIT-POST' &&
                  !(el.closest('shreddit-post') && el.closest('[slot]')))
    .forEach(translateRedditElTracked)
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
        // Post body paragraphs added dynamically (e.g. navigating to a post page)
        node.querySelectorAll?.('[property="schema:articleBody"] p, [property="schema:articleBody"] li').forEach(el => {
          if (el.dataset.btTranslated) return
          const text = el.textContent.trim()
          if (text.length < 20 || (typeof isMostlyCJK === 'function' && isMostlyCJK(text))) return
          translateRedditElTracked(el)
        })
        // Same filters as scanPage
        getTranslatableElements(node)
          .filter(el => el.tagName !== 'FACEPLATE-SCREEN-READER-CONTENT' &&
                        !el.closest('faceplate-screen-reader-content') &&
                        el.tagName !== 'SHREDDIT-POST' &&
                        el.getRootNode()?.host?.tagName !== 'SHREDDIT-POST' &&
                        !(el.closest('shreddit-post') && el.closest('[slot]')))
          .forEach(translateRedditElTracked)
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
