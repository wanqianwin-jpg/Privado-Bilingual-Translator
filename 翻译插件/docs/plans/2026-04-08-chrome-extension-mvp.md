# Chrome 翻译插件 MVP 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建一个精简的双语对照翻译 Chrome 插件，核心体验是网页段落翻译 + YouTube 字幕，解决现有工具乱翻广告的问题。

**Architecture:** MV3 插件，content script 负责检测段落和渲染双语，background service worker 负责翻译调度和批量队列，两者通过 chrome.runtime.sendMessage 通信。翻译源分两条路径：普通用户走 Chrome Translator API → 缓存 → Google 兜底；API Key 用户走自己的 Key。

**Tech Stack:** 原生 JS（无构建工具，MVP 阶段），Chrome Extension MV3，Chrome Translator API，Cache API，Jest（纯逻辑单测）

---

## Task 1: 项目脚手架

**Files:**
- Create: `manifest.json`
- Create: `background/service-worker.js`
- Create: `content/detector.js`
- Create: `content/renderer.js`
- Create: `content/youtube.js`
- Create: `content/content.js`
- Create: `popup/popup.html`
- Create: `popup/popup.js`
- Create: `options/options.html`
- Create: `options/options.js`
- Create: `package.json`（仅用于运行 Jest）

**Step 1: 创建 manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Bilingual Translate",
  "version": "0.1.0",
  "description": "Clean bilingual translation. No ads translation, no bloat.",
  "permissions": ["storage", "activeTab", "scripting"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background/service-worker.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_title": "Bilingual Translate"
  },
  "options_ui": {
    "page": "options/options.html",
    "open_in_tab": true
  }
}
```

**Step 2: 创建目录结构和空文件**

```bash
mkdir -p background content popup options tests docs/plans
touch background/service-worker.js
touch content/detector.js content/renderer.js content/youtube.js content/content.js
touch popup/popup.html popup/popup.js
touch options/options.html options/options.js
```

**Step 3: 创建 package.json（仅用于测试）**

```json
{
  "name": "bilingual-translate",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "jest"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "jest-environment-jsdom": "^29.0.0"
  },
  "jest": {
    "testEnvironment": "jsdom"
  }
}
```

**Step 4: 安装测试依赖**

```bash
npm install
```

**Step 5: 在 Chrome 中加载插件验证脚手架**

打开 `chrome://extensions` → 开启开发者模式 → 加载已解压的扩展程序 → 选择项目目录。
预期：插件出现在列表中，无报错。

**Step 6: Commit**

```bash
git init && git add . && git commit -m "feat: project scaffold"
```

---

## Task 2: 段落检测器（核心）

**Files:**
- Create: `content/detector.js`
- Create: `tests/detector.test.js`

**Step 1: 写失败的测试**

```js
// tests/detector.test.js
const { shouldTranslate, getTranslatableElements } = require('../content/detector.js')

describe('shouldTranslate', () => {
  test('p 标签返回 true', () => {
    document.body.textContent = ''
    const p = document.createElement('p')
    p.textContent = 'Hello world, this is a test paragraph.'
    document.body.appendChild(p)
    expect(shouldTranslate(p)).toBe(true)
  })

  test('文字少于 20 字符跳过', () => {
    const p = document.createElement('p')
    p.textContent = '登录'
    expect(shouldTranslate(p)).toBe(false)
  })

  test('nav 内的 p 跳过', () => {
    document.body.textContent = ''
    const nav = document.createElement('nav')
    const p = document.createElement('p')
    p.textContent = 'This is navigation text here'
    nav.appendChild(p)
    document.body.appendChild(nav)
    expect(shouldTranslate(p)).toBe(false)
  })

  test('广告容器内跳过', () => {
    document.body.textContent = ''
    const div = document.createElement('div')
    div.className = 'ad-banner'
    const p = document.createElement('p')
    p.textContent = 'Buy now, great deals available'
    div.appendChild(p)
    document.body.appendChild(div)
    expect(shouldTranslate(p)).toBe(false)
  })

  test('aside 内的 li 跳过', () => {
    document.body.textContent = ''
    const aside = document.createElement('aside')
    const li = document.createElement('li')
    li.textContent = 'Related articles sidebar'
    aside.appendChild(li)
    document.body.appendChild(aside)
    expect(shouldTranslate(li)).toBe(false)
  })

  test('h2 标题返回 true', () => {
    const h2 = document.createElement('h2')
    h2.textContent = 'This is a section heading'
    expect(shouldTranslate(h2)).toBe(true)
  })

  test('button 标签返回 false（不在白名单）', () => {
    const btn = document.createElement('button')
    btn.textContent = 'Click me to submit the form'
    expect(shouldTranslate(btn)).toBe(false)
  })
})
```

