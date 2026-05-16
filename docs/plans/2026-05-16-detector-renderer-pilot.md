# detector/renderer 迭代闭环 — 试点实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 Stack Overflow + The Verge 两个真实站点上跑通 detector/renderer 迭代闭环的最小骨架，验证「冻结语料 + jsdom harness + 回归门禁」这套方法论能否稳定揪出真问题且修了不回归。

**Architecture:** 给 `detector.js` 加 debug-only 决策追踪（不进生产热路径）；写一个 jsdom 脚本把冻结 HTML fixture 跑成结构化「判定 dump」；用 Jest 把 dump 和已提交 baseline 做确定性 diff 当回归门禁。fixture 由我驱动真实 Chrome 抓取。视觉/布局类缺陷回 Chrome 肉眼复验，不自动化。

**Tech Stack:** Jest + jsdom（已有）、`jsdom` 的 `JSDOM` 构造器载入 fixture、Chrome MCP（`mcp__claude-in-chrome__*`）驱动真实浏览器抓 fixture。

参照设计文档：[docs/plans/2026-05-16-detector-renderer-iteration-loop-design.md](2026-05-16-detector-renderer-iteration-loop-design.md)

测试夹具一律用 `new JSDOM(htmlString)` 载入静态 fixture，不用赋值 DOM HTML 属性的写法（受控输入但避免无谓告警）。

---

## Task 0: 前置确认 — 扩展已加载 + shadow DOM 序列化可行性

**这是 spike，不写产品代码。先排除两个会让整套方法论失效的风险。**

**Step 1: 确认扩展已加载进 Chrome MCP 控制的 Chrome**

用 `mcp__claude-in-chrome__list_connected_browsers` / `navigate` 到 `chrome://extensions`，确认 `翻译插件/` 以「加载已解压」方式存在且启用。
- 若未加载：停下，让用户在 Chrome 里 `加载已解压 → 选 翻译插件/`，并确认 Chrome MCP 扩展已连接。这是硬前置，不能跳过。

**Step 2: 抓一个 shadow DOM 探针，决定序列化策略**

navigate 到 `https://stackoverflow.com/questions`（任意问题列表页），在页面里跑：

```js
(() => {
  let shadowCount = 0;
  const walk = n => { if (n.shadowRoot) shadowCount++; n.childNodes && n.childNodes.forEach(walk); };
  walk(document.documentElement);
  return { shadowCount, htmlLen: document.documentElement.outerHTML.length };
})()
```

对 The Verge 文章页同样跑一遍。

**Step 3: 记录决策（写进 ledger 文件头部，见 Task 4）**

- `shadowCount === 0`（两站都是）→ 直接用 `documentElement.outerHTML` 当 fixture，无需 shadow 序列化。**预期 SO/Verge 属于此类**（重 shadow DOM 的 Reddit/YT 用户已自行处理，不在本试点）。
- `shadowCount > 0` → fixture 用 Declarative Shadow DOM 序列化（`getHTML({ serializableShadowRoots:true })` 若可用，否则手动把每个 shadowRoot 内容包进 `<template shadowrootmode="open">`）。并加一条 ledger 风险项：jsdom 不解析 DSD，受影响缺陷类需回 Chrome 复验。

**Step 4: Commit**

```bash
git add docs/plans/2026-05-16-detector-renderer-pilot-ledger.md
git commit -m "chore: pilot task0 — extension load + shadow DOM serialization decision"
```

---

## Task 1: detector.js 加 debug-only 决策追踪

**Files:**
- Modify: `翻译插件/content/detector.js`
- Test: `翻译插件/tests/detector-trace.test.js`（新建）

**为什么**：`getTranslatableElements` 只返回「留下的元素」，拿不到「为什么被跳过」。决策追踪是根因定位的核心。必须 debug-only：不传 trace 时零行为变化、零开销。

**Step 1: 写失败测试**

`翻译插件/tests/detector-trace.test.js`（用 `JSDOM` 载入受控片段）：

