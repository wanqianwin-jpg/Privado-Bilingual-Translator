const MIN_TEXT_LENGTH = 20
const MAX_TEXT_LENGTH = 1500  // skip huge blobs (JSON payloads, embedded data, etc.)
const CJK_THRESHOLD = 0.25  // skip if >25% of chars are CJK (already target language)

// Texts that look like URLs, emails, @handles, or data payloads — no value in translating
const SKIP_PATTERNS = [
  /^https?:\/\/\S+$/i,
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  /^@\w+$/,
  /^\d{4}[-/]\d{2}[-/]\d{2}$/,
  /^\s*[{[]/,  // starts with JSON/array bracket — embedded data payload
]

function shouldSkipText(text) {
  return SKIP_PATTERNS.some(re => re.test(text.trim()))
}

// Returns true if text is predominantly CJK (Chinese/Japanese/Korean)
function isMostlyCJK(text) {
  const stripped = text.replace(/\s/g, '')
  if (!stripped.length) return false
  const cjk = (stripped.match(/[\u3400-\u9fff\uf900-\ufaff\u{20000}-\u{2a6df}]/gu) || []).length
  return cjk / stripped.length > CJK_THRESHOLD
}

const ANCESTOR_BLACKLIST = new Set(['NAV', 'HEADER', 'FOOTER'])
const ANCESTOR_ID_BLACKLIST = new Set(['movie_player'])
const ANCESTOR_ROLE_BLACKLIST = new Set(['navigation', 'banner', 'complementary', 'form', 'search', 'alert', 'status', 'log'])
const AD_KEYWORDS = ['ad-', 'ads', 'advert', 'sponsor', 'advertisement', 'promo', 'banner']
const YT_UI_PREFIXES = ['ytp-', 'yt-icon', 'ytd-button', 'yt-button']

// Pre-compiled selectors for closest() — built once, reused on every call
const BLACKLIST_SELECTOR = 'nav, header, footer, #movie_player, [role="navigation"], [role="banner"], [role="complementary"], [role="form"], [role="search"], [role="alert"], [role="status"], [aria-live="assertive"]'
const AD_ATTR_SELECTOR = AD_KEYWORDS.map(kw => `[class*="${kw}" i],[id*="${kw}" i]`).join(',')

// Never enter these — no translatable text inside
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'CANVAS', 'SVG',
  'VIDEO', 'AUDIO', 'IMG', 'INPUT', 'TEXTAREA', 'SELECT',
  'BUTTON', 'CODE', 'PRE', 'KBD', 'SAMP'
])

// Walk UP past these to find a block container
const INLINE_TAGS = new Set([
  'A', 'ABBR', 'B', 'BDO', 'CITE', 'DFN', 'EM', 'I',
  'LABEL', 'MARK', 'Q', 'S', 'SMALL', 'SPAN',
  'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'VAR'
])

// Structural block tags — if el has these as children it's a layout wrapper, not a content unit
const STRUCTURAL_BLOCKS = new Set([
  'DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'HEADER', 'FOOTER',
  'MAIN', 'NAV', 'FORM', 'TABLE', 'UL', 'OL', 'DL', 'FIGURE',
  'BLOCKQUOTE', 'DETAILS', 'SUMMARY'
])

// Cache computed display values for unknown/custom elements
const displayCache = new WeakMap()

// True if element is inline — checks tag sets first, falls back to computed style for custom elements
function isInlineEl(el) {
  if (!el || !el.tagName) return false
  if (INLINE_TAGS.has(el.tagName)) return true
  if (STRUCTURAL_BLOCKS.has(el.tagName)) return false
  // Custom element or unknown tag: use computed style (cached)
  if (displayCache.has(el)) return displayCache.get(el)
  try {
    const display = getComputedStyle(el).display
    const inline = display.startsWith('inline') || display === 'contents' || display === 'none'
    displayCache.set(el, inline)
    return inline
  } catch {
    return false
  }
}

function hasBlacklistedAncestor(el) {
  return !!el.closest(BLACKLIST_SELECTOR)
}