**Step 2: 运行确认测试失败**

```bash
npm test -- tests/detector.test.js
```
预期：FAIL，`shouldTranslate is not a function`

**Step 3: 实现 detector.js**

```js
// content/detector.js

const TARGET_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'FIGCAPTION', 'LI', 'TD', 'TH'
])

const ANCESTOR_BLACKLIST = new Set(['NAV', 'ASIDE', 'HEADER', 'FOOTER'])

const ANCESTOR_ROLE_BLACKLIST = new Set([
  'navigation', 'banner', 'complementary', 'form', 'search'
])

const AD_KEYWORDS = [
  'ad-', 'ads', 'advert', 'sponsor', 'advertisement', 'promo', 'banner'
]

const MIN_TEXT_LENGTH = 20

function hasBlacklistedAncestor(el) {
  let node = el.parentElement
  while (node) {
    if (ANCESTOR_BLACKLIST.has(node.tagName)) return true
    const role = node.getAttribute('role')
    if (role && ANCESTOR_ROLE_BLACKLIST.has(role)) return true
    node = node.parentElement
  }
  return false
}

function hasAdSignal(el) {
  let node = el
  while (node) {
    const cls = (node.className || '').toLowerCase()
    const id = (node.id || '').toLowerCase()
    if (AD_KEYWORDS.some(kw => cls.includes(kw) || id.includes(kw))) return true
    node = node.parentElement
  }
  return false
}

function shouldTranslate(el) {
  if (!TARGET_TAGS.has(el.tagName)) return false
  const text = el.textContent.trim()
  if (text.length < MIN_TEXT_LENGTH) return false
  if (hasBlacklistedAncestor(el)) return false
  if (hasAdSignal(el)) return false
  return true
}

function getTranslatableElements(root = document.body) {
  const candidates = root.querySelectorAll(
    'p, h1, h2, h3, h4, h5, h6, blockquote, figcaption, li, td, th'
  )
  return Array.from(candidates).filter(shouldTranslate)
}

if (typeof module !== 'undefined') {
  module.exports = { shouldTranslate, getTranslatableElements }
}
```

**Step 4: 运行测试确认通过**

```bash
npm test -- tests/detector.test.js
```
预期：所有测试 PASS

**Step 5: Commit**

```bash
git add content/detector.js tests/detector.test.js
git commit -m "feat: paragraph detector with 3-layer filter"
```

---

## Task 3: 双语渲染器

**Files:**
- Create: `content/renderer.js`
- Create: `tests/renderer.test.js`

**Step 1: 写失败的测试**

```js
// tests/renderer.test.js
const { injectTranslation, removeTranslation, setDisplayMode } = require('../content/renderer.js')

describe('injectTranslation', () => {
  beforeEach(() => {
    document.body.textContent = ''
    const p = document.createElement('p')
    p.id = 'para'
    p.textContent = 'Hello world paragraph text here.'
    document.body.appendChild(p)
  })

  test('在段落下方注入译文', () => {
    const el = document.getElementById('para')
    injectTranslation(el, '你好世界')
    const injected = el.querySelector('.bt-translation')
    expect(injected).not.toBeNull()
    expect(injected.textContent).toBe('你好世界')
  })

  test('重复注入时替换而非追加', () => {
    const el = document.getElementById('para')
    injectTranslation(el, '第一次')
    injectTranslation(el, '第二次')
    const all = el.querySelectorAll('.bt-translation')
    expect(all.length).toBe(1)
    expect(all[0].textContent).toBe('第二次')
  })

  test('removeTranslation 移除注入的译文', () => {
    const el = document.getElementById('para')
    injectTranslation(el, '你好')
    removeTranslation(el)
    expect(el.querySelector('.bt-translation')).toBeNull()
  })
})

describe('setDisplayMode', () => {
  test('bilingual 模式设置正确 class', () => {
    setDisplayMode('bilingual')
    expect(document.body.classList.contains('bt-mode-bilingual')).toBe(true)
  })

  test('translation-only 模式设置正确 class', () => {
    setDisplayMode('translation-only')
    expect(document.body.classList.contains('bt-mode-translation-only')).toBe(true)
  })

  test('切换模式时移除旧 class', () => {
    setDisplayMode('bilingual')
    setDisplayMode('translation-only')
    expect(document.body.classList.contains('bt-mode-bilingual')).toBe(false)
    expect(document.body.classList.contains('bt-mode-translation-only')).toBe(true)
  })
})
```

