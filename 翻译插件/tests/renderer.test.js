const { injectTranslation, removeTranslation, setDisplayMode, injectStyles } = require('../content/renderer.js')

describe('injectTranslation', () => {
  beforeEach(() => {
    document.body.textContent = ''
    const p = document.createElement('p')
    p.id = 'para'
    p.textContent = 'Hello world paragraph text here.'
    document.body.appendChild(p)
  })

  test('在段落后面注入 sibling 译文 div', () => {
    const el = document.getElementById('para')
    injectTranslation(el, '你好世界')
    const sib = el.nextElementSibling
    expect(sib).not.toBeNull()
    expect(sib.dataset.btSiblingFor).toBe('true')
    expect(sib.textContent).toBe('你好世界')
    expect(el.dataset.btTranslated).toBe('true')
  })

  test('重复注入时替换而非追加', () => {
    const el = document.getElementById('para')
    injectTranslation(el, '第一次')
    injectTranslation(el, '第二次')
    const sibs = document.querySelectorAll('[data-bt-sibling-for]')
    expect(sibs.length).toBe(1)
    expect(sibs[0].textContent).toBe('第二次')
  })

  test('removeTranslation 移除 sibling 并清除标记', () => {
    const el = document.getElementById('para')
    injectTranslation(el, '你好')
    removeTranslation(el)
    expect(document.querySelector('[data-bt-sibling-for]')).toBeNull()
    expect(el.dataset.btTranslated).toBeUndefined()
  })

  test('slot 元素注入到内部而非 sibling', () => {
    document.body.textContent = ''
    const host = document.createElement('div')
    const slotted = document.createElement('a')
    slotted.setAttribute('slot', 'title')
    slotted.textContent = 'Title text here'
    host.appendChild(slotted)
    document.body.appendChild(host)

    injectTranslation(slotted, '标题译文')
    // Slotted element gets translation appended as last child, not as a sibling
    expect(slotted.lastElementChild?.dataset.btSiblingFor).toBe('true')
    expect(slotted.nextElementSibling).toBeNull()
  })
})

describe('setDisplayMode', () => {
  test('bilingual 模式设置正确 class', () => {
    setDisplayMode('bilingual')
    expect(document.body.classList.contains('bt-mode-bilingual')).toBe(true)
  })

  test('translation-only 模式设置正确 class', () => {
    setDisplayMode('translation-only')
    expect(document.body.classList.contains('bt-mode-translation-only')).toBe(true)
  })

  test('original-only 模式设置正确 class', () => {
    setDisplayMode('original-only')
    expect(document.body.classList.contains('bt-mode-original-only')).toBe(true)
  })

  test('切换模式时移除旧 class', () => {
    setDisplayMode('bilingual')
    setDisplayMode('translation-only')
    expect(document.body.classList.contains('bt-mode-bilingual')).toBe(false)
    expect(document.body.classList.contains('bt-mode-translation-only')).toBe(true)
  })

  test('无效 mode 不修改 class', () => {
    document.body.className = ''
    setDisplayMode('invalid-mode')
    expect(document.body.className).toBe('')
  })
})

describe('injectStyles', () => {
  test('多次调用只创建一个 style 元素', () => {
    document.getElementById('bt-styles')?.remove()
    injectStyles()
    injectStyles()
    expect(document.querySelectorAll('#bt-styles').length).toBe(1)
  })

  test('CSS 包含 pending 蓝点动画 keyframes', () => {
    document.getElementById('bt-styles')?.remove()
    injectStyles()
    const css = document.getElementById('bt-styles').textContent
    expect(css).toContain('bt-dot')
    expect(css).toContain('@keyframes')
  })

  test('CSS 包含三种显示模式规则', () => {
    document.getElementById('bt-styles')?.remove()
    injectStyles()
    const css = document.getElementById('bt-styles').textContent
    expect(css).toContain('bt-mode-translation-only')
    expect(css).toContain('bt-mode-original-only')
  })
})
