# 翻译插件 — Chrome Extension

## Safari 开发工作流（macOS 26 beta）

每次改动后必须走完这个流程，否则签名失效、工具栏图标消失：

```
1. 改代码（JS 或 Swift）
2. Xcode → Cmd+R（Run，不是 Build）
3. 等构建完成后，Terminal: bash ~/fix-safari-extension.sh
4. 完全退出 Safari（Cmd+Q）→ 重新打开 Safari
5. Safari 设置 → 扩展 → 确认 Privado 已勾选（每次 rebuild 后都要检查）
6. 右键工具栏 → 自定义工具栏 → 把 Privado 拖进去（仅首次或丢失时）
```

注：xcscheme 里的 Build PostAction 理论上会自动运行 fix script，但实测不可靠（/tmp/fix-safari.log 有时不生成），所以保留手动步骤。

**根本原因**：macOS 26 beta 的 codesign 无法验证包含 em-dash（—）的 dylib identifier，
Xcode 生成的 .debug.dylib 带有 em-dash，fix script 负责重新签名。
每次改动 JS 文件后也需要重新签名（因为改动破坏了已签名的 bundle）。

## Safari 调试踩坑记录

### Native Messaging 只能在 MV2 background page 里用
- Safari MV3 service worker **不支持** `browser.runtime.sendNativeMessage`（`browser.runtime` 上根本没有这个方法）
- 解决：`manifest.safari.json` 用 MV2 + `background.html`（persistent: true）
- MV2 背景页里 native messaging 完全正常

### `importScripts` 在 background.html 里不存在
- `service-worker.js` 第一行 `importScripts(...)` 在 service worker 上下文里可用，在 background page（普通 HTML script）里会报 `ReferenceError`
- 解决：`if (typeof importScripts === 'function') { importScripts(...) }`
- `background.html` 已经用 `<script>` 标签逐个加载了这些文件，跳过 importScripts 即可

### Safari MV2 background.html 里 chrome 的行为
- `browser` 全局存在且是 Promise-based（`browser.runtime.sendNativeMessage` 返回 Promise）
- `chrome-shim.js` 会把 `chrome` 设为 `browser`，所以两者等价
- `sendNativeMsg` wrapper 优先用 `self.browser.runtime.sendNativeMessage`，fallback 用 callback 式 `chrome.runtime.sendNativeMessage`

### debug 方法
- 在 background 脚本里把信息写入 `chrome.storage.local`
- 在 popup.js 里读取并 `console.log`，然后右键 popup → 检查元素 → Console 查看
- 工具栏图标消失时：Safari 设置 → 扩展 → 重新勾选 → 自定义工具栏拖回来

精简版沉浸式翻译。解决原版臃肿、乱翻广告、权限过多的问题。目标用户：普通用户，开箱即用。

## 核心功能（MVP）

1. **双语段落对照** — 原文下方显示译文，精准过滤广告和导航
2. **YouTube 双语字幕** — 原文+译文叠加显示
3. **翻译源管理** — 两条独立路径，见下方
4. **用户控制** — 网站级开关、显示模式切换、目标语言选择、悬浮球

## 已砍功能

- PDF / EPUB 翻译
- 划词翻译
- 鼠标悬停翻译
- 规则系统 / Hook 系统
- 上下文记忆（AI 对话历史）
- 跨设备同步
- 会员/订阅体系
- 遥测/统计上报
- 单段重翻按钮

## 翻译源架构

### 两条独立路径

```
【普通用户（无 Key）】
Chrome Translator API（本地 Gemini Nano，离线免费）→ 页面加载后自动开始翻译
  ↓ 不可用（设备不支持 / 模型未下载）
Service Worker → Google translate.googleapis.com 兜底（client=gtx，非官方，无 SLA）

【API Key 用户】
用户 API Key（DeepL / OpenAI / Gemini / 自定义 OpenAI-compatible）→ 点击悬浮球触发
  ↓ 请求失败（Key 无效 / 余额不足）
弹出 toast → 用户选择：[切换免费模式] [去检查设置]
```

**关键设计原则：**
- API Key 用户走完全独立路径，不混用 Chrome Translator API
- API 失败时明确告知用户，不静默降级
- 免费用户页面加载后自动翻译；API 用户点悬浮球手动触发
- API 模式：优先翻译视口内元素（`sortByViewport`），最小文本长度 60 字符，批处理更大（25条/15000字符/800ms）
- 免费模式：批处理 8条/8000字符/300ms

### Chrome Translator API