**Step 2: 运行确认失败**

```bash
npm test -- tests/renderer.test.js
```

**Step 3: 实现 renderer.js**

```js
// content/renderer.js

const MODES = ['bilingual', 'translation-only', 'original-only']

function injectTranslation(el, translatedText) {
  removeTranslation(el)

  const span = document.createElement('span')
  span.className = 'bt-translation'
  span.textContent = translatedText  // textContent，无 XSS 风险
  el.appendChild(span)
  el.dataset.btTranslated = 'true'
}

function removeTranslation(el) {
  const existing = el.querySelector('.bt-translation')
  if (existing) existing.remove()
  delete el.dataset.btTranslated
}

function setDisplayMode(mode) {
  MODES.forEach(m => document.body.classList.remove(`bt-mode-${m}`))
  document.body.classList.add(`bt-mode-${mode}`)
}

function injectStyles() {
  if (document.getElementById('bt-styles')) return
  const style = document.createElement('style')
  style.id = 'bt-styles'
  style.textContent = `
    .bt-translation {
      display: block;
      color: #555;
      font-size: 0.95em;
      margin-top: 4px;
      border-left: 3px solid #4285f4;
      padding-left: 8px;
    }
    .bt-retranslate {
      display: none;
      position: absolute;
      top: 2px;
      right: 2px;
      font-size: 11px;
      color: #999;
      cursor: pointer;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 3px;
      padding: 1px 4px;
    }
    [data-bt-translated]:hover .bt-retranslate { display: block; }
    [data-bt-translated] { position: relative; }
    .bt-mode-translation-only [data-bt-translated] > :not(.bt-translation):not(.bt-retranslate) {
      visibility: hidden;
      height: 0;
      overflow: hidden;
    }
    .bt-mode-original-only .bt-translation { display: none; }
  `
  document.head.appendChild(style)
}

function addRetranslateButton(el, onRetranslate) {
  // 避免重复添加
  if (el.querySelector('.bt-retranslate')) return
  const btn = document.createElement('button')
  btn.className = 'bt-retranslate'
  btn.textContent = '重翻'
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    onRetranslate(el)
  })
  el.appendChild(btn)
}

if (typeof module !== 'undefined') {
  module.exports = { injectTranslation, removeTranslation, setDisplayMode, injectStyles, addRetranslateButton }
}
```

**Step 4: 运行测试确认通过**

```bash
npm test -- tests/renderer.test.js
```

**Step 5: Commit**

```bash
git add content/renderer.js tests/renderer.test.js
git commit -m "feat: bilingual renderer with display modes and re-translate button"
```

---

## Task 4: 批量翻译队列（BatchQueue）

**Files:**
- Create: `background/batch-queue.js`
- Create: `tests/batch-queue.test.js`

**Step 1: 写失败的测试**

```js
// tests/batch-queue.test.js
jest.useFakeTimers()
const { createBatchQueue } = require('../background/batch-queue.js')

describe('BatchQueue', () => {
  test('300ms 后自动发送', async () => {
    const mockTranslate = jest.fn().mockResolvedValue(['译文1'])
    const queue = createBatchQueue(mockTranslate, { intervalMs: 300, maxCount: 8, maxChars: 8000 })

    queue.add({ id: '1', text: 'Hello world this is a test sentence.' })
    expect(mockTranslate).not.toHaveBeenCalled()

    jest.advanceTimersByTime(300)
    await Promise.resolve()

    expect(mockTranslate).toHaveBeenCalledWith(['Hello world this is a test sentence.'])
  })

  test('达到 maxCount 立即发送', async () => {
    const mockTranslate = jest.fn().mockResolvedValue(new Array(8).fill('译文'))
    const queue = createBatchQueue(mockTranslate, { intervalMs: 300, maxCount: 8, maxChars: 8000 })

    for (let i = 0; i < 8; i++) {
      queue.add({ id: String(i), text: `Sentence number ${i} for testing the batch queue system.` })
    }

    await Promise.resolve()
    expect(mockTranslate).toHaveBeenCalled()
  })

  test('翻译结果通过 onResult 回调返回', async () => {
    const mockTranslate = jest.fn().mockResolvedValue(['你好世界'])
    const queue = createBatchQueue(mockTranslate, { intervalMs: 300, maxCount: 8, maxChars: 8000 })

    const results = {}
    queue.add({
      id: 'a',
      text: 'Hello world sentence for testing.',
      onResult: (t) => { results['a'] = t }
    })

    jest.advanceTimersByTime(300)
    await Promise.resolve()
    await Promise.resolve()

    expect(results['a']).toBe('你好世界')
  })
})
```