```js
const { JSDOM } = require('jsdom')
const { getTranslatableElements } = require('../content/detector.js')

const mount = html => new JSDOM(`<body>${html}</body>`).window.document.body

describe('decision trace (debug-only)', () => {
  test('不传 trace 时行为不变（返回元素数组）', () => {
    const body = mount('<p>Hello world this is a test paragraph here.</p>')
    const res = getTranslatableElements(body)
    expect(Array.isArray(res)).toBe(true)
    expect(res.length).toBe(1)
  })

  test('传 trace 数组时记录跳过原因', () => {
    const body = mount(
      '<nav><p>This navigation text should be skipped here</p></nav>' +
      '<p>This real paragraph should be translated for sure.</p>')
    const trace = []
    getTranslatableElements(body, { trace })
    const nav = trace.find(t => /navigation text should be skipped/.test(t.text))
    expect(nav).toBeDefined()
    expect(nav.decision).toBe('SKIP')
    expect(nav.reason).toBe('blacklisted-ancestor')
    const kept = trace.find(t => /real paragraph should be translated/.test(t.text))
    expect(kept.decision).toBe('TRANSLATE')
  })
})
```

> 注：`getTranslatableElements` 内部用全局 `Node` / `getComputedStyle`。用 `JSDOM` 的 `window.document.body` 作 root 时，确认 detector 引用的是元素自身 `ownerDocument` 的全局而非 jest 全局；若不兼容，改用 jest-jsdom 全局 `document` 并用 `DOMParser` 解析 fixture 后 `document.body.append(...importedNodes)`。这一步在 Step 2 跑测时会暴露，按实际报错调整。

**Step 2: 跑测试确认失败**

Run: `cd 翻译插件 && npx jest tests/detector-trace.test.js`
Expected: 第二个 test FAIL（trace 未被填充 / reason undefined）

**Step 3: 最小实现**

在 `getTranslatableElements` 的 TextNode 分支，每个 `return` 前按已有判断写入 trace。给 `walk` 闭包加一个 helper（仅当 `trace` 传入时调用）。每个现有跳过分支映射一个稳定 reason 字符串：

- `text.length < minLength` → `too-short`
- `text.length > MAX_TEXT_LENGTH` → `too-long`
- `isMostlyCJK(text)` → `mostly-cjk`
- `shouldSkipText(text)` → `skip-pattern`
- `hasBlockChildren(container)` → `has-block-children`
- `hasBlacklistedAncestor(container)` → `blacklisted-ancestor`
- `container.closest('[hidden]')` → `hidden`
- `hasAdSignal(container)` → `ad-signal`
- 已存在的 `data-bt-translated` / `btSiblingFor` / 重复 seen / shadow-host → `already-handled`
- 通过全部 → `decision:'TRANSLATE'`

trace 记录形如 `{ decision:'SKIP'|'TRANSLATE', reason, text: text.slice(0,80), el: container }`（`el` 仅 jsdom/调试用，生产不传 trace 故无泄漏）。签名改为 `getTranslatableElements(root = document.body, { minLength = MIN_TEXT_LENGTH, trace = null } = {})`，`trace` 为 null 时所有 trace 写入语句短路。

**Step 4: 跑测试确认通过 + 全量回归**

Run: `cd 翻译插件 && npx jest`
Expected: 新测试 PASS，且 `tests/detector.test.js` 全部仍 PASS（证明零行为变化）。

**Step 5: Commit**

```bash
git add 翻译插件/content/detector.js 翻译插件/tests/detector-trace.test.js
git commit -m "feat: add debug-only decision trace to detector"
```

---

## Task 2: 稳定元素路径工具（diff 需要稳定身份）

**Files:**
- Create: `翻译插件/tests/harness/dom-path.js`
- Test: `翻译插件/tests/harness/dom-path.test.js`

**为什么**：回归 diff 要跨运行比对「同一个块的判定变没变」，需要稳定的元素标识。用 `tag:nth-of-type` 链 + 文本前 80 字符。

**Step 1: 写失败测试**

```js
const { JSDOM } = require('jsdom')
const { domPath } = require('./dom-path')

test('生成稳定 nth-of-type 路径', () => {
  const doc = new JSDOM('<body><div><p>a</p><p id="t">target text</p></div></body>').window.document
  const el = doc.getElementById('t')
  expect(domPath(el)).toBe('body>div:nth-of-type(1)>p:nth-of-type(2)')
})
```

**Step 2: 跑测试确认失败**

Run: `cd 翻译插件 && npx jest tests/harness/dom-path.test.js`
Expected: FAIL（模块不存在）

**Step 3: 最小实现**

`dom-path.js`：从 el 向上走到 body，每层 `tagName.toLowerCase() + ':nth-of-type(k)'`（k = 在同 tag 兄弟中的序号），到 body 停，join `>`。导出 `{ domPath }`。

