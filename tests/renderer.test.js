const { injectTranslation, removeTranslation, setDisplayMode, injectStyles, addRetranslateButton } = require('../content/renderer.js')

describe('injectTranslation', () => {
  beforeEach(() => {
    document.body.textContent = ''
    const p = document.createElement('p')
    p.id = 'para'
    p.textContent = 'Hello world paragraph text here.'
    document.body.appendChild(p)
  })

  test('在段落下方注入译文', () => {
    const el = document.getElementById('para')
    injectTranslation(el, '你好世界')
    // Original content is now in .bt-original
    const originalSpan = el.querySelector('.bt-original')
    expect(originalSpan).not.toBeNull()
    // Translation is still .bt-translation
    const injected = el.querySelector('.bt-translation')
    expect(injected).not.toBeNull()
    expect(injected.textContent).toBe('你好世界')
  })

  test('重复注入时替换而非追加', () => {
    const el = document.getElementById('para')
    injectTranslation(el, '第一次')
    injectTranslation(el, '第二次')
    const all = el.querySelectorAll('.bt-translation')
    expect(all.length).toBe(1)
    expect(all[0].textContent).toBe('第二次')
    // Should also have exactly one .bt-original
    expect(el.querySelectorAll('.bt-original').length).toBe(1)
  })

  test('removeTranslation 移除注入的译文并还原原文', () => {
    const el = document.getElementById('para')
    const originalText = el.textContent
    injectTranslation(el, '你好')
    removeTranslation(el)
    expect(el.querySelector('.bt-translation')).toBeNull()
    expect(el.querySelector('.bt-original')).toBeNull()
    // Original text content should be restored
    expect(el.textContent).toBe(originalText)
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

  test('切换模式时移除旧 class', () => {
    setDisplayMode('bilingual')
    setDisplayMode('translation-only')
    expect(document.body.classList.contains('bt-mode-bilingual')).toBe(false)
    expect(document.body.classList.contains('bt-mode-translation-only')).toBe(true)
  })

  test('无效 mode 不添加任何 class', () => {
    document.body.className = ''
    setDisplayMode('invalid-mode')
    expect(document.body.className).toBe('')
  })
})

describe('addRetranslateButton', () => {
  let el

  beforeEach(() => {
    document.body.textContent = ''
    el = document.createElement('p')
    el.textContent = 'Some text'
    document.body.appendChild(el)
  })

  test('添加重翻按钮到元素', () => {
    addRetranslateButton(el, () => {})
    const btn = Array.from(el.children).find(c => c.classList.contains('bt-retranslate'))
    expect(btn).not.toBeUndefined()
  })

  test('点击按钮调用 onRetranslate 并传入元素', () => {
    const onRetranslate = jest.fn()
    addRetranslateButton(el, onRetranslate)
    const btn = Array.from(el.children).find(c => c.classList.contains('bt-retranslate'))
    btn.click()
    expect(onRetranslate).toHaveBeenCalledWith(el)
  })

  test('重复调用不添加重复按钮', () => {
    addRetranslateButton(el, () => {})
    addRetranslateButton(el, () => {})
    const btns = Array.from(el.children).filter(c => c.classList.contains('bt-retranslate'))
    expect(btns.length).toBe(1)
  })
})

describe('removeTranslation with retranslate button', () => {
  test('移除重翻按钮', () => {
    document.body.textContent = ''
    const el = document.createElement('p')
    el.textContent = 'Hello'
    document.body.appendChild(el)
    injectTranslation(el, '你好')
    addRetranslateButton(el, () => {})
    removeTranslation(el)
    const btn = Array.from(el.children).find(c => c.classList.contains('bt-retranslate'))
    expect(btn).toBeUndefined()
  })
})

describe('injectStyles', () => {
  test('多次调用只创建一个 style 元素', () => {
    // Remove any existing bt-styles element first
    const existing = document.getElementById('bt-styles')
    if (existing) existing.remove()

    injectStyles()
    injectStyles()
    const styleElements = document.querySelectorAll('#bt-styles')
    expect(styleElements.length).toBe(1)
  })
})
