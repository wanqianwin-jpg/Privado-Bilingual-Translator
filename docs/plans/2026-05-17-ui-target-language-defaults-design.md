# 界面语言 + 翻译目标语言：浏览器默认 + 可修正 — 设计文档

> 状态：用户审批通过（"可以 干吧"），方案 C（双独立旋钮，一步到位）。
> 实施纪律：subagent 逐任务 实现→规格审→质量审；**只本地提交，不推送**（推送是用户显式决定）。
> 不碰 `content/detector.js` 与 `tests/fixtures/*.baseline.json`（试点回归门禁保绿）。

## 问题

`targetLang` 默认硬编码 `'zh'`（content/popup/options/SW/各站点脚本皆 `targetLang = 'zh'`），非按浏览器。德/英等用户装上后网页被强翻成中文。界面语言虽已由 `chrome.i18n` 自动跟浏览器，但 `_locales/` 仅 7 种（de/en/es/fr/it/zh_CN/zh_TW），且 chrome.i18n 锁死浏览器 UI 语言、用户无法修正（如英文系统的中文用户界面只能英文）。

## 决策：方案 C — 双独立旋钮

两件本质不同的事各给一个显式旋钮（用户判断：独立旋钮**降低**认知负担，心智模型更清晰；实现成本是开发者的问题，不作为合并理由）：

| 旋钮 | storage 键 | 作用 | 默认 | 修正入口 |
|---|---|---|---|---|
| 界面语言 | `uiLang` | 扩展自身 UI（popup/options/toast/右键菜单/各 hint） | 按浏览器推导，缺失即推导 | popup 新增下拉 |
| 翻译目标 | `targetLang` | 网页被翻成什么 | 按浏览器推导（替换硬编码 zh） | popup 现有下拉 |

两者**严格解耦**，改一个不动另一个。修正入口都在 popup（与现有目标语言下拉并排）。

## ① 首次默认推导（纯函数，可单测）

`chrome.i18n.getUILanguage()`（如 `zh-CN`/`en-US`/`de`）经两个映射：
- → `targetLang`：12 个翻译目标 `zh/zh-TW/en/ja/ko/fr/de/es/ru/ar/it/pt-BR`；规则：`zh-CN/zh-Hans→zh`、`zh-TW/zh-Hant→zh-TW`、`pt*→pt-BR`、主子标签精确命中、`en*→en`、不支持→`en`。
- → `uiLang`：实际发布的 locale（见 ④）；不支持→`en`。
- 懒推导：任何上下文读到键缺失 → 推导并写回 storage。存量用户由此获得正确默认（即本 bug 修复）；用户手动选过即固化。

## ② 界面语言运行时 i18n（硬骨头 / 技术风险点）

chrome.i18n 锁浏览器语言，需自建共享 `btI18n(key, subs)`：
- **加载机制（关键决策）**：特权上下文（SW / options 页）`fetch(chrome.runtime.getURL('_locales/<loc>/messages.json'))` → 套用 `placeholders` + `$1..$n` 替换（严格对齐 chrome.i18n 语义）→ 解析后的串表缓存进 `chrome.storage.local`（按 locale 键）。所有上下文（含内容脚本——它 fetch 不到 `_locales`）从该缓存读。
- **三级回退**：选定 `uiLang` locale → `en` → `chrome.i18n.getMessage`（终极兜底）。保证任何 key/任何失败都**不空白、不半截**，最差退化为当前浏览器语言行为。
- **改 `uiLang`**：重建缓存 → 各上下文重渲染（popup/options 重开生效，沿用现有"改 target 即 reload tab/关 popup"模式）。
- **改动点（机械，靠共享模块集中）**：`popup/popup.js`、`options/options.js`、`content/content.js`、`content/youtube.js`、`content/rewriter.js`、`content/reader.js`、`background/service-worker.js`（右键菜单）的 i18n 调用改为走 `btI18n`，保留 `chrome.i18n.getMessage` 作为终极兜底。
- **风险与回退**：若 `fetch _locales` 在某上下文被拦——回退方案＝构建期/源码内把消息表打成 `shared/locale-data.js`（JS 对象，免 fetch/web_accessible）。**writing-plans 第一步即验证 fetch 可行性**，不可行则切回退方案。

## ③ 边界与兜底

- 英文浏览器 → `targetLang='en'`：源语言硬编码 `'en'`，en→en 是**正确的"无需翻译" no-op**。要求：验证 `content.js` 现有 `isPageAlreadyInTargetLang` / options `targetLang==='en'` 守卫，确保不报错、不产生 en→en 垃圾、不弹模型下载。`uiLang` 仍可为 en，互不影响。
- 两旋钮解耦：改 `uiLang` 绝不动 `targetLang`，反之亦然。
- i18n 失败/缺键 → 见 ② 三级回退。

## ④ Locale 覆盖（实打实工作量）

补 5 个 `_locales`：`ja` / `ko` / `ru` / `ar` / `pt_BR`（Chrome 目录命名 `pt_BR`），每个约 100 条键（含已交付的模型下载相关键）。两个子项：
- 翻译质量：建议用扩展自身翻译后端或一次性脚本批量生成，再人工校关键串（按钮/状态/隐私声明）。
- **阿拉伯语 RTL**：`uiLang==='ar'` 时 popup/options 根元素加 `dir="rtl"`（CSS 镜像按需）。

## ⑤ 测试与范围

- 纯单测：浏览器→`uiLang` 映射、浏览器→`targetLang` 映射、`btI18n` 解析 + 占位符替换 + 三级回退链。jsdom + mock `chrome.i18n`/`chrome.storage`。
- 全量 `npx jest` 保持绿；`detector.js`/baseline 零改动（试点门禁完整）。
- subagent 逐任务 实现→规格审→质量审；只本地提交不推送。
- YAGNI 不做：按站点界面语言、源语言自动识别（源仍硬编码 en）、OCR/改写独立语言。

## 交底（两个"重"点）

1. **② i18n 加载机制有技术不确定性** → writing-plans 第一任务即验证 `fetch _locales` 是否在 SW/options/content 各上下文可行；不行则走 `shared/locale-data.js` 回退。
2. **④ 翻译 5 套 locale + 阿语 RTL 是真工作量**，非纯代码。
