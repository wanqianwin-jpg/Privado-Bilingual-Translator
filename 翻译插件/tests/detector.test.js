const { shouldTranslate, getTranslatableElements } = require('../content/detector.js')

describe('shouldTranslate', () => {
  test('p 标签返回 true', () => {
    document.body.textContent = ''
    const p = document.createElement('p')
    p.textContent = 'Hello world, this is a test paragraph.'
    document.body.appendChild(p)
    expect(shouldTranslate(p)).toBe(true)
  })

  test('文字少于 20 字符跳过', () => {
    const p = document.createElement('p')
    p.textContent = '登录'
    expect(shouldTranslate(p)).toBe(false)
  })

  test('nav 内的 p 跳过', () => {
    document.body.textContent = ''
    const nav = document.createElement('nav')
    const p = document.createElement('p')
    p.textContent = 'This is navigation text here'
    nav.appendChild(p)
    document.body.appendChild(nav)
    expect(shouldTranslate(p)).toBe(false)
  })

  test('广告容器内跳过', () => {
    document.body.textContent = ''
    const div = document.createElement('div')
    div.className = 'ad-banner'
    const p = document.createElement('p')
    p.textContent = 'Buy now, great deals available'
    div.appendChild(p)
    document.body.appendChild(div)
    expect(shouldTranslate(p)).toBe(false)
  })

  test('aside 内的 li 跳过', () => {
    document.body.textContent = ''
    const aside = document.createElement('aside')
    const li = document.createElement('li')
    li.textContent = 'Related articles sidebar'
    aside.appendChild(li)
    document.body.appendChild(aside)
    expect(shouldTranslate(li)).toBe(false)
  })

  test('h2 标题返回 true', () => {
    const h2 = document.createElement('h2')
    h2.textContent = 'This is a section heading'
    expect(shouldTranslate(h2)).toBe(true)
  })

  test('button 标签返回 false（不在白名单）', () => {
    const btn = document.createElement('button')
    btn.textContent = 'Click me to submit the form'
    expect(shouldTranslate(btn)).toBe(false)
  })

  test('aside 内的 p 跳过（隐式 ARIA complementary）', () => {
    document.body.textContent = ''
    const aside = document.createElement('aside')
    const p = document.createElement('p')
    p.textContent = 'Sidebar content paragraph here, related links etc.'
    aside.appendChild(p)
    document.body.appendChild(aside)
    expect(shouldTranslate(p)).toBe(false)
  })

  test('hasAdSignal 二次调用走缓存（同一元素返回相同结果）', () => {
    document.body.textContent = ''
    const ad = document.createElement('div')
    ad.className = 'ad-banner'
    const p = document.createElement('p')
    p.textContent = 'Buy now, great deals available everywhere'
    ad.appendChild(p)
    document.body.appendChild(ad)
    // First and second call should both reject (cache shouldn't flip)
    expect(shouldTranslate(p)).toBe(false)
    expect(shouldTranslate(p)).toBe(false)
  })
})
