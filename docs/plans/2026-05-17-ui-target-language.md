# 界面语言 + 翻译目标语言（浏览器默认 + 可修正）实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 `uiLang`（扩展界面语言）与 `targetLang`（翻译目标语言）两个独立旋钮各自按浏览器语言推导默认、用户可在 popup 修正；修掉 `targetLang` 硬编码 `'zh'` 的 bug。

**Architecture:** 两个 `chrome.storage.local` 键，缺失即由 `chrome.i18n.getUILanguage()` 经纯映射函数推导并固化。界面语言需自建运行时 i18n（chrome.i18n 锁浏览器语言）：特权上下文 fetch `_locales/<loc>/messages.json` → 规范化 → 缓存进 storage，全上下文经 `btI18n` 读，三级回退（选定 locale → en → `chrome.i18n.getMessage`）。

**Tech Stack:** 纯 JS（无构建步骤）、Chrome MV3、Jest + jsdom。

参照设计：[2026-05-17-ui-target-language-defaults-design.md](2026-05-17-ui-target-language-defaults-design.md)

**全局约束（每个任务都适用）：**
- 不碰 `content/detector.js` 与 `tests/fixtures/*.baseline.json`（试点回归门禁必须保持绿）。
- 每任务 subagent 实现 → 规格审 → 质量审；**只本地 commit，不 push**。
- 全量 `cd /Users/qianwan/Privado/翻译插件 && npx jest` 每任务后必须全绿（当前基线 13 套件 / 78 测试）。
- 仓库风格：CommonJS-ish、无分号、2 空格缩进；导出守卫 `if (typeof module !== 'undefined') { module.exports = {...} }`（沿用 detector.js/shared/config.js 约定）。
- git 从 `/Users/qianwan/Privado` 跑；扩展代码在 `翻译插件/`。

---

### Task 1: 浏览器语言 → uiLang/targetLang 纯映射

**Files:**
- Create: `翻译插件/shared/lang-map.js`
- Test: `翻译插件/tests/lang-map.test.js`

**Step 1: 写失败测试** — 覆盖：`mapToTargetLang('zh-CN')→'zh'`、`'zh-TW'→'zh-TW'`、`'zh-Hant'→'zh-TW'`、`'pt-BR'→'pt-BR'`、`'pt-PT'→'pt-BR'`、`'en-US'→'en'`、`'de'→'de'`、`'fr-FR'→'fr'`、`'ja'→'ja'`、`'xx-YY'(不支持)→'en'`、空/undefined→'en'；`mapToUiLang` 同理但目标是发布 locale 集（含 Task 7 的 ja/ko/ru/ar/pt_BR；注意 `mapToUiLang` 返回 chrome locale 目录名规范：`zh→zh_CN`、`zh-TW→zh_TW`、`pt-BR→pt_BR`，其余同码）。

**Step 2: 跑测试确认失败** — `cd /Users/qianwan/Privado/翻译插件 && npx jest tests/lang-map.test.js` → FAIL（模块不存在）。

**Step 3: 最小实现** — `shared/lang-map.js`：两个纯函数。规则：取 `String(lang||'').toLowerCase()`；先精确特例（`zh-hant`/`zh-tw`→繁、`zh`/`zh-hans`/`zh-cn`→简、`pt`*→pt-BR），否则取主子标签 `split('-')[0]`，命中支持集返回，否则 `'en'`。`SUPPORTED_TARGET = ['zh','zh-TW','en','ja','ko','fr','de','es','ru','ar','it','pt-BR']`，`SUPPORTED_UI_LOCALE = ['zh_CN','zh_TW','en','ja','ko','fr','de','es','ru','ar','it','pt_BR']`。导出 `{ mapToTargetLang, mapToUiLang, SUPPORTED_TARGET, SUPPORTED_UI_LOCALE }` + 守卫。

**Step 4: 跑测试确认通过 + 全量** — `npx jest tests/lang-map.test.js` PASS；`npx jest` 全绿。

