# 翻译插件 — Chrome Extension

精简版沉浸式翻译。解决原版臃肿、乱翻广告、权限过多的问题。目标用户：普通用户，开箱即用。

## 核心功能（MVP）

1. **双语段落对照** — 原文下方显示译文，精准过滤广告和导航
2. **YouTube 双语字幕** — 原文+译文叠加显示
3. **翻译源管理** — 两条独立路径，见下方
4. **用户控制** — 网站级开关、显示模式切换、单段重翻

## 已砍功能

- PDF / EPUB 翻译
- 划词翻译
- 鼠标悬停翻译
- 规则系统 / Hook 系统
- 上下文记忆（AI 对话历史）
- 跨设备同步
- 会员/订阅体系
- 遥测/统计上报

## 翻译源架构

### 两条独立路径

```
【普通用户（无 Key）】
Chrome Translator API（本地 Gemini Nano，离线免费）
  ↓ 不可用（设备不支持 / 模型未下载）
全局缓存（相同文本直接复用）
  ↓ 未命中
Google / Microsoft 兜底

【API Key 用户】
用户 API Key（DeepL / OpenAI / Gemini 等）
  ↓ 可选：勾选"启用缓存"（默认关闭，防止缓存里有机翻结果）
  ↓ 请求失败（Key 无效 / 余额不足）
弹出提示 → 用户选择：[切换免费模式] [去检查设置]
```

**关键设计原则：**
- API Key 用户走完全独立路径，不混用 Chrome Translator API
- 缓存对 API Key 用户默认关闭，需主动勾选
- API 失败时明确告知用户，不静默降级

### 翻译源抽象层

每个翻译源实现统一接口，通过 dispatch map 分发：

```js
// 每个源实现两个函数
{ buildRequest(texts, fromLang, toLang, apiKey), parseResponse(raw) }

// 统一入口
const translators = { google, microsoft, deepl, openai, gemini }
const result = await translators[sourceType].translate(texts, opts)
```

### 批量翻译（Aggregation）

不逐段发请求，聚合后批量发送，减少 API 调用次数和延迟：

```
触发条件（任一满足即发送）：
- 等待超过 300ms
- 积累段落数 ≥ 8
- 积累字符数 ≥ 8000
```

实现思路：维护一个队列，content script 检测到可翻译元素后入队，
background service worker 按上述条件聚合发送，结果按 id 分发回各元素。

### Chrome Translator API 说明

```js
const canTranslate = await translation.canTranslate({ sourceLanguage, targetLanguage });
const translator = await translation.createTranslator({ sourceLanguage, targetLanguage });
const result = await translator.translate(text);
```

- 支持平台：macOS 13+、Win10/11、Linux（Chrome 128+）
- CPU 支持：Chrome 140+，需 RAM ≥ 16GB + 4核（GPU 需 VRAM > 4GB）
- 首次使用下载模型，需 22GB 磁盘空间，之后完全离线
- 不支持：Android、iOS

## 段落识别与过滤

### 翻译目标元素（白名单）

```
p, h1, h2, h3, h4, h5, h6, blockquote, figcaption, li, td, th
```

不翻译 `div` / `span` 本身，避免误判。

### 三层过滤

```
第一层：祖先黑名单
  父链含 nav / aside / header / footer
  / [role="navigation|banner|complementary|form|search"]
  → 跳过

第二层：字数阈值
  纯文本内容 < 20 字符 → 跳过
  （过滤"登录""更多""© 2025"等短文字）

第三层：广告信号
  自身或祖先 class/id 含以下关键词 → 跳过
  ad- / ads / advert / sponsor / advertisement / promo / banner
```

跨域 iframe 内广告天然隔离，content script 默认不注入。

**备忘：** Readability.js 暂不引入。若特定页面过滤效果不理想，再评估加入。

## 缓存机制

使用浏览器原生 Cache API，Key 由以下字段组合：

```
translatorSource + originalText + fromLang + toLang
```

- 普通用户：全局缓存，命中直接返回
- API Key 用户：默认关闭，勾选后启用（用户知情同意）
- 字幕缓存：按 videoId + 字幕块哈希单独缓存

## 用户控制功能

### 网站级开关
Popup 中可设置当前域名：始终翻译 / 永不翻译，持久化到 storage。

### 显示模式切换
快捷键或 Popup toggle 切换：
- **双语模式**（默认）— 原文 + 译文
- **仅译文** — 隐藏原文
- **仅原文** — 暂停翻译显示

### 单段重翻
hover 目标段落时右上角出现重翻按钮，点击重新请求当前翻译源。

## YouTube 字幕

独立模块，不走页面段落逻辑。

- MutationObserver 监听 `.ytp-caption-segment`
- 防抖 + 缓存避免重复翻译
- 双语叠加：原文上方，译文下方
- 参考：[youtube-live-translate](https://github.com/wangruofeng/youtube-live-translate)（MIT 协议）

## 插件架构

```
manifest.json (Manifest V3)
├── background/
│   └── service-worker.js      # 翻译调度、批量队列、缓存、API 请求
├── content/
│   ├── detector.js            # 段落检测（元素白名单 + 三层过滤）
│   ├── renderer.js            # 双语 DOM 渲染、显示模式切换、重翻按钮
│   └── youtube.js             # YouTube 字幕模块
├── popup/
│   └── popup.html/js          # 开关、网站级设置、显示模式
└── options/
    └── options.html/js        # API Key 配置、目标语言、缓存开关
```

### Manifest V3 权限（最小化）

```json
{
  "permissions": ["storage", "activeTab", "scripting"],
  "host_permissions": ["<all_urls>"]
}
```

## 开发顺序

1. 段落检测 + 双语渲染（核心体验）
2. Chrome Translator API 集成 + 批量队列
3. Google/Microsoft 兜底
4. 显示模式切换 + 单段重翻 + 网站级开关
5. YouTube 字幕模块
6. 用户 API Key 支持 + 缓存机制
7. Popup + Options UI

## 参考资料

- [Chrome Translator API 文档](https://developer.chrome.com/docs/ai/translator-api)
- [Chrome Built-in AI CPU 支持](https://developer.chrome.com/blog/gemini-nano-cpu-support)
- [youtube-live-translate（MIT，字幕参考）](https://github.com/wangruofeng/youtube-live-translate)
- [KISS Translator（GPL-3.0，架构参考，不可直接引用代码）](https://github.com/fishjar/kiss-translator)
- [extension-translate-gemini-nano（概念参考）](https://github.com/sh2/extension-translate-gemini-nano)
