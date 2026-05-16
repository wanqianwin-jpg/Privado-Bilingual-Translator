const { dumpDecisions } = require('./dump-decisions')

test('article 段判 TRANSLATE，nav 段判 blacklisted-ancestor', () => {
  const html = '<html><body>' +
    '<nav><p>nav text long enough to be considered for translate</p></nav>' +
    '<article><p>real article body paragraph text here for sure</p></article>' +
    '</body></html>'
  const dump = dumpDecisions(html)
  const article = dump.find(d => /real article body paragraph/.test(d.text))
  expect(article.decision).toBe('TRANSLATE')
  const nav = dump.find(d => /nav text long enough/.test(d.text))
  expect(nav.decision).toBe('SKIP')
  expect(nav.reason).toBe('blacklisted-ancestor')
  // 稳定排序：path 升序
  expect(dump.map(d => d.path)).toEqual([...dump.map(d => d.path)].sort())
})

test('广告容器段判 ad-signal SKIP', () => {
  const html = '<html><body>' +
    '<div class="ad-banner"><p>Buy now, great deals available everywhere today</p></div>' +
    '</body></html>'
  const dump = dumpDecisions(html)
  const ad = dump.find(d => /Buy now, great deals/.test(d.text))
  expect(ad.decision).toBe('SKIP')
  expect(ad.reason).toBe('ad-signal')
})

test('每条记录形状固定：path/decision/reason/text', () => {
  const html = '<html><body>' +
    '<article><p>real article body paragraph text here for sure</p></article>' +
    '</body></html>'
  const dump = dumpDecisions(html)
  const rec = dump.find(d => /real article body paragraph/.test(d.text))
  expect(Object.keys(rec).sort()).toEqual(['decision', 'path', 'reason', 'text'])
  expect(rec.path).toBe('body>article:nth-of-type(1)>p:nth-of-type(1)')
  expect(rec.reason).toBeNull()
})

test('无可翻译文本时返回真正的空数组', () => {
  const html = '<html><body>' +
    '<script>var x = 1</script>' +
    '<style>.a { color: red }</style>' +
    '   \n  ' +
    '</body></html>'
  expect(dumpDecisions(html)).toEqual([])
})

test('确定性：同一 HTML 两次调用结果深度相等', () => {
  const html = '<html><body>' +
    '<nav><p>nav text long enough to be considered for translate</p></nav>' +
    '<div class="ads"><p>sponsored promo content block paragraph here</p></div>' +
    '<article><p>real article body paragraph text here for sure</p></article>' +
    '<p>too short</p>' +
    '</body></html>'
  const a = dumpDecisions(html)
  const b = dumpDecisions(html)
  expect(a).toEqual(b)
  // 排序总序：path 升序
  expect(a.map(d => d.path)).toEqual([...a.map(d => d.path)].sort())
})
