const TARGET_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'FIGCAPTION', 'LI', 'TD', 'TH'
])

const ANCESTOR_BLACKLIST = new Set(['NAV', 'ASIDE', 'HEADER', 'FOOTER'])

const ANCESTOR_ROLE_BLACKLIST = new Set([
  'navigation', 'banner', 'complementary', 'form', 'search'
])

const AD_KEYWORDS = [
  'ad-', 'ads', 'advert', 'sponsor', 'advertisement', 'promo', 'banner'
]

const MIN_TEXT_LENGTH = 20

function hasBlacklistedAncestor(el) {
  let node = el.parentElement
  while (node) {
    if (ANCESTOR_BLACKLIST.has(node.tagName)) return true
    const role = node.getAttribute('role')
    if (role && ANCESTOR_ROLE_BLACKLIST.has(role)) return true
    node = node.parentElement
  }
  return false
}

function hasAdSignal(el) {
  let node = el
  while (node) {
    const cls = (node.className || '').toLowerCase()
    const id = (node.id || '').toLowerCase()
    if (AD_KEYWORDS.some(kw => cls.includes(kw) || id.includes(kw))) return true
    node = node.parentElement
  }
  return false
}

function shouldTranslate(el) {
  if (!TARGET_TAGS.has(el.tagName)) return false
  const text = el.textContent.trim()
  if (text.length < MIN_TEXT_LENGTH) return false
  if (hasBlacklistedAncestor(el)) return false
  if (hasAdSignal(el)) return false
  return true
}

function getTranslatableElements(root = document.body) {
  const candidates = root.querySelectorAll(
    'p, h1, h2, h3, h4, h5, h6, blockquote, figcaption, li, td, th'
  )
  return Array.from(candidates).filter(shouldTranslate)
}

if (typeof module !== 'undefined') {
  module.exports = { shouldTranslate, getTranslatableElements }
}
