const fs = require('fs')
const path = require('path')
const { dumpDecisions } = require('./harness/dump-decisions')

const SITES = ['pythondocs', 'theverge']

const summarize = arr => {
  const c = {}
  for (const d of arr) {
    const k = `${d.decision}:${d.reason ?? '-'}`
    c[k] = (c[k] || 0) + 1
  }
  return c
}

describe('fixture regression gate', () => {
  for (const site of SITES) {
    test(`${site} 判定与 baseline 一致`, () => {
      const html = fs.readFileSync(path.join(__dirname, `fixtures/${site}.html`), 'utf8')
      const current = dumpDecisions(html)
      const baselinePath = path.join(__dirname, `fixtures/${site}.baseline.json`)
      if (!fs.existsSync(baselinePath)) {
        if (process.env.UPDATE_BASELINES !== '1') {
          throw new Error(
            `Missing baseline ${site}.baseline.json — the regression gate refuses to ` +
            `silently bootstrap (that would mask a regression). If this is an intentional ` +
            `first run or a deliberate baseline update, re-run with UPDATE_BASELINES=1.`)
        }
        fs.writeFileSync(baselinePath, JSON.stringify(current, null, 2))
        return  // intentional bootstrap/regeneration
      }
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
      expect(summarize(current)).toEqual(summarize(baseline))
      expect(current).toEqual(baseline)
    })
  }
})
