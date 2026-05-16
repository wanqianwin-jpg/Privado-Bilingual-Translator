# detector/renderer 试点 — 缺陷台账 (defect ledger)

> 闭环的记忆。参照设计文档 [2026-05-16-detector-renderer-iteration-loop-design.md](2026-05-16-detector-renderer-iteration-loop-design.md) §3 缺陷词表、§3.1 jsdom 盲区。

## Task 0 决策记录（2026-05-16）

### 0.1 扩展加载确认 ✅

翻译插件以「加载已解压」装在 Control-Chrome 控制的稳定版 Google Chrome 里，确认在工作：
- Wikipedia/Browser_extension：`#bt-styles` 在、`data-bt-translated`=68、`bt-mode-bilingual`、悬浮球在
- The Verge 文章：`data-bt-translated`=102、`data-bt-sibling-for`=102（已注入译文）
- Python docs：`data-bt-translated`=109

前置条件：Chrome「视图 → 开发者 → 允许 Apple 事件中的 JavaScript」必须勾选，否则 Control-Chrome 的 `execute_javascript`/`get_page_content` 报「Chrome is not running」（标签操作不受影响）。

### 0.2 站点选择变更

| 计划站点 | 状态 | 处置 |
|---|---|---|
| The Verge 文章页 | ✅ 自动化可达，shadow=0，自定义元素仅 1 个无关 Next.js 占位 | **保留** |
| Stack Overflow 问题页 | ❌ 自动化触发 Cloudflare 人机验证（"安全验证"拦截页）。不绕过验证码（安全红线）。用户已授权换站 | **换掉** |
| MDN（SO 候选替代） | ❌ shadowCount=140 / 98 个带文本 shadow root，代码示例在 `<mdn-code-example>` 自定义元素+shadow DOM 里 → 同时踩中 C1+shadow 两个 jsdom 盲区，baseline 会严重失真 | **否决** |
| Python 官方文档 | ✅ 自动化可达，shadow=0，自定义元素=0，30 个 `<pre>` 代码块 + 103 `<p>` + 144 行内 code | **采用，替代 SO** |

**最终两站**：The Verge 文章 + Python 文档。两者 shadow=0、无自定义元素 → §3.1 的 jsdom 保真盲区（自定义元素被强制块级、shadow 不可见）对本试点两站**实测近零影响**，回归门禁方法论可在此干净验证。盲区留档供将来 shadow 重的语料成员（如 MDN）。

### 0.3 fixture 序列化策略

两站 `shadowCount === 0` → 直接用 `document.documentElement.outerHTML` 当 fixture，**无需** Declarative Shadow DOM 序列化。

### 0.4 「干净 DOM」抓取方法

不脚本化切换 chrome://extensions（受限页、不可靠）。改为：抓注入后 DOM，再程序化剥离扩展注入物得到 detector 的干净输入——
- 移除 `[data-bt-sibling-for]` 节点（注入的译文 div）
- 移除 `#bt-styles`、悬浮球节点
- 删除原始元素上的 `data-bt-translated` / `data-bt-sibling-for` 属性

依据：renderer.js 只**新增** sibling/child 节点并打 data 属性，从不改动原始元素的子节点/顺序（设计原则「never touch el's own children」），故剥离后等价于注入前结构快照。可脚本化、可复现、无用户摩擦。

### 0.5 抓取目标 URL（页面会变，URL+时间戳是复现依据）

- The Verge：`https://www.theverge.com/tech/930941/meta-ray-ban-display-virtual-neural-handwriting-apps-developer`
- Python docs：`https://docs.python.org/3/tutorial/classes.html`
- 抓取时间戳：见 Task 4 commit 时间

---

## Task 4 抓取结果（2026-05-16）

| 站点 | fixture | 真实浏览器注入态 |
|---|---|---|
| Python docs | `tests/fixtures/pythondocs.html`（106KB, 0 bt 残留, 30 `<pre>` / 103 `<p>`） | 109 翻译块，**全部可见**，0 pending，仅 1 JUNK（页脚 `div.footer` 版权） |
| The Verge | `tests/fixtures/theverge.html`（202KB, 0 bt 残留, 57 `<p>` / 596 `<div>`） | 102 翻译块，**75 不可见**，~9 真正文，~93 JUNK |

注入态详情见 `tests/fixtures/<site>.injected.json`（分类汇总，完整可由 §0.4 脚本复现）。

### 头条发现（试点核心结论雏形）