```js
const canTranslate = await translation.canTranslate({ sourceLanguage, targetLanguage });
const translator = await translation.createTranslator({ sourceLanguage, targetLanguage });
const result = await translator.translate(text);
```

- 支持平台：macOS 13+、Win10/11、Linux（Chrome 138+），**Safari 不支持**
- Chrome 138 正式 GA，默认开启，无需用户配置任何 flags
- 轻量 NMT 模型，按语言对按需下载（数百 MB 量级），之后完全离线
- 模型下载中时弹出 toast 提示用户等待

### Service Worker 批处理

- 所有翻译请求通过 `chrome.runtime.sendMessage({ type: 'TRANSLATE' })` 发给 SW
- SW 用 `createBatchQueue` 按语言对分桶合并批次
- SW 维护 in-memory config cache，用 `chrome.storage.onChanged` 同步更新，避免每次批处理都读 storage
- 缓存策略：免费用户全量缓存，API Key 用户可选（`enableCache`）

## 段落检测（detector.js）

### 核心思路：TextNode Walker

不用元素白名单，改用文本节点游走：

1. 递归遍历 DOM（含 shadow root）
2. 遇到 TextNode → 向上找最近的块级容器（`findBlockContainer`）
3. 该容器通过过滤条件 → 加入翻译队列

好处：不依赖特定标签，适配任意网站结构和 Web Components。

### 过滤条件

- 文本 < 20 字符 → 跳过（API 模式：< 60 字符）
- 文本 > 1500 字符 → 跳过（JSON payload / 嵌入数据）
- CJK 字符占比 > 25% → 跳过（已是目标语言）
- URL / email / @handle / 日期格式 / JSON开头 → 跳过
- 祖先含 nav / header / footer / `role=navigation` 等 → 跳过
- 祖先 class/id 含广告关键词 → 跳过
- 容器有块级子元素（布局容器）→ 跳过，只翻叶节点
- `[data-bt-sibling-for]` 节点 → 跳过（我们自己注入的译文 div，防止循环）

## DOM 渲染（renderer.js）

### 注入策略：Sibling 注入

```html
<!-- 注入后 -->
<p data-bt-translated="true">原文内容</p>
<div data-bt-sibling-for="true" style="...">译文内容</div>
```

### 显示模式

三种模式通过 `body` class 切换：

| 模式 | body class | CSS 效果 |
|------|-----------|---------|
| 双语 | `bt-mode-bilingual` | 原文 + 译文都显示 |
| 仅译文 | `bt-mode-translation-only` | 隐藏原文，译文顶上去 |
| 仅原文 | `bt-mode-original-only` | 隐藏译文 div |

- pending 状态：`[data-bt-translated="pending"]::after` 蓝色跳动圆点动画

## 网站专项脚本机制

content.js 加载后检查全局标志（`BT_IS_YOUTUBE` / `BT_IS_REDDIT`），专项脚本先于 content.js 注入并设置标志。

## Reddit 专项适配（reddit.js）

Reddit 使用 `shreddit-post` Web Component，标题通过 shadow DOM slot 投影。标题走 child 注入（`titleEl.appendChild`），继承正确颜色；通用元素走 sibling 注入。

## YouTube 专项适配（youtube.js）

- `youtube-main.js`（MAIN world）拦截 timedtext XHR，URL 传给 ISOLATED world 的 youtube.js
- 预翻译当前时间点后 90s 的字幕，`timeupdate` 事件驱动实时渲染
- 页面内容（评论、描述）走 `scanYtPage`

## 悬浮球（floatball.js）

- 可拖拽，位置持久化到 localStorage
- 三个状态：`idle`（译）→ `translating`（···）→ `done`（循环切换双/译/原）
- 免费模式下球仅显示状态；API 模式下点击球触发翻译

## 插件架构

```
manifest.json (Manifest V3)
├── background/
│   ├── service-worker.js           # 翻译调度、批处理、缓存、API 请求
│   ├── batch-queue.js              # 批量队列实现
│   ├── cache.js                    # 翻译缓存
│   └── translators/
│       ├── google-translator.js    # Google 免费兜底（translate.googleapis.com）
│       ├── user-api-translator.js  # DeepL / OpenAI / Gemini / 自定义
│       └── index.js                # translateTexts 统一入口
├── content/
│   ├── detector.js         # TextNode walker + 过滤逻辑
│   ├── renderer.js         # DOM 注入、样式、显示模式
│   ├── chrome-translator.js# 页面侧 Chrome Translator API 调用
│   ├── floatball.js        # 悬浮球 UI
│   ├── content.js          # 主入口：协调检测/翻译/MO/IO
│   ├── reddit.js           # Reddit 专项（仅 reddit.com 加载）
│   ├── youtube.js          # YouTube 页面翻译 + 字幕（ISOLATED world）
│   └── youtube-main.js     # YouTube XHR 拦截（MAIN world）
├── popup/
│   └── popup.html/js       # 模式滑块、网站开关、目标语言、显示模式
└── options/
    └── options.html/js     # API Key、模型、baseURL 配置
```