function hasAdSignal(el) {
  // Fast path: native closest() for class/id substring ad signals
  if (el.closest(AD_ATTR_SELECTOR)) return true
  // YT UI prefix needs per-token matching — use classList iterator, keep JS loop
  let node = el
  while (node) {
    const tag = (node.tagName || '').toLowerCase()
    if (YT_UI_PREFIXES.some(p => tag.startsWith(p))) return true
    if (node.classList?.length) {
      for (const cls of node.classList) {
        if (YT_UI_PREFIXES.some(p => cls.startsWith(p))) return true
      }
    }
    node = node.parentElement
  }
  return false
}

// Walk up past inline elements to find a meaningful block container
function findBlockContainer(el) {
  let node = el
  while (node && isInlineEl(node)) {
    node = node.parentElement
  }
  return node
}

function hasBlockChildren(el) {
  // Only count known structural HTML elements (div, section, article…) as "block children".
  // Custom elements (yt-attributed-string, shreddit-post, etc.) may render as block but are
  // content units, not layout wrappers — don't let them disqualify the parent.
  for (const child of el.children) {
    if (STRUCTURAL_BLOCKS.has(child.tagName) && child.textContent.trim().length >= MIN_TEXT_LENGTH) return true
  }
  return false
}

// Walk all nodes including shadow roots, collect translatable block containers
function getTranslatableElements(root = document.body, { minLength = MIN_TEXT_LENGTH } = {}) {
  const seen = new Set()
  const results = []

  function walk(node) {
    if (!node) return

    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.textContent.trim()) return
      const container = findBlockContainer(node.parentElement)
      if (!container || seen.has(container)) return
      seen.add(container)
      if (container.dataset?.btSiblingFor) return           // skip our own injected translation divs
      if (container.closest('[data-bt-translated]')) return  // inside already-translated element
      // Skip shadow hosts whose shadow root has its own text — found by walking shadowRoot separately.
      // If shadowRoot is empty/slot-only, the text lives in light DOM children — don't skip.
      if (container.shadowRoot && container.getRootNode() === document &&
          container.shadowRoot.textContent.trim()) return
      const text = container.textContent.trim()
      if (text.length < minLength) return
      if (text.length > MAX_TEXT_LENGTH) return  // JSON payloads / embedded data
      if (isMostlyCJK(text)) return              // already target language
      if (shouldSkipText(text)) return           // URL / email / @handle / JSON
      if (hasBlockChildren(container)) return   // too large — has images/divs/etc
      if (hasBlacklistedAncestor(container)) return
      if (hasAdSignal(container)) return
      results.push(container)
      return
    }

    // Element or ShadowRoot
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== 11) return

    if (node.nodeType === Node.ELEMENT_NODE) {
      if (SKIP_TAGS.has(node.tagName)) return
      if (node.isContentEditable) return
      if (node.getAttribute?.('translate') === 'no') return
      if (node.classList?.contains('notranslate')) return
    }

    for (const child of node.childNodes) {
      walk(child)
    }

    if (node.shadowRoot) {
      for (const child of node.shadowRoot.childNodes) {
        walk(child)
      }
    }
  }

  walk(root)
  return results
}

// Used by MutationObserver for direct element checks
function shouldTranslate(el) {
  if (el.dataset.btSiblingFor) return false
  const text = el.textContent?.trim() ?? ''
  if (text.length < MIN_TEXT_LENGTH) return false
  if (text.length > MAX_TEXT_LENGTH) return false
  if (isMostlyCJK(text)) return false
  if (shouldSkipText(text)) return false
  if (SKIP_TAGS.has(el.tagName)) return false
  if (el.isContentEditable) return false
  // Skip if inside an already-translated element (prevents re-translating our own injected spans)
  if (el.closest('[data-bt-translated]')) return false
  if (el.shadowRoot && el.getRootNode() === document) return false
  if (hasBlacklistedAncestor(el)) return false
  if (hasAdSignal(el)) return false
  // Skip if this is clearly a large container (has structural block children)
  if (hasBlockChildren(el)) return false
  return true
}

if (typeof module !== 'undefined') {
  module.exports = { shouldTranslate, getTranslatableElements }
}