**Step 2: 运行确认失败**

```bash
npm test -- tests/batch-queue.test.js
```

**Step 3: 实现 batch-queue.js**

```js
// background/batch-queue.js

function createBatchQueue(translateFn, { intervalMs = 300, maxCount = 8, maxChars = 8000 } = {}) {
  let pending = []
  let timer = null

  function flush() {
    if (pending.length === 0) return
    const batch = pending.splice(0)
    const texts = batch.map(item => item.text)

    translateFn(texts).then(results => {
      batch.forEach((item, i) => {
        if (item.onResult) item.onResult(results[i])
      })
    }).catch(err => {
      batch.forEach(item => {
        if (item.onError) item.onError(err)
      })
    })
  }

  function scheduleFlush() {
    if (timer) return
    timer = setTimeout(() => { timer = null; flush() }, intervalMs)
  }

  function add(item) {
    pending.push(item)
    const totalChars = pending.reduce((sum, i) => sum + i.text.length, 0)
    if (pending.length >= maxCount || totalChars >= maxChars) {
      if (timer) { clearTimeout(timer); timer = null }
      flush()
      return
    }
    scheduleFlush()
  }

  return { add, flush }
}

if (typeof module !== 'undefined') {
  module.exports = { createBatchQueue }
}
```

**Step 4: 运行测试确认通过**

```bash
npm test -- tests/batch-queue.test.js
```

**Step 5: Commit**

```bash
git add background/batch-queue.js tests/batch-queue.test.js
git commit -m "feat: batch translation queue with time/count/char limits"
```

---

## Task 5: 翻译源层

**Files:**
- Create: `background/translators/chrome-translator.js`
- Create: `background/translators/google-translator.js`
- Create: `background/translators/user-api-translator.js`
- Create: `background/translators/index.js`

**Step 1: 实现 chrome-translator.js**

```js
// background/translators/chrome-translator.js

async function isAvailable(fromLang, toLang) {
  if (typeof translation === 'undefined') return false
  const result = await translation.canTranslate({ sourceLanguage: fromLang, targetLanguage: toLang })
  return result === 'readily' || result === 'after-download'
}

async function translate(texts, fromLang, toLang) {
  const translator = await translation.createTranslator({
    sourceLanguage: fromLang,
    targetLanguage: toLang
  })
  return Promise.all(texts.map(text => translator.translate(text)))
}

if (typeof module !== 'undefined') {
  module.exports = { isAvailable, translate }
}
```

**Step 2: 实现 google-translator.js（免费兜底）**

```js
// background/translators/google-translator.js
// 使用 Google Translate 公开端点作为兜底，无 SLA，可能失效

async function translate(texts, fromLang, toLang) {
  const results = []
  for (const text of texts) {
    const params = new URLSearchParams({ client: 'gtx', sl: fromLang, tl: toLang, dt: 't', q: text })
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?${params}`)
    if (!res.ok) throw new Error(`Google Translate error: ${res.status}`)
    const json = await res.json()
    const translated = json[0].map(part => part[0]).join('')
    results.push(translated)
  }
  return results
}

if (typeof module !== 'undefined') {
  module.exports = { translate }
}
```

**Step 3: 实现 user-api-translator.js**

```js
// background/translators/user-api-translator.js

async function translate(texts, fromLang, toLang, { provider, key }) {
  switch (provider) {
    case 'deepl':   return translateDeepL(texts, fromLang, toLang, key)
    case 'openai':  return translateOpenAI(texts, fromLang, toLang, key)
    case 'gemini':  return translateGemini(texts, fromLang, toLang, key)
    default: throw new Error(`Unknown provider: ${provider}`)
  }
}

