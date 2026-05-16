// Run the content detector over a frozen HTML string and emit a structured,
// stable decision dump — one record per candidate block the TextNode walker
// considers: { path, decision, reason, text }. This is the shared format the
// regression baseline is committed in and diffed against (Task 5).
//
// DOM-loading mechanism: `new JSDOM(html).window.document`.
// Why this over the jest-ambient DOMParser: detector.js closes over the global
// `Node`/`getComputedStyle`/`document`, so the JSDOM document lives in a
// different realm than those globals. Verified empirically that decisions are
// IDENTICAL under both mechanisms — `Node.TEXT_NODE`/`Node.ELEMENT_NODE` are
// realm-independent numeric constants, and `getComputedStyle` is only reached
// via a try/catch'd custom-element fallback that static fixtures don't hit. The
// only cross-realm difference (`getRootNode() === document` shadow-host skip
// stays inert) is irrelevant to frozen static fixtures. JSDOM is preferred
// because each call gets a fresh isolated realm — no shared mutable global
// `document` state leaking between fixtures when many run in one suite, which
// matters for deterministic baselines.

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
      reason: t.reason || null,
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