- **闭环确实能稳定揪出真问题且区分站点**：Python docs（语义站）近乎干净（1 JUNK）；The Verge（React div-soup 重 chrome 站）~90% 翻译块是 JUNK、75/102 不可见。两站 profile 天差地别。
- **两大根因家族**：
  - **R1 — detector 对普通元素无 visibility/display 过滤** → 翻隐藏 cookie 同意弹窗（Verge 上 ~58 块 JUNK+INVISIBLE）。多属 jsdom 盲区（需真实 computed style），Task 8 据实说明。
  - **R2 — 结构黑名单依赖 `<nav>/<footer>/<aside>/role` 语义标记**，React div-soup 全部漏过 → Verge 导航/推荐/SVG-logo + Python `div.footer` 版权。**jsdom 可测，Task 7 选此家族最小可复现演示修复闭环。**

## Task 5 复审延后项（Minor，pilot 不阻塞，铺语料前处理）

- **M-gitattr**：`翻译插件/.gitattributes` 缺失。`tests/fixtures/*.html` 以原始字符串喂 JSDOM，跨 OS（autocrlf）改行尾会移动 jsdom 解析树 → 回归门禁假阳。铺语料/多人前加 `tests/fixtures/*.html -text` + `*.baseline.json -text`。
- **M-fmt**：`JSON.stringify(,,2)` 无尾换行，prettier/eof-fixer 会制造 1 行无意义 churn（门禁不受影响，仅噪声）。
- **M-pathchurn**：深 `nth-of-type` 路径使结构性 detector 改动产生大段低语义 diff、易合并冲突。缓解＝Task 7 的「regenerate baseline 并在 commit 说明每条变化」纪律。

## Task 6 缺陷归类（harness baseline vs injected.json ground truth，2026-05-16）

方法：`jq` 对 `<site>.baseline.json` 的 TRANSLATE 项按 path 前缀分桶，对照 `<site>.injected.json` 真实浏览器分类。

**关键量化：**
- Python docs：harness 109 TRANSLATE = 真实浏览器 109。**1 JUNK**（footer），108 正确正文。**0 MISS**（两边同集）。
- The Verge：harness 103 TRANSLATE ≈ 真实浏览器 102。分桶：60 = `div:nth-of-type(3)` 同意弹窗，41 = `div:nth-of-type(1)` 应用壳（其中 ~9 真正文 + 余为导航/推荐/订阅 JUNK），2 = footer。**~94 JUNK / ~9 正文。0 显著 MISS。**
- **核心结论**：detector 缺陷压倒性是 **JUNK（过度翻译）**，不是漏译。语义站（Python）近乎完美，div-soup 重 chrome 站（Verge）灾难性过翻。

| id | site | class | text 片段 | 期望 | 实际 | 根因假设 | 状态 | jsdom 可测 |
|----|------|-------|-----------|------|------|----------|------|-----------|
| P1 | pythondocs | JUNK | `© Copyright 2001 Python Software Foundation` (`body>div:nth-of-type(5)`) | SKIP | TRANSLATE | **R2**：BLACKLIST_SELECTOR 匹配 `<footer>` 标签/`[role]`，不匹配 `<div class="footer">` | **fixed**（Task 7，根因修复） | ✅ 是（最小可复现，Task 7 选它） |
| V1 | theverge | JUNK+INVISIBLE | 同意弹窗 60 块（`Manage Consent Preferences`/`Strictly Necessary Cookies`/`checkbox label label` …，`body>div:nth-of-type(3)`） | SKIP | TRANSLATE | **R1**：detector 对普通元素无 visibility/display 过滤；弹窗 `display:none` 经 CSS class 非 `[hidden]` 属性 → 漏过 | open | ✘ 多属 jsdom 盲区（需真实 computed style；harness 仍 TRANSLATE 它们=确定性失真） |
| V2 | theverge | JUNK | 顶部导航整块 + SVG logo 文本（`body>div:nth-of-type(1)` 内 nav 区） | SKIP | TRANSLATE | **R2**：导航是 `<div>` 堆非 `<nav>`；容器上溯到导航大 div | open | ✅ 是 |
| V3 | theverge | JUNK | 相关推荐/信息流模块 + 作者时间戳 byline（`...main>article>...` 内 recirc div） | SKIP | TRANSLATE | **R2**：recirc 模块无 `<aside>`/role 语义标记 | open | ✅ 是 |
| V4 | theverge | JUNK | 订阅 CTA `The Verge DailyA free daily digest` + `By submitting your email…` + 评论计数 SPAN | SKIP | TRANSLATE | **R2** 同族：无语义标记的 CTA/UI chrome | open | ✅ 是 |
| V5 | theverge | JUNK | footer 区 2 块（`body>div:nth-of-type(5)`） | SKIP | TRANSLATE | **R2** 同 P1（div 非 `<footer>`） | **fixed**（Task 7 同根因连带解决：2 块均在 `div#zephr-zone-footer.zephr-zone-footer` 内，class/id 含 `footer` 被 STRUCT_ATTR_SELECTOR 命中） | ✅ 是 |

