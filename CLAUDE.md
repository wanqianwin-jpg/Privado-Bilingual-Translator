# 翻译插件 — Chrome Extension

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

- 支持平台：macOS 13+、Win10/11、Linux（Chrome 128+），**Safari 不支持**
- 轻量 NMT 模型，按语言对按需下载（数百 MB 量级），之后完全离线
- 仍处于 experimental 阶段，非稳定 GA
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

### App Store（SnapBridge macOS 联动）
- `com.apple.security.network.server` entitlement 合法，无需特殊申请
- App 必须有实质性 UI，不能是纯后台 HTTP server

### Safari 版本注意
- Chrome Translator API **不存在于 Safari**，需完全移除该路径
- Safari 版本 localhost NPU（SnapBridge）成为主翻译路径
- `<all_urls>` 需用户手动授权"允许所有网站"
- manifest MV3 Safari 16+ 兼容，`chrome.*` namespace Safari 也支持

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
- [ ] Safari 版本（需移除 Chrome Translator API 路径）
- [ ] SnapBridge：localhost HTTP 联通 macOS NPU（TranslationSession）

## 参考资料

- [Chrome Translator API 文档](https://developer.chrome.com/docs/ai/translator-api)
- [youtube-live-translate（MIT，字幕参考）](https://github.com/wangruofeng/youtube-live-translate)
- [KISS Translator（GPL-3.0，架构参考，不可直接引用代码）](https://github.com/fishjar/kiss-translator)
