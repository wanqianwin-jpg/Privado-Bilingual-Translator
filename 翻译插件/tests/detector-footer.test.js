const { JSDOM } = require('jsdom')
const { getTranslatableElements } = require('../content/detector.js')

// 复现 P1 缺陷（根因 R2）：BLACKLIST_SELECTOR 只匹配语义标签 <footer> 与
// [role]，对非语义的 <div class="footer"> 页脚样板文字漏过 → 被判 TRANSLATE。
// 真实页面（Python docs）footer 结构：<div class="footer"> © <a>Copyright</a>
// 2001 Python Software Foundation. ...。最小 DOM 镜像该结构。
describe('detector: class/id-based footer 样板应 SKIP（R2 根因）', () => {
  test('div.footer 版权样板 -> SKIP（黑名单），真正文 <p> 仍 TRANSLATE', () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>
      <p>CONTENTENTRY This is a real article paragraph in English, long enough to translate normally.</p>
      <div class="footer">
        FOOTERENTRY © Copyright 2001 Python Software Foundation. This page is licensed under the Python Software Foundation License Version 2.
      </div>
    </body></html>`)
    const doc = dom.window.document

    const trace = []
    const result = getTranslatableElements(doc.body, { trace })

    const footerEntry = trace.find(e => e.text && e.text.includes('FOOTERENTRY'))
    expect(footerEntry).toBeDefined()
    expect(footerEntry.decision).toBe('SKIP')
    // 理想情况：原因指明黑名单（与 <footer>/<nav> 路径一致）
    expect(footerEntry.reason).toBe('blacklisted-ancestor')

    // 防止修复过头变成 MISS：真正文必须仍然 TRANSLATE
    const contentEntry = trace.find(e => e.text && e.text.includes('CONTENTENTRY'))
    expect(contentEntry).toBeDefined()
    expect(contentEntry.decision).toBe('TRANSLATE')

    // 结果集只含真正文那一块
    expect(result.length).toBe(1)
    expect(result[0].textContent).toContain('CONTENTENTRY')
  })
})