**Step 5: Commit**
```
git -C /Users/qianwan/Privado add 翻译插件/shared/lang-map.js 翻译插件/tests/lang-map.test.js
git -C /Users/qianwan/Privado commit -m "feat: browser-language → uiLang/targetLang pure mapping"
```

---

### Task 2: targetLang 懒推导默认（修真 bug，可独立交付）

**Files:**
- Modify: `翻译插件/shared/config.js`（加 `resolveTargetLang`，仿现有 `resolveTranslateMode`）
- Modify 读取点（把 `targetLang = 'zh'` 默认改为走 `resolveTargetLang`）：`翻译插件/content/content.js:5`、`翻译插件/popup/popup.js:23`、`翻译插件/background/service-worker.js:67,101,318`、`翻译插件/options/options.js:100`、`翻译插件/content/reddit.js:5,214`、`翻译插件/content/youtube.js:13,27`、`翻译插件/content/gmail.js:6,178`
- Test: `翻译插件/tests/resolve-target-lang.test.js`

**Step 1: 写失败测试** — `resolveTargetLang(stored, browserLang)`：`stored.targetLang` 存在→原样返回；缺失→`mapToTargetLang(browserLang)`。断言：`{targetLang:'fr'}`→`'fr'`；`{}` + `'de-DE'`→`'de'`；`{}` + `'th'`→`'en'`。

**Step 2: 跑确认失败** — `npx jest tests/resolve-target-lang.test.js` FAIL。

**Step 3: 实现** — `shared/config.js` 加 `resolveTargetLang(stored, browserLang)`（require/复用 lang-map；config.js 已被 SW importScripts 且 popup/content 以 script 加载——确认 lang-map.js 也在这些加载点可用，必要时在 manifest content_scripts 各组、popup.html、SW importScripts、options.html 的脚本列表里把 `shared/lang-map.js` 加到 `shared/config.js` 之前）。`resolveTargetLang` 缺 `browserLang` 时内部用 `chrome.i18n.getUILanguage()`。

**Step 4: 改读取点** — 每处 `const { ... targetLang = 'zh' } = stored/data` 改为先解构不带默认，再 `const targetLang = resolveTargetLang(stored)`；并**懒固化**：若推导得出且 storage 无键，`chrome.storage.local.set({targetLang})`（仅写一次，避免覆盖用户选择——只在键确实缺失时写）。site 脚本（reddit/youtube/gmail）同模式。

**Step 5: 英文浏览器 no-op 守卫验证** — 检查 `content.js` `isPageAlreadyInTargetLang` 与 options `targetLang==='en'` 分支：当 `targetLang==='en'` 且页面英文，确认不报错/不弹下载/不产生 en→en 注入。若有缺口，最小修补（仅 no-op 守卫，不扩范围）。加一条 jsdom 测试覆盖"targetLang 解析为 en 时 content 入口直接 return"（如现有结构可测；不可测则在报告说明并靠审查）。

**Step 6: 全量 + Commit**
```
git -C /Users/qianwan/Privado add 翻译插件/shared/config.js 翻译插件/shared/lang-map.js 翻译插件/content/content.js 翻译插件/popup/popup.js 翻译插件/background/service-worker.js 翻译插件/options/options.js 翻译插件/content/reddit.js 翻译插件/content/youtube.js 翻译插件/content/gmail.js 翻译插件/tests/resolve-target-lang.test.js 翻译插件/manifest.json
git -C /Users/qianwan/Privado commit -m "fix: targetLang defaults from browser language instead of hardcoded zh"
```
（manifest 仅当为加载 lang-map 而改脚本列表时纳入。）

---

### Task 3: i18n loader 可行性验证 + `btI18n` 纯解析器

**Files:**
- Create: `翻译插件/shared/i18n.js`
- Test: `翻译插件/tests/i18n.test.js`

