const { injectTranslation, removeTranslation, setDisplayMode } = require('../content/renderer.js')

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
  })

  test('removeTranslation 移除注入的译文', () => {
    const el = document.getElementById('para')
    injectTranslation(el, '你好')
    removeTranslation(el)
    expect(el.querySelector('.bt-translation')).toBeNull()
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
})
