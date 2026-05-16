# 首次使用本地模型下载 + 进度 — 设计文档

> 状态：用户明确异步委托（"你看着修吧…按你的想法把它展现出来"），用户睡眠中。
> brainstorming 因显式异步委托而压缩：决策由我（controller）依工程判断作出并记录于此，开放问题在文末列出供用户醒后审。
> 实施纪律：subagent 实现 → 规格审 → 质量审，逐任务；**只本地提交不推送**（推送是用户的发布决定）。

## 问题（用户确认）

首次使用谷歌本地翻译（Chrome Translator API / Gemini Nano）的用户，如果模型未预装或不满足条件，**插件目前没有足够的功能让他把该下的东西下下来**，也看不到进度。

## 现状（已读码核实）

- 流程骨架已存在但**空心**：`content.js startTranslation()` 在 `chrome-local` 且状态 `after-download` 时弹确认 toast → 调 `chromeTranslatorDownload('auto',target,onProgress)` → 本应更新进度 toast。
- 但 `content/chrome-translator.js chromeTranslatorDownload` 的 `onProgress` **从不被调用**（注释自承 "SW can't stream progress back easily"）；`background/service-worker.js` 的 `CHROME_TRANSLATE` 处理**没挂 monitor** → 进度事件根本没采集，页面进度 toast 永不更新。
- `popup/popup.js:237` 用 `e.total`（当前 Chrome API 无此字段；`e.loaded` 本身是 0~1 小数）→ **百分比永远不显示**。官方文档校准：`downloadprogress` 事件 `e.loaded ∈ [0,1]`，无 `e.total`；触发下载**需要用户手势**；`Translator` 仅在扩展上下文（SW/popup/options）可用，内容脚本无。
- 架构卡点：SW 触发的下载无用户手势（不可靠）；内容脚本够不到 `Translator`。**唯一既有手势又有 API 的可靠上下文 = 扩展页（popup / options）。**
- `manifest.json` 有 `options_ui`（`open_in_tab:true`）；options 页结构简单（`data-i18n` + `showStatus`）。权限：storage/activeTab/scripting/contextMenus + `<all_urls>`。

## 决策（scoped，键石优先，安全第一）

不碰 `content/detector.js`（保试点回归门禁绿）。不引入 LanguageDetector 多模型编排（当前 auto 源硬编码为 en，超范围）。不用不可靠的 `chrome.action.openPopup()`。

| 任务 | 内容 | 为什么安全/有价值 |
|---|---|---|
| **A 修 bug** | `popup.js` 进度 `e.total`→`e.loaded*100`，校验 popup 下载流显示 % | 一行级、隔离；正是"看不到进度"的直接病灶 |
| **B 进度真流回** | 新增 SW `CHROME_TRANSLATE_DOWNLOAD`（Port 长连接）：`Translator.create({monitor})` 把 `downloadprogress`（`e.loaded` 0~1 → pct）与最终 ok/error 流回发起 tab；`chrome-translator.js chromeTranslatorDownload` 走 Port 调 `onProgress(pct)`。`CHROME_TRANSLATE`（翻译）不动 | 让**已存在**的 content.js 进度 toast 真的动起来；隔离新增消息类型，旧路径不变 |
| **C Options 下载器（键石）** | options.html 加"离线翻译模型"区；options.js：检测可用性 → "下载模型"按钮 →（options 页有手势+API，**保证可用**）`Translator.create({monitor})` → `<progress>`+% → 就绪/重试/失败/不支持（含原因，且说明在线兜底仍可用）。i18n 加 en+zh_CN | Options 是唯一 100% 可靠下载上下文；这就是用户说"缺的功能"，放在保证能用的地方 |
| **D 悬浮球可发现性** | content.js 检测到本地模型需下载时，悬浮球进入醒目"⬇"状态；点击 → 消息 SW → `chrome.runtime.openOptionsPage()` 打开下载器。保留原拖拽/翻译/切换行为不破坏 | `openOptionsPage` 可靠、免额外权限、非 risky openPopup；让只看页面的用户也能发现可用下载器 |

数据流（B）：content `chromeTranslatorDownload` → `chrome.runtime.connect({name:'bt-chrome-dl'})` → SW `onConnect` → `Translator.create({monitor:m=>m.addEventListener('downloadprogress',e=>port.postMessage({pct:Math.round(e.loaded*100)}))})` → 完成 `port.postMessage({done:true})` / 失败 `{error}`。

`unavailable` 处理：A/C/D 一致——明确告知（设备/磁盘/OS 不支持离线），并指明在线 Google 兜底仍工作（`enableFreeFallback`），按钮不假装能下。

## 验证策略（用户睡眠 + 无法在此真机重载扩展）

- 纯逻辑（进度数学 0~1→%、状态映射、Port 消息协议）→ 加 jsdom 单测，mock `Translator`/`chrome`。
- 全量 `npx jest` 必须保持绿（含试点 9 套件 / 49 测试、回归门禁）。
- Chrome 扩展运行时（真实模型下载、SW Port、openOptionsPage）**无法在此无人值守真机验证** → 诚实标注"需用户真机冒烟测试"，不谎称已浏览器验证。
- 每任务 subagent 实现 + 规格审 + 质量审。

## 交付状态（2026-05-17，全部完成）

| 任务 | commit | 状态 |
|---|---|---|
| 设计文档 | `b2a8174` | — |
| A popup 进度 bug | `c010b62` | ✅ 规格+质量审 APPROVED |
| B SW Port 流回进度 | `cceb7b6` | ✅ 规格+质量审 APPROVED（含单测 6） |
| C Options 下载器（键石） | `2b3c3b5` + 加固 `bacf202` | ✅ 规格+质量审 APPROVED（含单测 10） |
| D 悬浮球跳转 Options | `a3e9c2b` | ✅ 规格+质量审 APPROVED（含单测 4） |

全套测试 **12 套件 / 69 测试全绿**，含试点回归门禁（`fixtures-regression`/`detector*`）——`detector.js` 与 baseline **零改动**，试点门禁完整。整体最终审查：**SHIP-SAFE，无 Critical/Important**。仅本地提交、**未推送**（推送是用户决定，开放问题 3）。

**唯一残留运行时风险**：Path-1（toast 确认 → SW 触发下载）若 Chrome 要求用户手势可能被拒——但**会干净报错不卡死**，且 Path-2（琥珀球 → Options 直下，真实手势+API）架构保证可用。最坏：toast 下载失败 → 点球去 Options 完成。**建议推送前真机冒烟一次**验证 Path-1；失败也不阻塞（Options 即保底，未来可让 toast 也直接走 Options）。

## 跟踪项 / 开放问题（用户醒后定）

1. 是否在 popup 也加 `<progress>` 条（现仅文字 %）——YAGNI 暂缓。
2. i18n 其余语言（de/fr/es/it/zh_TW）——现 en+zh_CN，其余自动回落 en（manifest `default_locale`），非崩溃；待补。
3. **是否推送 main**——本功能 6 个 commit 已在本地 main，未推送，等你审 + 拍板。
4. 悬浮球"⬇"状态 UX（审查 M2）：用户显式取消确认 toast 后，`content.js:55` 仍 `setState('idle')`，琥珀入口丢失；是否改为保留 `needs-model`、并去重「toast+球」双入口（未来可直接砍掉 after-download 自动 toast，全走更可靠的球→Options）。
5. （审查 M1）两条下载路径可并发；Chrome API 服务端去重同一模型下载，实践无害，仅可能并存两个进度 UI。
6. （审查 M3）SW 触发下载的用户手势风险，见上"残留运行时风险"，真机冒烟验证。