**Step 1: fetch 可行性验证（spike，先做）** — 真机：加载扩展，在 SW 控制台跑
`fetch(chrome.runtime.getURL('_locales/en/messages.json')).then(r=>r.json()).then(j=>console.log(Object.keys(j).length)).catch(e=>console.error('BLOCKED',e))`
和在 options 页控制台同样跑。**预期可行**（扩展自身特权上下文可 fetch 打包资源；`_locales` 的"保留"只影响 chrome.i18n 与 web 暴露）。结果写入本计划下方"执行记录"或 commit message。
- 若 SW/options 可行 → 主方案（fetch + storage 缓存，内容脚本只读缓存）。
- 若被拦 → 回退：把 `_locales/*/messages.json` 加进 manifest `web_accessible_resources`（仅 UI 串，非敏感），或末选 `shared/locale-data.js` 打包。择一并记录。

**Step 2: 写失败测试（纯解析器）** — `resolveMessage(table, key, subs)`：`table` 形如 chrome.i18n 的 `{key:{message,placeholders}}`。断言：无占位→原样；`$1`/`$2` 顺序替换；命名占位 `$FOO$` 经 `placeholders` 映射到 `$1`；缺 key→返回 `undefined`（让上层走回退）；subs 少于占位→空串填充不抛错。

**Step 3: 跑确认失败** — `npx jest tests/i18n.test.js` FAIL。

**Step 4: 实现** — `shared/i18n.js`：
- 纯：`resolveMessage(table,key,subs)`（严格对齐 chrome.i18n 占位语义）。
- loader：`async ensureLocaleCached(loc)`（特权上下文调用）：fetch `_locales/<loc>/messages.json` → 存 `chrome.storage.local['__btUiStrings_'+loc]`（已是 chrome.i18n 原生格式，原样存即可）。
- `async btI18n(key, subs)`：读当前 `uiLang`（Task 4 提供 `resolveUiLang`）→ 从 storage 取该 locale 表 → `resolveMessage`；为空→取 `__btUiStrings_en`；仍空→`chrome.i18n.getMessage(key, subs)`（终极兜底，永不空白）。
- 同步便捷层：多数调用点是同步的（`el.textContent = i18n(key)`）。方案：启动时各上下文先 `await` 一次 `btI18nInit()` 把当前 locale 表载入内存模块变量，之后 `btI18n` 同步返回；未就绪时同步回退 `chrome.i18n.getMessage`。导出 `{ resolveMessage, ensureLocaleCached, btI18nInit, btI18n }` + 守卫。

**Step 5: 全量 + Commit**
```
git -C /Users/qianwan/Privado add 翻译插件/shared/i18n.js 翻译插件/tests/i18n.test.js
git -C /Users/qianwan/Privado commit -m "feat: runtime i18n resolver + locale cache loader (btI18n)"
```

---

### Task 4: uiLang 默认推导 + popup/options 接入 btI18n

**Files:**
- Modify: `翻译插件/shared/config.js`（加 `resolveUiLang(stored, browserLang)`，仿 `resolveTargetLang`）
- Modify: `翻译插件/popup/popup.js`、`翻译插件/popup/popup.html`、`翻译插件/options/options.js`、`翻译插件/options/options.html`（脚本引入 `shared/lang-map.js`、`shared/i18n.js`，在页面脚本前）
- Test: `翻译插件/tests/resolve-ui-lang.test.js`

**Step 1-3: `resolveUiLang` TDD** — 同 Task 2 模式，缺键→`mapToUiLang(browserLang)`，返回 locale 目录名（`zh_CN`/`pt_BR`…）。测试 + 失败 + 实现。

**Step 4: 接入** — popup.js/options.js 顶部 `await btI18nInit()`（在 `applyI18n()` 前；失败 `.catch(()=>{})` 兜底，保证不阻塞 init——沿用本仓既有加固惯例）。把 `chrome.i18n.getMessage(...)` / 局部 `i18n=` 改为走 `btI18n`（`btI18n` 内部已含 chrome.i18n 终极回退）。html 加脚本引入。

**Step 5: 全量 + Commit**
```
git -C /Users/qianwan/Privado add 翻译插件/shared/config.js 翻译插件/popup/popup.js 翻译插件/popup/popup.html 翻译插件/options/options.js 翻译插件/options/options.html 翻译插件/tests/resolve-ui-lang.test.js
git -C /Users/qianwan/Privado commit -m "feat: uiLang default derivation + popup/options use btI18n"
```