**根因收敛**：除 V1（R1，可见性，多 jsdom 盲区）外，**P1/V2/V3/V4/V5 全是 R2 同一家族**——detector 结构黑名单依赖 `<nav>/<footer>/<aside>/role` 语义标记，对 React/div-soup 站点全面失效。修 R2 一处根因可同时压制 5 类缺陷里的绝大多数。

**Task 7 选 P1**：R2 家族最小、最干净、jsdom 完全保真的可复现，单条 baseline 翻转，根因明确，修法可泛化到 V2-V5。

---

## Task 7 修复闭环记录（2026-05-16）

完整 RED → 根因修复 → 回归门禁 delta 分类 → baseline 重生 → 全绿，方法论可见地走完一遍。

### 根因修复（泛化启发式，非站点补丁）

`content/detector.js`，照搬已有 `AD_KEYWORDS → AD_ATTR_SELECTOR` 机制新增结构样板关键词：

- 新增 `STRUCT_KEYWORDS = ['footer']`（YAGNI：仅 `footer`，刻意不含 `header`/`nav`/`sidebar`——`header` 会误伤 `<div class="article-header">` 真标题，须有回归证据才扩词）。
- 新增 `STRUCT_ATTR_SELECTOR = STRUCT_KEYWORDS.map(kw => `[class*="${kw}" i],[id*="${kw}" i]`).join(',')`（与 `AD_ATTR_SELECTOR` 同构）。
- `hasBlacklistedAncestor` 改为 `!!(el.closest(BLACKLIST_SELECTOR) || el.closest(STRUCT_ATTR_SELECTOR))`。

一处改动同时覆盖 `getTranslatableElements`（TextNode walker）与 `shouldTranslate`（MutationObserver 路径），两者都经 `hasBlacklistedAncestor`，复用既有 `blacklisted-ancestor` 原因，无新原因类别。**无任何站点名（python/verge）硬编码。**

### RED → GREEN

- 新增 `tests/detector-footer.test.js`（`new JSDOM` 镜像真实 `<div class="footer"> © Copyright 2001 Python Software Foundation...` + 一个真正文 `<p>`）。
- RED：`tests/detector-footer.test.js:23` `expect(footerEntry.decision).toBe('SKIP')` → Expected `"SKIP"` Received `"TRANSLATE"`。
- GREEN（修复后）：footer = `SKIP / blacklisted-ancestor`，真正文仍 `TRANSLATE`，结果集只剩真正文一块（守住「修复过头变 MISS」）。

### 精确 baseline delta（全部分类为 intended JUNK→SKIP，0 MISS，0 SKIP→TRANSLATE）

| 站点 | TRANSLATE 数 | 翻转条目 | path | text 片段 | 分类 |
|---|---|---|---|---|---|
| pythondocs | 109 → **108**（−1） | 1 | `body>div:nth-of-type(5)` | `© Copyright 2001 Python Software Foundation...` | intended（P1 页脚版权样板 JUNK） |
| theverge | 103 → **101**（−2） | 2 | `body>div:nth-of-type(5)>…>div(1)` | `Continue reading with a Verge subscription / Unlock unlimited access…` | intended（V5 footer 区订阅 CTA JUNK，在 `div#zephr-zone-footer`） |
| theverge | | | `body>div:nth-of-type(5)>…>div(2)>div(2)` | `Already a subscriber? Sign in…` | intended（V5 footer 区登录 CTA JUNK，同 `zephr-zone-footer`） |

`summarize` 头条 delta：两站均为纯粹 `TRANSLATE:- → SKIP:blacklisted-ancestor`（python +1，verge +2），无任何其它桶变化。**确认无真正文被改成 MISS，无 SKIP→TRANSLATE。** 决策：**修复被接受**，删除两个旧 baseline 后 `UPDATE_BASELINES=1` 重生，plain 门禁复跑通过。

### 连带解决

- **P1 → fixed**（直接目标）。
- **V5 → fixed**（同一根因连带：The Verge 两块 footer 区 JUNK 均在 `div#zephr-zone-footer.zephr-zone-footer` 内，class/id 含 `footer` 被新选择器命中）。
- V2/V3/V4 未被本次 `footer`-only 关键词触及（导航/recirc/订阅 CTA 非 `footer` 类名），仍 open——验证了「窄关键词＝可控范围」纪律：根因机制已就位，扩词须各自的回归 delta 证据。

### 全套结果

`npx jest` → **9 suites / 48 tests 全绿**（原 8/47 + 新 `detector-footer` 套件 1 test）。回归门禁对重生后的 baseline 通过。临时 delta 脚本已删除（未留残骸）。