async function translateDeepL(texts, fromLang, toLang, key) {
  const res = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: { 'Authorization': `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: texts,
      source_lang: fromLang === 'auto' ? undefined : fromLang.toUpperCase(),
      target_lang: toLang.toUpperCase()
    })
  })
  if (!res.ok) throw new Error(`DeepL error: ${res.status}`)
  const json = await res.json()
  return json.translations.map(t => t.text)
}

async function translateOpenAI(texts, fromLang, toLang, key) {
  const numbered = texts.map((t, i) => `${i}: ${t}`).join('\n')
  const prompt = `Translate the following ${texts.length} texts to ${toLang}. Return a JSON array of translated strings, same order, no extra text.\n\n${numbered}`
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1
    })
  })
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`)
  const json = await res.json()
  return JSON.parse(json.choices[0].message.content)
}

async function translateGemini(texts, fromLang, toLang, key) {
  const numbered = texts.map((t, i) => `${i}: ${t}`).join('\n')
  const prompt = `Translate these texts to ${toLang}. Return JSON array only.\n\n${numbered}`
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  })
  if (!res.ok) throw new Error(`Gemini error: ${res.status}`)
  const json = await res.json()
  return JSON.parse(json.candidates[0].content.parts[0].text)
}

if (typeof module !== 'undefined') {
  module.exports = { translate }
}
```

**Step 4: 实现 translators/index.js（统一入口）**

```js
// background/translators/index.js

async function translateTexts(texts, fromLang, toLang, userApiConfig = null) {
  if (userApiConfig?.key && userApiConfig?.provider) {
    const { translate } = require('./user-api-translator.js')
    return translate(texts, fromLang, toLang, userApiConfig)
  }

  const chromeTranslator = require('./chrome-translator.js')
  if (await chromeTranslator.isAvailable(fromLang, toLang)) {
    return chromeTranslator.translate(texts, fromLang, toLang)
  }

  const googleTranslator = require('./google-translator.js')
  return googleTranslator.translate(texts, fromLang, toLang)
}

if (typeof module !== 'undefined') {
  module.exports = { translateTexts }
}
```

**Step 5: 实现 service-worker.js**

```js
// background/service-worker.js
importScripts('batch-queue.js', 'translators/chrome-translator.js',
  'translators/google-translator.js', 'translators/user-api-translator.js',
  'translators/index.js')

const queues = new Map()

function getQueue(fromLang, toLang, userApiConfig) {
  const key = `${fromLang}-${toLang}-${userApiConfig?.provider || 'free'}`
  if (!queues.has(key)) {
    const queue = createBatchQueue(
      (texts) => translateTexts(texts, fromLang, toLang, userApiConfig),
      { intervalMs: 300, maxCount: 8, maxChars: 8000 }
    )
    queues.set(key, queue)
  }
  return queues.get(key)
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'TRANSLATE') return false

  chrome.storage.local.get(['userApiConfig'], ({ userApiConfig }) => {
    const { text, fromLang, toLang } = msg
    const queue = getQueue(fromLang, toLang, userApiConfig)
    queue.add({
      id: msg.id,
      text,
      onResult: (translation) => sendResponse({ ok: true, translation }),
      onError: (err) => sendResponse({
        ok: false,
        error: err.message,
        isApiKeyError: !!(userApiConfig?.key)
      })
    })
  })

  return true // 异步 sendResponse
})
```

**Step 6: 手动测试翻译源**

在 DevTools Console 中：
```js
chrome.runtime.sendMessage(
  { type: 'TRANSLATE', id: 'test', text: 'Hello world', fromLang: 'auto', toLang: 'zh' },
  console.log
)
```
预期：`{ ok: true, translation: '你好世界' }`

**Step 7: Commit**

```bash
git add background/
git commit -m "feat: translation source layer with Chrome API, Google fallback, user API key"
```

---

## Task 6: Content Script 主逻辑

**Files:**
- Modify: `content/content.js`
- Modify: `manifest.json`

**Step 1: 更新 manifest.json 确保脚本顺序**

```json
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "exclude_matches": ["*://www.youtube.com/*"],
    "js": ["content/detector.js", "content/renderer.js", "content/content.js"],
    "run_at": "document_idle"
  },
  {
    "matches": ["*://www.youtube.com/*"],
    "js": ["content/renderer.js", "content/youtube.js"],
    "run_at": "document_idle"
  }
]
```

**Step 2: 实现 content.js**

```js
// content/content.js

