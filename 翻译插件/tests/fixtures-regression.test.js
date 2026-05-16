const fs = require('fs')
const path = require('path')
const { dumpDecisions } = require('./harness/dump-decisions')

const SITES = ['pythondocs', 'theverge']
describe('fixture regression gate', () => {
  for (const site of SITES) {
    test(`${site} 判定与 baseline 一致`, () => {
      const html = fs.readFileSync(path.join(__dirname, `fixtures/${site}.html`), 'utf8')
      const current = dumpDecisions(html)
      const baselinePath = path.join(__dirname, `fixtures/${site}.baseline.json`)
      if (!fs.existsSync(baselinePath)) {
        fs.writeFileSync(baselinePath, JSON.stringify(current, null, 2))
        return  // first run bootstraps baseline
      }
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
      expect(current).toEqual(baseline)
    })
  }
})