**Step 4: 跑测试确认通过**

Run: `cd 翻译插件 && npx jest tests/harness/dom-path.test.js`
Expected: PASS

**Step 5: harness 侧用 path（detector.js 不依赖测试目录）**

detector.js 的 trace 只记 `el` 引用；由 harness（Task 3）调用 `domPath(t.el)` 算路径。确认 Task 1 trace 结构已含 `el`，无需改 detector.js。

**Step 6: Commit**

```bash
git add 翻译插件/tests/harness/dom-path.js 翻译插件/tests/harness/dom-path.test.js
git commit -m "feat: stable dom-path util for regression diff"
```

---

## Task 3: fixture → 判定 dump 脚本

**Files:**
- Create: `翻译插件/tests/harness/dump-decisions.js`
- Test: `翻译插件/tests/harness/dump-decisions.test.js`

**为什么**：把冻结 HTML 跑成结构化判定 dump（baseline 与回归对比的共同格式）。

**Step 1: 写失败测试**

```js
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
```

**Step 2: 跑测试确认失败**

Run: `cd 翻译插件 && npx jest tests/harness/dump-decisions.test.js`
Expected: FAIL（模块不存在）

**Step 3: 最小实现**

`dump-decisions.js` 导出 `dumpDecisions(html)`：
1. `const { JSDOM } = require('jsdom')`；`const doc = new JSDOM(html).window.document`
2. `const trace = []; require('../../content/detector.js').getTranslatableElements(doc.body, { trace })`
3. `return trace.map(t => ({ path: domPath(t.el), decision: t.decision, reason: t.reason || null, text: t.text })).sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)`

**Step 4: 跑测试确认通过**

Run: `cd 翻译插件 && npx jest tests/harness/dump-decisions.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add 翻译插件/tests/harness/dump-decisions.js 翻译插件/tests/harness/dump-decisions.test.js
git commit -m "feat: fixture-to-decision-dump harness"
```

---

## Task 4: 抓 2 个站点 fixture（交互步骤 — 我驱动 Chrome）

**这一步不是 TDD 代码，是用 Chrome MCP 实地抓取。产出文件提交进仓库。**

**Files:**
- Create: `翻译插件/tests/fixtures/stackoverflow.html`（扩展关闭，干净 DOM）
- Create: `翻译插件/tests/fixtures/theverge.html`
- Create: `翻译插件/tests/fixtures/stackoverflow.injected.png`（扩展开启截图）
- Create: `翻译插件/tests/fixtures/theverge.injected.png`
- Create: `docs/plans/2026-05-16-detector-renderer-pilot-ledger.md`（缺陷台账，Task 0 已建头部）

**Step 1: 选定代表性 URL**

- SO：一个有代码块/行内 code/被采纳答案/评论的真实问题页（非列表页）。
- The Verge：一篇正文长、带 pull quote / 嵌入卡片 / newsletter CTA 的文章页。
- 记录确切 URL + 抓取时间戳进 ledger（页面会变，这是复现依据）。

**Step 2: 抓干净 DOM（扩展关闭）**

chrome://extensions 关闭扩展 → navigate 到 URL → 等加载完 → 跑 Task 0 决定的序列化表达式 → 存为 `tests/fixtures/<site>.html`。

**Step 3: 抓注入后截图（扩展开启）**

开启扩展 → 同 URL 重新加载 → 等检测/注入跑完 → 全页截图存 `<site>.injected.png` → 另存注入后 outerHTML 备查（可选，命名 `<site>.injected.html`）。

**Step 4: Commit**

```bash
git add 翻译插件/tests/fixtures/ docs/plans/2026-05-16-detector-renderer-pilot-ledger.md
git commit -m "test: capture SO + The Verge fixtures (clean DOM + injected screenshot)"
```

---

## Task 5: baseline 判定 dump + 回归门禁

**Files:**
- Create: `翻译插件/tests/fixtures-regression.test.js`
- Create: `翻译插件/tests/fixtures/stackoverflow.baseline.json`
- Create: `翻译插件/tests/fixtures/theverge.baseline.json`

**Step 1: 写门禁测试**

