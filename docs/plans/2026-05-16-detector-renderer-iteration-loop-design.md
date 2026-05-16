# detector / renderer 迭代闭环方法论

> 状态：已与用户对齐，待转入实施计划（writing-plans）
> 适用范围：`content/detector.js`（DOM 识别）与 `content/renderer.js`（DOM 注入展示）
> 主战浏览器：Chrome（detector/renderer 跨浏览器共享，Chrome 修好 Safari 同样受益）

## 1. 问题本质

detector.js 干的事是 *boilerplate removal / content extraction*：给任意网页，挑出可翻正文块、排除导航/广告/代码/已是目标语言的内容。renderer.js 干的是把译文注入到正确位置且不破坏页面。

这是有成熟先例的老问题，不是新问题。参照对象：

- **Mozilla Readability**（Firefox 阅读模式内核）—— `test/test-pages/` 模式：每个 case 是冻结的真实页面 `source.html` + 期望输出，headless 跑、断言输出稳定。**本方法论的核心范式直接借用它。**
- **Trafilatura / dragnet / dom-distiller** —— 把内容抽取当信息检索问题，对冻结语料算 precision/recall，不靠"看着对"。

认真做这类东西的项目都不纯手动，因为 detector 是一堆相互影响的启发式阈值/黑名单，纯手动必然 whack-a-mole：修好一个站、悄悄弄坏另一个，不重开就发现不了。

## 2. 核心决策：把问题劈成两半

| 半边 | 成熟做法 | 回归保护来源 |
|---|---|---|
| **detector.js（识别）** | Readability 式冻结语料 + jsdom harness 跑判定 dump，机器 diff 查回归 | 机器（确定性 diff） |
| **renderer.js（注入/视觉）** | 固定页面人肉过一遍 + 固定 checklist；computer-use 只帮助**发现**，绝不当验证闸门 | 人（固定 checklist + 冻结 DOM 提供结构回归） |

判定理由：视觉/布局正确性目前没有成熟可信的自动化闸门（截图比对在任意真实站点上 flaky、慢、不确定）。识别正确性则完全可以确定性地回归测。仓库已有 Jest + jsdom + `tests/detector.test.js`，冻结语料是**顺着现有脚手架往前一步**，非过度工程。

## 3. 缺陷分类法（固定词表）

「发现问题」必须系统化，不靠感觉。每个缺陷必须打成下列之一，并映射到大概率根因位置：

| 标签 | 含义 | 大概率根因 |
|---|---|---|
| `MISS` | 正文块漏译（false negative） | detector 过滤过严：块级判断 / shadow DOM / Web Component / 阈值 |
| `JUNK` | 广告/导航/代码/UI label 被翻（false positive） | detector 黑名单/广告信号/SKIP_TAGS 不够 |
| `DUP` | 同一内容翻两次 / 双重注入 | detector 去重（`seen` / `data-bt-translated`）或 MO 重入 |
| `MISPLACE` | 译文注入到错位置（孤儿 / 错 slot / 顺序错） | renderer 注入策略（sibling vs child / slot 判定） |
| `INVISIBLE` | 注入了但不可见 | renderer：shadow DOM / slot / CSS 继承 |
| `LAYOUT` | 注入破坏页面布局（溢出/重叠/抖动） | renderer：注入元素样式 / 容器约束 |
| `GARBLE` | 已是目标语言/混合内容被重翻 | detector：CJK 阈值 / 混合语言判断 |

`MISS / JUNK / DUP / MISPLACE` 基本能在 jsdom harness 里判定。`INVISIBLE / LAYOUT` 是 jsdom 盲区，必须回真实 Chrome 肉眼复验。`GARBLE` 两边都要看。

### 3.1 jsdom-realm 保真边界（Task 3 试点中发现，2026-05-16）

harness 用 `new JSDOM(html)` 建独立 realm，但 `detector.js` 闭包引用的是 jest 全局 `Node` / `getComputedStyle` / `document`。实测得出两个**比设计预期更严重的盲区**，必须在解读 baseline / Task 6 归类 / Task 8 结论时计入：

