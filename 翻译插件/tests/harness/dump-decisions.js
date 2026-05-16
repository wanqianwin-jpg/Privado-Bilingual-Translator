// Run the content detector over a frozen HTML string and emit a structured,
// stable decision dump — one record per candidate block the TextNode walker
// considers: { path, decision, reason, text }. This is the shared format the
// regression baseline is committed in and diffed against (Task 5).
//
// DOM-loading mechanism: `new JSDOM(html).window.document`. Preferred over the
// jest-ambient DOMParser because each call gets a fresh isolated realm — no
// shared mutable global `document` state leaking between fixtures when many run
// in one suite, which matters for deterministic baselines.
//
// jsdom-realm fidelity boundary (known blind spots — read before trusting a
// dump as a model of real-browser behavior):
// detector.js closes over the jest *global* `Node`/`getComputedStyle`/
// `document`, but the document we hand it lives in the separate JSDOM realm.
// `Node.TEXT_NODE`/`Node.ELEMENT_NODE` are realm-independent numeric constants
// so those checks behave correctly. Two things, however, do NOT:
//   (a) Shadow DOM is invisible here. A string-parsed JSDOM tree has no
//       shadowRoot, and detector.js's shadow-host skip
//       (`container.shadowRoot && container.getRootNode() === document`) can
//       never fire — `getRootNode()` returns the JSDOM document, never the
//       jest global. Shadow-DOM content is simply not walked.
//   (b) Inline-display custom elements are forced to BLOCK. detector.js's
//       `isInlineEl()` calls the global `getComputedStyle(el)` for ANY element
//       outside its hardcoded INLINE/STRUCTURAL tag sets — i.e. every custom
//       element (`<clipboard-copy>`, embed wrappers, web components on real
//       pages like StackOverflow / The Verge). Cross-realm that call THROWS
//       every time; detector.js's `catch { return false }` swallows it and the
//       element is treated as block-level. In a real browser an inline-display
//       custom element would be walked past into a different block container,
//       so the dumped `path`/`decision` for text inside inline custom elements
//       systematically diverges from real-browser detector behavior — silently,
//       with no error.
// Net: this dump is a faithful *regression* oracle (deterministic, same input →
// same output) but NOT a faithful model of real-browser detector decisions for
// custom-element-inline or shadow-DOM content. That fidelity gap is an
// accepted, documented limitation handled at the methodology level (real-Chrome
// verification), not a bug to fix in this harness.
//
// Determinism is guaranteed only for a fixed jsdom version: a future jsdom
// upgrade can legitimately shift `text`/`path` for malformed HTML (different
// error-recovery tree); that is expected, not a detector regression.

const { JSDOM } = require('jsdom')
const { domPath } = require('./dom-path')

function dumpDecisions(html) {
  const doc = new JSDOM(html).window.document
  const trace = []
  require('../../content/detector.js').getTranslatableElements(doc.body, { trace })

  return trace
    .map(t => ({
      path: domPath(t.el),
      decision: t.decision,
      reason: t.reason ?? null,
      text: t.text,
    }))
    .sort((a, b) => {
      // Total, deterministic order so the same HTML yields byte-identical JSON.
      // Primary key: path. Ties (two text nodes collapsing to the same block
      // container) are broken by decision then text so the result never depends
      // on trace iteration order.
      if (a.path !== b.path) return a.path < b.path ? -1 : 1
      if (a.decision !== b.decision) return a.decision < b.decision ? -1 : 1
      if (a.text !== b.text) return a.text < b.text ? -1 : 1
      return 0
    })
}

module.exports = { dumpDecisions }