```js
const fs = require('fs')
const path = require('path')
const { dumpDecisions } = require('./harness/dump-decisions')

const SITES = ['stackoverflow', 'theverge']
describe('fixture regression gate', () => {
  for (const site of SITES) {
    test(`${site} 判定与 baseline 一致`, () => {
      const html = fs.readFileSync(path.join(__dirname, `fixtures/${site}.html`), 'utf8')
      const current = dumpDecisions(html)
      const baselinePath = path.join(__dirname, `fixtures/${site}.baseline.json`)
      if (!fs.existsSync(baselinePath)) {
        fs.writeFileSync(baselinePath, JSON.stringify(current, null, 2))
        return  // 首次生成 baseline
      }
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
      expect(current).toEqual(baseline)
    })
  }
})
```

**Step 2: 首跑生成 baseline**

Run: `cd 翻译插件 && npx jest tests/fixtures-regression.test.js`
Expected: PASS（首跑写入 baseline.json）

**Step 3: 确认门禁真的会拦回归**

临时把 detector.js 某阈值改坏（如 `MIN_TEXT_LENGTH` 改 999）→ 重跑该测试 → Expected: FAIL 且 diff 指出消失的 TRANSLATE 条目 → 还原改动 → 重跑 → PASS。
这一步证明回归门禁有效，是方法论成立的关键证据，结果写进 ledger。

**Step 4: Commit**

```bash
git add 翻译插件/tests/fixtures-regression.test.js 翻译插件/tests/fixtures/*.baseline.json
git commit -m "test: baseline decision dumps + regression gate for SO + The Verge"
```

---

## Task 6: 缺陷归类 → ledger（分析步骤）

**对每个站点**：并排看 `<site>.injected.png`（视觉）+ `<site>.baseline.json`（判定），按设计文档 §3 词表逐条打标，写入 ledger：

```
| id | site | class | text 片段 | 期望 | 实际 | 根因假设 | 状态 |
```

- 截图里漏译的正文 → 在 baseline 里查它的 `reason` → MISS，根因假设=该 reason 对应的过滤分支
- 截图里被翻的广告/导航/代码 → JUNK
- 错位/不可见/破版 → MISPLACE/INVISIBLE/LAYOUT（jsdom 盲区，标注「需 Chrome 复验」）

**产出**：每站点一张缺陷表。若两站点 0 缺陷 → 仍是有效结论（说明 SO/Verge 已 OK），ledger 记明并直接进 Task 8。

Commit：`git commit -m "docs: pilot defect ledger for SO + The Verge"`

---

## Task 7: 演示一次完整修复闭环（仅当 Task 6 有缺陷）

挑信号最强、且属 jsdom 可判定类（MISS/JUNK/DUP/MISPLACE）的**一个**缺陷，走完整闭环证明「修了不回归」：

1. **写失败测试**：新增定向用例，从 fixture 切出最小片段（`new JSDOM` 载入），断言期望判定。
2. **跑确认失败**：`npx jest` → 该断言 FAIL。
3. **修 detector.js 或 renderer.js 根因**（改启发式，不打站点专属补丁）。
4. **跑定向断言确认通过**。
5. **跑回归门禁**：`npx jest tests/fixtures-regression.test.js` → 若 baseline 变化，逐条审视 diff：是预期改善还是非预期回归。预期 → 重生成 baseline 并在 commit message 说明每条变化；非预期回归 → 不接受该修法，回 step 3。
6. **LAYOUT/INVISIBLE 类**：回 Chrome 同 URL 肉眼复验注入效果。
7. **更新 ledger** 状态为 fixed，记录根因与 baseline 变化。
8. Commit：`git commit -m "fix: <缺陷简述> + regenerate affected baselines"`

---

## Task 8: 试点结论

在 ledger 末尾写「试点结论」段，回答设计文档 §5 的验证问题：

- 这套闭环在 SO + Verge 上**是否稳定揪出真问题**？（列出缺陷数与类型分布）
- 回归门禁**是否真的拦住回归**？（引用 Task 5 Step 3 的证据）
- jsdom 盲区（INVISIBLE/LAYOUT/shadow DOM）实际有多大？是否如设计预期？
- 结论：成立 → 下一步铺语料库（更多代表站点，复用 Task 1-5 基建）；不成立 → 具体哪里失效、方法论怎么修正。

Commit：`git commit -m "docs: pilot verdict"`

---

## YAGNI 边界（试点不做）

- 不铺全语料库，只 2 站。
- 不做截图自动比对。
- 不在生产热路径加埋点（trace 仅 debug-only）。
- 不批量修缺陷，只演示**一个**完整修复闭环证明门禁有效。
