// Stable element identity for regression diffing.
// Builds a `tag:nth-of-type(k)` chain from the element up to (and including)
// <body>, so the same block in a frozen HTML fixture maps to the same string
// across runs. nth-of-type counts only same-tagName siblings (1-based).

function nthOfType(el) {
  let k = 0
  let sib = el
  while (sib) {
    if (sib.tagName === el.tagName) k++
    sib = sib.previousElementSibling
  }
  return k
}

function domPath(el) {
  const segments = []
  let node = el
  while (node) {
    const tag = node.tagName.toLowerCase()
    if (tag === 'body') {
      segments.unshift('body')
      break
    }
    segments.unshift(tag + ':nth-of-type(' + nthOfType(node) + ')')
    node = node.parentElement
  }
  return segments.join('>')
}

module.exports = { domPath }
