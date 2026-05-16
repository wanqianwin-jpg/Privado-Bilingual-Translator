// jsdom's whatwg-url needs TextEncoder/TextDecoder; the jsdom test env
// doesn't expose them as globals, so polyfill from Node util before requiring jsdom.
const { TextEncoder, TextDecoder } = require('util')
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder
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

test('nth-of-type 只数同标签兄弟', () => {
  const doc = new JSDOM('<body><div><span>s</span><p>p1</p><p id="t">p2</p></div></body>').window.document
  const el = doc.getElementById('t')
  const span = doc.querySelector('span')
  const firstP = doc.querySelector('p')
  expect(domPath(el)).toBe('body>div:nth-of-type(1)>p:nth-of-type(2)')
  expect(domPath(firstP)).toBe('body>div:nth-of-type(1)>p:nth-of-type(1)')
  expect(domPath(span)).toBe('body>div:nth-of-type(1)>span:nth-of-type(1)')
})

test('同一元素两次调用结果一致', () => {
  const doc = new JSDOM('<body><div><p>a</p><p id="t">target text</p></div></body>').window.document
  const el = doc.getElementById('t')
  expect(domPath(el)).toBe(domPath(el))
})