(async function () {
  const { siteSettings = {}, displayMode = 'bilingual', targetLang = 'zh' }
    = await chrome.storage.local.get(['siteSettings', 'displayMode', 'targetLang'])

  if (siteSettings[location.hostname] === 'never') return

  injectStyles()
  setDisplayMode(displayMode)

  const elements = getTranslatableElements()
  elements.forEach(el => translateElement(el, targetLang))

  // 单页应用：监听 DOM 新增内容
  const observer = new MutationObserver(() => {
    const fresh = getTranslatableElements().filter(el => !el.dataset.btTranslated)
    fresh.forEach(el => translateElement(el, targetLang))
  })
  observer.observe(document.body, { childList: true, subtree: true })
})()

function translateElement(el, targetLang) {
  const text = el.textContent.trim()
  const id = Math.random().toString(36).slice(2)

  chrome.runtime.sendMessage(
    { type: 'TRANSLATE', id, text, fromLang: 'auto', toLang: targetLang },
    (response) => {
      if (chrome.runtime.lastError) return
      if (response?.ok) {
        injectTranslation(el, response.translation)
        addRetranslateButton(el, (target) => translateElement(target, targetLang))
      } else if (response?.isApiKeyError) {
        showApiErrorToast()
      }
    }
  )
}

let toastShown = false
function showApiErrorToast() {
  if (toastShown) return
  toastShown = true

  const toast = document.createElement('div')
  toast.style.cssText = [
    'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
    'background:#333', 'color:#fff', 'padding:12px 16px', 'border-radius:6px',
    'font-size:13px', 'display:flex', 'gap:10px', 'align-items:center',
    'font-family:system-ui'
  ].join(';')

  const msg = document.createElement('span')
  msg.textContent = '⚠ API Key 请求失败'

  const btnFree = document.createElement('button')
  btnFree.textContent = '切换免费模式'
  btnFree.style.cssText = 'background:#4285f4;color:#fff;border:none;border-radius:3px;padding:3px 8px;cursor:pointer'
  btnFree.addEventListener('click', async () => {
    await chrome.storage.local.set({ userApiConfig: {} })
    location.reload()
  })

  const btnOptions = document.createElement('button')
  btnOptions.textContent = '检查设置'
  btnOptions.style.cssText = 'background:transparent;color:#aaa;border:1px solid #555;border-radius:3px;padding:3px 8px;cursor:pointer'
  btnOptions.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }))

  toast.appendChild(msg)
  toast.appendChild(btnFree)
  toast.appendChild(btnOptions)
  document.body.appendChild(toast)

  setTimeout(() => { toast.remove(); toastShown = false }, 10000)
}
```

**Step 3: 在 service-worker.js 中处理 OPEN_OPTIONS 消息**

```js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage()
    return false
  }
  // ... 原有 TRANSLATE 逻辑
})
```

**Step 4: 手动测试**

1. 重新加载插件
2. 打开英文新闻页（BBC / Reuters）
3. 预期：正文段落下方出现蓝色左边框中文译文
4. 预期：nav、aside、广告区域无译文
5. hover 段落时出现"重翻"按钮，点击后重新翻译该段

**Step 5: Commit**

```bash
git add content/content.js manifest.json
git commit -m "feat: content script with DOM observer and API error toast"
```

---

## Task 7: YouTube 字幕模块

**Files:**
- Modify: `content/youtube.js`

**Step 1: 实现 youtube.js**

```js
// content/youtube.js

let lastText = ''
let debounceTimer = null
let transLine = null

async function init() {
  const { targetLang = 'zh' } = await chrome.storage.local.get('targetLang')
  waitForPlayer(targetLang)
}

function waitForPlayer(targetLang) {
  const interval = setInterval(() => {
    const container = document.querySelector('.ytp-caption-window-container')
    if (!container) return
    clearInterval(interval)

    const observer = new MutationObserver(() => {
      const captionEl = document.querySelector('.ytp-caption-segment')
      if (!captionEl) return

      const text = captionEl.textContent.trim()
      if (!text || text === lastText) return
      lastText = text

      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => translateCaption(text, targetLang, container), 200)
    })

    observer.observe(container, { childList: true, subtree: true, characterData: true })
  }, 500)
}