（后续 polish 提交 `a524232`：union 两个 `closest()` 为单次祖先遍历——门禁对**未改动**的 baseline 仍绿、`git diff tests/fixtures` 空，自证行为等价；加 1 个 characterization test 钉死 substring 局限。最终 **9 suites / 49 tests 全绿**。）

---

## Task 8 试点结论（2026-05-16）

回答设计文档 §5 的三个验证问题：

### Q1：闭环能否稳定揪出真问题？ —— **能，且强。**

- 两站 profile 被干净区分：Python docs（语义站）109 翻译块仅 **1 JUNK / 0 MISS**；The Verge（React div-soup 重 chrome 站）~103 翻译块 **~94 JUNK / 75 INVISIBLE / 0 MISS**。
- 缺陷被系统归类（P1/V1-V5），且暴露**根因收敛**：6 个缺陷里 5 个属同一根因家族 R2（结构黑名单依赖语义标记，div-soup 失效）。一处根因修复（`footer` class/id）同时连带解决 P1+V5——证明方法论产出的是**可泛化根因修复**，不是 whack-a-mole 站点补丁。这是闭环最有价值的产出。
- 核心定性发现：detector 缺陷压倒性是 **JUNK（过度翻译）**而非漏译；语义站近乎完美，div-soup 站灾难性过翻。这是对真实产品有指导意义的结论。

### Q2：回归门禁真能拦回归？ —— **能，硬证据三重。**

1. Task 5 Step 3：`MIN_TEXT_LENGTH=20→999` → 两站门禁双双 FAIL（TRANSLATE 109→0、103→0），revert → PASS。
2. 审查阶段独立篡改 baseline 单条 → 门禁 FAIL；篡改 detector → FAIL。
3. Task 7 修复实战走通完整门禁闭环：改 detector → 门禁 FAIL → 独立重算 delta 分类（恰 3 翻转全 intended JUNK→SKIP，0 MISS）→ 重生 baseline → PASS；随后 union 优化由门禁「对未改 baseline 仍绿」自证行为等价。门禁在「该响的响、不该响的不响」两个方向都验证有效。

并发现并堵住门禁自身完整性漏洞：silent-bootstrap footgun（baseline 缺失静默重建变绿）已改为缺失即硬失败（需显式 `UPDATE_BASELINES=1`）。

### Q3：jsdom 盲区实际多大？ —— **如设计预期，且方法论有自我意识。**

- **本试点两站近零影响**：两站 shadow=0、无意义自定义元素 → harness baseline（Python 109 / Verge 103 TRANSLATE）≈ 真实浏览器（109 / 102）。`MISS/JUNK/DUP/MISPLACE` 在 jsdom 里被忠实判定。
- **方法论自我意识**：MDN 因 shadowCount=140 + 代码在 `<mdn-code-example>` 自定义元素被**主动否决**——选站阶段就识别并规避了 C1+shadow 盲区，而非事后翻车。这本身是方法论稳健性的验证。
- **R1（可见性）确属真盲区**：Verge 60 块同意弹窗 JUNK+INVISIBLE，harness 仍 TRANSLATE 它们（确定性失真），jsdom 判不了「隐藏弹窗」。但试点的**真实 Chrome 抓取步骤（injected.json）补上了这块**——INVISIBLE/LAYOUT 由真实浏览器 ground truth 判定，正如设计 §3/§3.1 所定。

### 总结论：方法论成立，可铺开

「冻结语料 + jsdom harness + 确定性回归门禁 + 真实 Chrome 抓取补视觉盲区」这套闭环，在 detector 半边对 jsdom-faithful 站点（低/无 shadow）**成立且高效**：能稳定揪出真问题、产出可泛化根因修复、拦得住回归、并对自身盲区有清醒边界。renderer/视觉半边（INVISIBLE/LAYOUT）经实证确需真实 Chrome 复验、非 jsdom——与设计一致，抓取管线即其机制。

**下一步（铺语料前的硬化跟进，按优先级）：**
1. `[class*="footer" i]` substring → token 锚定匹配（防 BEM `__footer-note` 误伤真内容 MISS），并把 trace reason 拆 `blacklisted-ancestor` vs `chrome-class-ancestor`（保 ledger 按 reason 归类的诊断力）——同一提交内翻转 characterization test，使精度变更可审计。
2. 加 `翻译插件/.gitattributes`：`tests/fixtures/*.html -text` + `*.baseline.json -text`（防跨 OS 行尾假阳）。
3. 扩语料：复用 Tasks 1-5 基建，纳入更多代表站点；shadow 重站点（如 MDN）须先解决 jsdom-realm 保真（§3.1）或显式标注为真实-Chrome-only 复验。
4. R1 可见性过滤：在 detector 加 display/visibility 检查属真实产品改进方向（Verge 类站点收益最大），但其验证须真实 Chrome（jsdom 盲区），不能仅靠 harness。
