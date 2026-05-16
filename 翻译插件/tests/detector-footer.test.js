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

  // 特征化测试（pin 当前行为）：[class*="footer" i] 子串匹配存在已知误伤——
  // BEM/复合内容类名只要包含 token "footer"（如 article__footer-note）就会被
  // 当作页脚样板 SKIP，即便它其实是正文。这是试点阶段已接受的局限（回归门
  // 是安全网，扩规模时再收紧），见 detector.js 中 STRUCT_KEYWORDS 附近的说明。
  // 此处钉住当前 SKIP，使将来把 STRUCT 匹配收紧为 token 锚定时，本期望应在
  // 同一 commit 内翻转为 TRANSLATE，成为可审计的、有意为之的基线变更而非静默漂移。
  test('BEM 复合类名含 "footer" 子串的正文当前被误判 SKIP（已知子串匹配局限）', () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>
      <p class="article__footer-note">
        BEMFOOTERENTRY This is a real article footnote paragraph in English, long enough to translate normally and not actually page chrome.
      </p>
    </body></html>`)
    const doc = dom.window.document

    const trace = []
    getTranslatableElements(doc.body, { trace })

    const bemEntry = trace.find(e => e.text && e.text.includes('BEMFOOTERENTRY'))
    expect(bemEntry).toBeDefined()
    expect(bemEntry.decision).toBe('SKIP')
  })
})
