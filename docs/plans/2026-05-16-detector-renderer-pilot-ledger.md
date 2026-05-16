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

## 缺陷表

| id | site | class | text 片段 | 期望 | 实际 | 根因假设 | 状态 |
|----|------|-------|-----------|------|------|----------|------|
| _(Task 6 填充)_ | | | | | | | |
