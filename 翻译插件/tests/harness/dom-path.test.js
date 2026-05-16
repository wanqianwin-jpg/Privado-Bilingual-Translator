const { JSDOM } = require('jsdom')
const { domPath } = require('./dom-path')

test('生成稳定 nth-of-type 路径', () => {
  const doc = new JSDOM('<body><div><p>a</p><p id="t">target text</p></div></body>').window.document
  const el = doc.getElementById('t')
  expect(domPath(el)).toBe('body>div:nth-of-type(1)>p:nth-of-type(2)')
})

test('body 直接子元素', () => {
  const doc = new JSDOM('<body><p>x</p><p id="t">target text</p></body>').window.document
  const el = doc.getElementById('t')
  expect(domPath(el)).toBe('body>p:nth-of-type(2)')
})

test('混合标签兄弟下 nth-of-type 按各自标签独立计数', () => {
  const doc = new JSDOM('<body><div><span>s</span><p>p1</p><p id="t">p2</p></div></body>').window.document
  const el = doc.getElementById('t')
  const span = doc.querySelector('span')
  const firstP = doc.querySelector('p')
  expect(domPath(el)).toBe('body>div:nth-of-type(1)>p:nth-of-type(2)')
  expect(domPath(firstP)).toBe('body>div:nth-of-type(1)>p:nth-of-type(1)')
  expect(domPath(span)).toBe('body>div:nth-of-type(1)>span:nth-of-type(1)')
})

test('不在 <body> 下的元素抛错', () => {
  const doc = new JSDOM('<body></body>').window.document
  const detached = doc.createElement('div')
  expect(() => domPath(detached)).toThrow(/not under <body>/)
  expect(() => domPath(null)).toThrow()
})