1. **自定义元素一律被当块级**：`isInlineEl()` 对不在硬编码 INLINE/STRUCTURAL 标签集里的元素（即所有 Web Component / 自定义元素）调用全局 `getComputedStyle`。跨 realm 该调用**每次必抛**，被 detector 的 `catch { return false }` 吞掉 → 自定义元素恒被判为块级。真实浏览器里 `display:inline` 的自定义元素会被 `findBlockContainer` 走过，块容器不同。**后果**：自定义元素重的页面（React 站、The Verge）里，行内自定义元素内文本的 `path/decision` 会**系统性偏离真实浏览器**，且静默无错。
2. **shadow DOM 不可见**：字符串解析的 JSDOM 无 `shadowRoot`，且 `getRootNode() === document` 跨 realm 恒 false → shadow-host 跳过分支永不触发，shadow 内容在 harness 里完全不存在。

**结论修正**：harness 是忠实的**回归 oracle**（确定性，同输入恒同输出，门禁有效），但**不是**真实浏览器 detector 行为的忠实模型——对「自定义元素行内」和「shadow DOM」内容，harness 的判定不可当真。这两类只能靠真实 Chrome 复验。这直接影响 Task 8 对 The Verge（自定义元素重）的结论可信度，也意味着 Task 6 归类时：截图是真相，baseline 对上述两类内容的判定要标注「jsdom 失真，需 Chrome 复验」而非直接当作 detector bug。

## 4. 闭环机制

### 4.1 每个站点的数据采集（驱动真实 Chrome）

1. **干净 DOM 快照**：关掉扩展 → 导航到代表性 URL → 序列化完整 DOM（含 shadow root）→ `tests/fixtures/<site>.html`。这是 harness 输入（必须是扩展未介入的页面结构）。
2. **注入后快照 + 截图**：开扩展 → 等检测/注入跑完 → 截图 + 序列化 → 当视觉/缺陷比对依据。

> jsdom 不跑站点 JS、不渲染布局。所以 fixture 必须从真实 Chrome 抓（含站点已渲染的动态 DOM），harness 只在其上重跑 `getTranslatableElements`。

### 4.2 baseline 决策快照

jsdom 里跑 `getTranslatableElements(fixture)`，输出结构化报告：每个候选块的 `{路径, 文本片段, 判定: TRANSLATE/SKIP, 跳过原因}`，含临界 near-miss。存 `tests/fixtures/<site>.baseline.json`。

### 4.3 缺陷归类 → ledger

截图/实地视图 vs 决策报告对照，按 §3 词表打标，记入 defect ledger（本目录下的 ledger 文件）：`{id, site, class, 文本片段, 期望, 实际, 根因假设, 状态: open/fixed/wontfix/regressed}`。**ledger 是闭环的记忆**——没有它，"再发现"会反复发现同一个问题。

### 4.4 修复闭环（根因纪律）

每个缺陷：最小复现 → 假设是哪条 detector 过滤 / renderer 分支 → 确认实际决策路径 → **修启发式根因（不打站点专属补丁）** → 重跑 harness → 和 baseline diff 当**回归门禁** → `INVISIBLE/LAYOUT` 类回真实 Chrome 复验。

**回归门禁是整套方法论的中心纪律**：一个修复只有在「改善目标 case」且「全语料 diff 无非预期回归」时才接受；有回归则必须显式判定可接受并记入 ledger。

### 4.5 终止条件

全语料 harness pass 干净，或剩余缺陷已在 ledger 显式标 wontfix。

## 5. 试点范围（先验证方法论再铺开）

**不**一上来狂修 bug。先在 2 个真实复杂站点跑完整闭环骨架，验证：这套闭环能否**稳定揪出真问题、且修了不回归**。

- 站点：**Stack Overflow**（code/pre 跳过、行内 code、Q&A+评论线程、UI chrome 误译压力——技术问答是目标用户真实阅读场景）+ **The Verge**（React div 海洋、浓重广告/导航/推荐 chrome、嵌入卡片——MISS×JUNK×LAYOUT 最狠压力）。已排除用户已搞定的 YouTube / X / GitHub / Reddit。
- 前置条件：扩展以「加载已解压」装在 Chrome MCP 控制的 Chrome 里。
- 试点产出：
  - 成立 → 写完整方法论 + 铺语料库（扩展到更多代表性站点）。
  - jsdom 复现不了真实缺陷（shadow DOM / computed style 盲区超预期）→ 如实报告，先修正方法论再铺开。

## 6. YAGNI / 明确不做

- 不做截图自动比对当回归闸门（不成熟、flaky）。
- 不在 detector/renderer 生产热路径里加埋点；「决策追踪」只作为 harness 调用的 debug 函数存在。
- 试点阶段不铺全语料库，只 2 站。