function translateCaption(text, targetLang, container) {
  chrome.runtime.sendMessage(
    { type: 'TRANSLATE', id: 'yt-' + Date.now(), text, fromLang: 'auto', toLang: targetLang },
    (response) => {
      if (!response?.ok) return
      showTranslation(response.translation, container)
    }
  )
}

function showTranslation(text, container) {
  if (!transLine) {
    transLine = document.createElement('div')
    transLine.className = 'bt-yt-translation'
    transLine.style.cssText = [
      'color:#fff', 'font-size:1em', 'text-align:center',
      'text-shadow:0 0 4px #000,0 0 4px #000',
      'margin-top:4px', 'pointer-events:none'
    ].join(';')
    container.appendChild(transLine)
  }
  transLine.textContent = text  // textContent，无 XSS 风险
}

init()
```

**Step 2: 手动测试**

1. 打开 YouTube 视频，开启英文字幕
2. 预期：字幕下方实时出现中文译文
3. 预期：切换视频后字幕仍然工作

**Step 3: Commit**

```bash
git add content/youtube.js
git commit -m "feat: YouTube bilingual subtitle with debounce"
```

---

## Task 8: Popup UI

**Files:**
- Modify: `popup/popup.html`
- Modify: `popup/popup.js`

**Step 1: 实现 popup.html**

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <style>
    body { width: 220px; padding: 12px; font-family: system-ui; font-size: 13px; margin: 0; }
    h3 { margin: 0 0 10px; font-size: 14px; font-weight: 600; }
    .row { display: flex; justify-content: space-between; align-items: center; margin: 8px 0; }
    select { font-size: 12px; padding: 3px 6px; border: 1px solid #ccc; border-radius: 3px; }
    .site { color: #888; font-size: 11px; margin-bottom: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    hr { border: none; border-top: 1px solid #eee; margin: 10px 0; }
    a { font-size: 11px; color: #4285f4; text-decoration: none; display: block; margin-top: 8px; }
  </style>
</head>
<body>
  <h3>双语翻译</h3>
  <div class="site" id="site"></div>

  <div class="row">
    <span>本站</span>
    <select id="site-setting">
      <option value="auto">自动翻译</option>
      <option value="never">永不翻译</option>
    </select>
  </div>

  <hr>

  <div class="row">
    <span>显示</span>
    <select id="display-mode">
      <option value="bilingual">双语</option>
      <option value="translation-only">仅译文</option>
      <option value="original-only">仅原文</option>
    </select>
  </div>

  <div class="row">
    <span>翻译为</span>
    <select id="target-lang">
      <option value="zh">中文</option>
      <option value="en">English</option>
      <option value="ja">日本語</option>
      <option value="ko">한국어</option>
    </select>
  </div>

  <a id="options-link" href="#">设置 API Key →</a>
  <script src="popup.js"></script>
</body>
</html>
```

**Step 2: 实现 popup.js**

```js
// popup/popup.js

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  let host = ''
  try { host = new URL(tab.url).hostname } catch {}

  document.getElementById('site').textContent = host

  const { siteSettings = {}, displayMode = 'bilingual', targetLang = 'zh' }
    = await chrome.storage.local.get(['siteSettings', 'displayMode', 'targetLang'])

  document.getElementById('site-setting').value = siteSettings[host] || 'auto'
  document.getElementById('display-mode').value = displayMode
  document.getElementById('target-lang').value = targetLang

  document.getElementById('site-setting').addEventListener('change', async (e) => {
    const updated = { ...siteSettings, [host]: e.target.value }
    await chrome.storage.local.set({ siteSettings: updated })
    chrome.tabs.reload(tab.id)
  })

  document.getElementById('display-mode').addEventListener('change', async (e) => {
    const mode = e.target.value
    await chrome.storage.local.set({ displayMode: mode })
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (m) => setDisplayMode(m),
      args: [mode]
    })
  })

  document.getElementById('target-lang').addEventListener('change', async (e) => {
    await chrome.storage.local.set({ targetLang: e.target.value })
    chrome.tabs.reload(tab.id)
  })

  document.getElementById('options-link').addEventListener('click', (e) => {
    e.preventDefault()
    chrome.runtime.openOptionsPage()
  })
}

init()
```