## 审核相关注意事项

### Chrome Web Store
- `<all_urls>` 广域权限需在提交时明确说明用途（页面翻译）
- `client=gtx` 非官方 Google API，技术上违反 ToS，审核方通常默许但有封端点风险
- 需提供 Privacy Policy

### Safari / App Store 版本注意
- Chrome Translator API **不存在于 Safari**，该路径仅 Chrome 使用
- Safari 版本通过 `SafariWebExtensionHandler`（Native Messaging）调用 macOS 原生框架
- `<all_urls>` 需用户手动授权"允许所有网站"
- manifest MV3 Safari 16+ 兼容，`chrome.*` namespace Safari 也支持

## macOS 原生模式（apple-npu）

Safari 版本的主要翻译路径，替代原 SnapBridge 方案。通过 Safari Native Messaging 直接调用 macOS 系统框架，**无需 localhost HTTP server**。

### 架构

```
content script
  → chrome.runtime.sendMessage({ type: 'NATIVE_TRANSLATE', texts, fromLang, toLang })
  → Service Worker（service-worker.js）
  → browser.runtime.sendNativeMessage(NATIVE_APP_ID, ...)
  → SafariWebExtensionHandler（Swift，Xcode 主 App target）
  → macOS 系统框架（按需调用）
  → 返回结果
```

### 涉及的 macOS 系统框架

| 功能 | 框架 | API |
|------|------|-----|
| 翻译 | Translation.framework | `TranslationSession` |
| 语言识别 | NaturalLanguage.framework | `NLLanguageRecognizer` |
| OCR | Vision.framework | `VNRecognizeTextRequest` |

### Native Messaging 消息格式

**翻译请求：**
```json
{ "type": "TRANSLATE", "texts": ["..."], "fromLang": "auto", "toLang": "zh" }
```
**翻译响应：**
```json
{ "translations": ["..."] }
```

**语言识别请求：**
```json
{ "type": "DETECT_LANGUAGE", "text": "..." }
```
**语言识别响应：**
```json
{ "language": "en", "confidence": 0.98 }
```

**OCR 请求（base64 图片）：**
```json
{ "type": "OCR", "imageBase64": "...", "languages": ["en"] }
```
**OCR 响应：**
```json
{ "text": "..." }
```

**状态检查：**
```json
{ "type": "TRANSLATE_STATUS", "fromLang": "auto", "toLang": "zh" }
```
**响应：**
```json
{ "status": "available" }   // 或 "unavailable" / "downloading"
```

### 实现要点
- `SafariWebExtensionHandler` 在主 App target 实现（非 Extension target）
- Translation.framework 需要 macOS 15+；NaturalLanguage / Vision 无版本要求
- `TranslationSession` 初始化可能触发模型下载，需在 status check 时处理 `downloading` 状态
- OCR 仅在用户截图/选区时触发，不在页面翻译路径上

## 开发进度

- [x] TextNode walker 段落检测 + 双语渲染
- [x] Chrome Translator API 集成（含 pending 动画、下载提示）
- [x] Service Worker 兜底翻译 + 批处理 + 缓存
- [x] 显示模式切换（双语/仅译文/仅原文）
- [x] 网站级永不翻译开关
- [x] 目标语言选择
- [x] 悬浮球（拖拽、状态机、模式切换）
- [x] Reddit 专项适配（标题 child 注入 + 通用元素翻译）
- [x] 用户 API Key（DeepL/OpenAI/Gemini/自定义，含 baseURL/model）
- [x] Popup + Options UI
- [x] YouTube 双语字幕（XHR 拦截 + timeupdate 同步）
- [x] YouTube 页面翻译（评论、描述）
- [x] Service Worker in-memory config cache（性能优化）
- [x] Safari 版本基础运行（MV2 background.html + content script + 悬浮球 + Google 机翻兜底）
- [x] macOS 原生翻译（Translation.framework via SafariWebExtensionHandler）
- [ ] macOS 语言识别（NaturalLanguage.framework via SafariWebExtensionHandler）
- [ ] macOS OCR（Vision.framework via SafariWebExtensionHandler）
- [ ] Options UI 增加 apple-npu 模式选项