---

### Task 5: 其余上下文接入 btI18n（机械）

**Files:** Modify `翻译插件/content/content.js`、`翻译插件/content/youtube.js`、`翻译插件/content/rewriter.js`、`翻译插件/content/reader.js`、`翻译插件/background/service-worker.js`（右键菜单 `chrome.i18n.getMessage`）；相应 manifest content_scripts 各组 / SW importScripts 加 `shared/i18n.js`、`shared/lang-map.js`（在 config.js 前）。

**Step 1:** 各文件 `i18n` 定义改为委托 `btI18n`；content 类脚本在主流程前 `await btI18nInit().catch(()=>{})`。SW 右键菜单创建前确保 `await btI18nInit()`（onInstalled/启动时）。
**Step 2:** 全量 `npx jest` 绿（含试点门禁）。手工核对无遗漏的 `chrome.i18n.getMessage` 直连（grep）。
**Step 3: Commit** `feat: route remaining contexts (content/youtube/rewriter/reader/SW menus) through btI18n`

---

### Task 6: popup 新增「界面语言」下拉

**Files:** Modify `翻译插件/popup/popup.html`（在现有 `#target-lang` 行旁加 `#ui-lang` `<select>`，12 项，label 走 i18n）、`翻译插件/popup/popup.js`（填充、读当前 `uiLang`、change 时 `chrome.storage.local.set({uiLang})` → 触发 `ensureLocaleCached(mapToUiLang)` → 重载/关 popup，沿用现有 target 改动即 reload 的模式）；可选 `_locales` 加 `popupUiLangLabel` 键。

**Step 1:** 加 select + 接线。**Step 2:** 全量绿。**Step 3: Commit** `feat: popup UI-language selector`

---

### Task 7: 补 5 个 _locales + 阿语 RTL（实打实工作量）

**Files:** Create `翻译插件/_locales/{ja,ko,ru,ar,pt_BR}/messages.json`；Modify popup.html/options.html（`uiLang==='ar'`→根 `dir="rtl"`，由 popup.js/options.js 在 btI18nInit 后设置）。

**Step 1:** 以 `_locales/en/messages.json` 为源，逐键翻译为 ja/ko/ru/ar/pt_BR（用扩展自身翻译后端或一次性脚本批量生成草稿；保留占位符 `$1`/`$FOO$` 与 `placeholders` 结构不变）。**结构合法性**：每个文件 `node -e "JSON.parse(require('fs').readFileSync(...))"` 通过；键集与 en 完全一致（写校验脚本比对键集）。
**Step 2:** RTL：`uiLang==='ar'` 时 popup/options 根元素 `dir='rtl'`；目测样式不破（无法此处真机验，报告标注需用户冒烟）。
**Step 3:** 标注：机翻草稿，关键串（按钮/状态/隐私）建议用户人工校；列为交付跟踪项。
**Step 4: Commit** `feat: add ja/ko/ru/ar/pt_BR locales + Arabic RTL`

---

### Task 8: 全量回归 + 试点门禁完整性 + 最终审查

**Step 1:** `cd /Users/qianwan/Privado/翻译插件 && npx jest` 全绿；`git -C /Users/qianwan/Privado diff --stat 9526206 HEAD -- 翻译插件/content/detector.js 翻译插件/tests/fixtures` **必须空**（试点门禁零改动）。
**Step 2:** grep 确认无残留未走 btI18n 的 `chrome.i18n.getMessage` 用户可见串（SW 菜单/各 hint）。
**Step 3:** 整体最终审查 subagent：端到端连贯性（两旋钮解耦、英文浏览器 no-op、i18n 三级回退永不空白、缺 locale 回落 en）、生产安全、试点门禁完整。
**Step 4:** 更新设计文档加"交付状态 + 跟踪项（机翻校对、RTL 真机冒烟、fetch 机制最终采用哪种）"，commit。**不 push**（用户决定）。

---

## YAGNI 边界（不做）
按站点界面语言；源语言自动识别（源仍硬编码 en）；OCR/改写独立语言；构建步骤（保持无构建、纯文件加载）。