**Step 3: 手动测试**

1. 点击插件图标，Popup 正确显示当前域名
2. 切换"永不翻译" → 页面重载后停止翻译
3. 切换显示模式 → 即时生效，不需要重载

**Step 4: Commit**

```bash
git add popup/
git commit -m "feat: popup UI with site toggle, display mode, language selection"
```

---

## Task 9: Options 页面（API Key 配置）

**Files:**
- Modify: `options/options.html`
- Modify: `options/options.js`

**Step 1: 实现 options.html**

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>翻译插件设置</title>
  <style>
    body { max-width: 480px; margin: 40px auto; font-family: system-ui; font-size: 14px; color: #222; }
    h2 { font-size: 18px; margin-bottom: 20px; }
    .section { margin-bottom: 24px; padding: 16px; border: 1px solid #e0e0e0; border-radius: 8px; }
    .section h3 { margin: 0 0 12px; font-size: 14px; color: #555; }
    label { display: block; margin-bottom: 4px; font-weight: 500; }
    select, input[type="password"], input[type="text"] {
      width: 100%; padding: 7px 10px; box-sizing: border-box;
      border: 1px solid #ccc; border-radius: 4px; font-size: 13px; margin-bottom: 12px;
    }
    .hint { font-size: 11px; color: #888; margin: -8px 0 12px; }
    .checkbox-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    button { padding: 8px 20px; background: #4285f4; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .status { margin-top: 10px; font-size: 12px; color: #0a7d0a; min-height: 16px; }
  </style>
</head>
<body>
  <h2>翻译插件设置</h2>

  <div class="section">
    <h3>翻译源</h3>
    <label>API 提供商</label>
    <select id="api-provider">
      <option value="">免费模式（Chrome Translator API + Google）</option>
      <option value="deepl">DeepL（推荐，质量高）</option>
      <option value="openai">OpenAI（GPT-4o mini）</option>
      <option value="gemini">Google Gemini</option>
    </select>

    <label>API Key</label>
    <input type="password" id="api-key" placeholder="粘贴你的 API Key" />
    <p class="hint">仅存储在本地浏览器，不会上传到任何服务器。</p>

    <div class="checkbox-row">
      <input type="checkbox" id="enable-cache">
      <label for="enable-cache" style="margin:0;font-weight:normal">启用翻译缓存（加速/省钱，可能复用历史结果）</label>
    </div>
  </div>

  <button id="save">保存</button>
  <div class="status" id="status"></div>

  <script src="options.js"></script>
</body>
</html>
```

**Step 2: 实现 options.js**

```js
// options/options.js

async function init() {
  const { userApiConfig = {}, enableCache = false }
    = await chrome.storage.local.get(['userApiConfig', 'enableCache'])

  document.getElementById('api-provider').value = userApiConfig.provider || ''
  document.getElementById('api-key').value = userApiConfig.key || ''
  document.getElementById('enable-cache').checked = enableCache

  document.getElementById('save').addEventListener('click', async () => {
    const provider = document.getElementById('api-provider').value
    const key = document.getElementById('api-key').value.trim()
    const cache = document.getElementById('enable-cache').checked

    await chrome.storage.local.set({
      userApiConfig: provider && key ? { provider, key } : {},
      enableCache: cache
    })

    const status = document.getElementById('status')
    status.textContent = '已保存'
    setTimeout(() => { status.textContent = '' }, 2000)
  })
}

init()
```

**Step 3: 手动测试**

1. 点击 Popup 中的"设置 API Key →"打开 Options
2. 选择 DeepL，填入有效 Key，保存
3. 刷新页面，确认译文风格变为 DeepL 翻译

**Step 4: Commit**

```bash
git add options/
git commit -m "feat: options page with API key config and cache toggle"
```

---

## 完成标准

- [ ] 英文新闻页：正文双语对照，广告/导航/按钮无译文
- [ ] YouTube：英文字幕下方实时出现中文
- [ ] Popup：切换"永不翻译"生效，显示模式即时切换无需重载
- [ ] Options：填 DeepL Key 后走 DeepL；Key 错误时页面右下角出现提示
- [ ] 所有单测通过：`npm test`
- [ ] `chrome://extensions` 无报错，无过度权限申请