## 已知问题与根本原因

### 1. Gmail 翻译不显示（已修复）

**问题 A — AD_KEYWORDS 误匹配：** `detector.js` 的 `AD_KEYWORDS` 数组含 `'ads'`，CSS 选择器 `[class*="ads" i]` 是子串匹配。Gmail 所有邮件线程容器 class 为 `"adn ads"`，命中后 `hasAdSignal()` 对邮件内所有元素返回 `true`，`getTranslatableElements()` 返回空数组。**修复：** 删除 `'ads'`，保留 `'ad-'`（需要连字符后缀）。

**问题 B — gmail.js 设计错误：** 最初实现 gmail.js 时错误地"跳过收件箱列表"，只翻译已打开邮件的正文（`.a3s.aiL`），导致用户最需要翻译的 inbox 页面完全没有翻译。

**修复：** `gmail.js` 增加 inbox 扫描逻辑：
- 目标元素：`tr.zA, tr.yO`（Gmail 收件箱行），只扫描 `.y6` 单元格（主题+摘要），不碰发件人、日期、复选框列
- `injectTranslation` 对 `<td>` 已有特殊处理（往内部 append），不会破坏列布局
- `MutationObserver` 监听新行（分页加载/收取新邮件）
- 导航到邮件详情时停止 inbox observer，返回列表时重启

---

### 2. YouTube 视频简介展开后大段内容不翻译

**根本原因（双重）：**

1. **`data-bt-translated` 未清除：** 简介折叠时，`yt-attributed-string` 元素已被翻译并打上 `data-bt-translated="true"`。用户点击"展开"后，元素文本内容变长（实测：折叠态 192 字符 → 展开态 2623 字符），但 `expand` 点击处理器检查 `if (!el.dataset.btTranslated)` 发现已标记，直接跳过，不重新翻译。

2. **`MAX_TEXT_LENGTH = 1500` 上限：** `getTranslatableElements()` 跳过超过 1500 字符的文本。展开后的长简介（2623 字符）超过阈值，即使清除标记后重走通用扫描也会被跳过。`scanYtDescription` 绕过了此限制，但必须主动调用。

**为什么难以彻底修好：** YouTube 用 `yt-attributed-string` 在折叠/展开时原地修改 `textContent`，没有 DOM 结构变化可供 MutationObserver 的 `childList` 观察——只能用 `characterData` subtree 观察，性能代价高，且展开动画期间会触发多次。最稳定的方案是在展开按钮 click handler 里主动清除 `data-bt-translated` 并调用 `scanYtDescription`，但需要精确选中展开按钮且不误触其他按钮。

---

### 3. YouTube 官方字幕与双语字幕同时显示

**根本原因：** `hideNativeCC()` 只在 `attachTimeUpdate` 首次调用时执行一次，通过 `dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))` 模拟按键关闭字幕。用户手动点击 YouTube CC 按钮重新开启字幕后，插件没有监听器重新隐藏。

**为什么难以彻底修好：** YouTube 播放器状态（字幕开关）通过内部事件系统管理，无公开 API 可监听。可行方案是对字幕容器（`.ytp-caption-window-container`）或 CC 按钮（`.ytp-subtitles-button`）挂 MutationObserver，检测 `aria-pressed` 属性变化后再次模拟 `c` 键。但模拟键盘事件存在 YouTube 版本依赖风险，YouTube 更新播放器后可能失效。此外，用户主动开启字幕属于明确意图，强制关闭体验不佳，更优方案是检测到官方字幕激活时隐藏我们自己的字幕覆盖层，而非继续压制官方字幕。

---

## 参考资料

- [Chrome Translator API 文档](https://developer.chrome.com/docs/ai/translator-api)
- [youtube-live-translate（MIT，字幕参考）](https://github.com/wangruofeng/youtube-live-translate)
- [KISS Translator（GPL-3.0，架构参考，不可直接引用代码）](https://github.com/fishjar/kiss-translator)
- [Translation.framework WWDC24](https://developer.apple.com/videos/play/wwdc2024/10117/)
- [NLLanguageRecognizer 文档](https://developer.apple.com/documentation/naturallanguage/nllanguagerecognizer)
- [VNRecognizeTextRequest 文档](https://developer.apple.com/documentation/vision/vnrecognizetextrequest)
