# Read Aloud Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 右键菜单 + 快捷键触发朗读选中文字，使用浏览器原生 `speechSynthesis` API，朗读期间显示停止条。

**Architecture:** 与 rewrite-selection 模式一致——SW 注册右键菜单（contexts: selection）和快捷键命令，触发后向 content script 发 `READ_ALOUD` 消息；新增 `content/reader.js` 负责调用 `speechSynthesis`、语言检测、停止条 UI。`speechSynthesis` 在 Chrome 和 Safari（含 iOS）均原生支持，无需 Native Messaging 或 Swift 改动。

**Tech Stack:** Web Speech API (`speechSynthesis`), `chrome.i18n.detectLanguage`, Chrome `commands` API, `contextMenus` API

---

### Task 1: manifest.json — 添加 read-aloud 命令 + reader.js 注入

**Files:**
- Modify: `manifest.json`

**Step 1: 在 `commands` 块中加入 `read-aloud` 命令**

找到现有的 `commands` 块（已有 `rewrite-selection`），追加：

```json
"commands": {
  "rewrite-selection": {
    "suggested_key": { "default": "Ctrl+Shift+R", "mac": "Command+Shift+R" },
    "description": "Rewrite selected text with AI"
  },
  "read-aloud": {
    "suggested_key": { "default": "Ctrl+Shift+E", "mac": "Command+Shift+E" },
    "description": "Read selected text aloud"
  }
},
```

**Step 2: 在三个 content_scripts 条目（general、reddit、youtube-isolated）的 `js` 数组中，`rewriter.js` 之后、`content.js` 之前加入 `"content/reader.js"`**

每个条目示例：
```json
"js": ["content/detector.js", "content/renderer.js", "content/chrome-translator.js",
       "content/safari-translator.js", "content/floatball.js",
       "content/rewriter.js", "content/reader.js", "content/content.js"]
```

YouTube MAIN world 条目（仅 `youtube-main.js`）**不动**。

**Step 3: 验证 JSON**

```bash
cd /Users/qianwan/Privado/翻译插件
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('OK')"
```
Expected: `OK`

**Step 4: Commit**

```bash
git add manifest.json
git commit -m "feat: add read-aloud command and reader.js to content scripts"
```

---

### Task 2: i18n — 添加新字符串

**Files:**
- Modify: `_locales/{en,zh_CN,zh_TW,es,de,fr,it}/messages.json`

**Step 1: 在每个文件末尾（`optionsShortcutCustomize` 之后）加入以下键**

**en:**
```json
"ctxReadAloud":       { "message": "Read Aloud" },
"readAloudStop":      { "message": "Stop" },
"readAloudReading":   { "message": "Reading…" },
"readAloudUnavailable": { "message": "⚠ Text-to-speech not available" },
"optionsShortcutReadAloud": { "message": "Read Aloud" }
```

**zh_CN:**
```json
"ctxReadAloud":       { "message": "朗读原文" },
"readAloudStop":      { "message": "停止" },
"readAloudReading":   { "message": "朗读中…" },
"readAloudUnavailable": { "message": "⚠ 此设备不支持文字转语音" },
"optionsShortcutReadAloud": { "message": "朗读原文" }
```

**zh_TW:**
```json
"ctxReadAloud":       { "message": "朗讀原文" },
"readAloudStop":      { "message": "停止" },
"readAloudReading":   { "message": "朗讀中…" },
"readAloudUnavailable": { "message": "⚠ 此裝置不支援文字轉語音" },
"optionsShortcutReadAloud": { "message": "朗讀原文" }
```

**es:**
```json
"ctxReadAloud":       { "message": "Leer en voz alta" },
"readAloudStop":      { "message": "Detener" },
"readAloudReading":   { "message": "Leyendo…" },
"readAloudUnavailable": { "message": "⚠ Texto a voz no disponible" },
"optionsShortcutReadAloud": { "message": "Leer en voz alta" }
```

**de:**
```json
"ctxReadAloud":       { "message": "Vorlesen" },
"readAloudStop":      { "message": "Stoppen" },
"readAloudReading":   { "message": "Liest vor…" },
"readAloudUnavailable": { "message": "⚠ Text-to-Speech nicht verfügbar" },
"optionsShortcutReadAloud": { "message": "Vorlesen" }
```

**fr:**
```json
"ctxReadAloud":       { "message": "Lire à voix haute" },
"readAloudStop":      { "message": "Arrêter" },
"readAloudReading":   { "message": "Lecture…" },
"readAloudUnavailable": { "message": "⚠ Synthèse vocale non disponible" },
"optionsShortcutReadAloud": { "message": "Lire à voix haute" }
```

**it:**
```json
"ctxReadAloud":       { "message": "Leggi ad alta voce" },
"readAloudStop":      { "message": "Ferma" },
"readAloudReading":   { "message": "Lettura…" },
"readAloudUnavailable": { "message": "⚠ Sintesi vocale non disponibile" },
"optionsShortcutReadAloud": { "message": "Leggi ad alta voce" }
```

**Step 2: 验证所有 JSON**

```bash
cd /Users/qianwan/Privado/翻译插件
for f in _locales/*/messages.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" && echo "$f OK"; done
```
Expected: 7 行 `OK`

**Step 3: Commit**

```bash
git add _locales/
git commit -m "feat: add i18n strings for read-aloud feature"
```

---

### Task 3: service-worker.js — 注册右键菜单 + 命令监听

**Files:**
- Modify: `background/service-worker.js`

**Step 1: 在 `registerContextMenus()` 的 `if (!IS_SAFARI)` 块内，`rewrite-selection` 之后加入 `read-aloud` 菜单项**

```js
if (!IS_SAFARI) {
  chrome.contextMenus.create({ id: 'rewrite-selection', title: chrome.i18n.getMessage('ctxRewriteSelection'), contexts: ['selection'] })
  chrome.contextMenus.create({ id: 'read-aloud', title: chrome.i18n.getMessage('ctxReadAloud'), contexts: ['selection'] })
}
```

**Step 2: 在 `chrome.contextMenus.onClicked.addListener` handler 中，`rewrite-selection` 分支之后加入 `read-aloud` 分支**

```js
  if (info.menuItemId === 'read-aloud') {
    if (!tab?.id) return
    chrome.tabs.sendMessage(tab.id, {
      type: 'READ_ALOUD',
      text: info.selectionText || null
    }).catch(() => {})
    return
  }
```

**Step 3: 在 `chrome.commands.onCommand.addListener` 中加入 `read-aloud` case**

找到现有的命令监听器：
```js
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'rewrite-selection') return
  ...
})
```

改为：
```js
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'rewrite-selection') {
    if (!tab?.id) return
    const { targetLang = 'zh' } = await chrome.storage.local.get('targetLang')
    chrome.tabs.sendMessage(tab.id, {
      type: 'REWRITE_SELECTION',
      text: null,
      targetLang
    }).catch(() => {})
    return
  }

  if (command === 'read-aloud') {
    if (!tab?.id) return
    chrome.tabs.sendMessage(tab.id, {
      type: 'READ_ALOUD',
      text: null
    }).catch(() => {})
  }
})
```

**Step 4: Commit**

```bash
git add background/service-worker.js
git commit -m "feat: register read-aloud context menu and command in SW"
```

---

### Task 4: content/reader.js — speechSynthesis + 停止条 UI

**Files:**
- Create: `content/reader.js`

**Step 1: 创建文件**

```js
;(function () {
  const i18n = (key) => chrome.i18n.getMessage(key)

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'READ_ALOUD') handleReadAloud(msg.text)
    if (msg.type === 'STOP_READING') stopReading()
  })

  async function handleReadAloud(providedText) {
    const text = providedText || getSelection()?.toString().trim()
    if (!text) return

    if (!window.speechSynthesis) {
      showToast(i18n('readAloudUnavailable'), 4000)
      return
    }

    stopReading()

    const utterance = new SpeechSynthesisUtterance(text)

    // Detect language for better voice selection
    if (chrome.i18n?.detectLanguage) {
      chrome.i18n.detectLanguage(text, ({ languages } = {}) => {
        const top = languages?.[0]
        if (top?.language && top.percentage > 50) utterance.lang = top.language
        speak(utterance)
      })
    } else {
      speak(utterance)
    }
  }

  function speak(utterance) {
    showStopBar()
    utterance.onend = cleanup
    utterance.onerror = cleanup
    window.speechSynthesis.speak(utterance)
  }

  function stopReading() {
    window.speechSynthesis.cancel()
    cleanup()
  }

  function cleanup() {
    document.getElementById('bt-read-stop')?.remove()
  }

  function showStopBar() {
    cleanup()

    const bar = document.createElement('div')
    bar.id = 'bt-read-stop'
    bar.style.cssText = [
      'position:fixed', 'bottom:20px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:2147483647', 'background:#1e1e1e', 'color:#f0f0f0',
      'padding:8px 16px', 'border-radius:20px',
      'font-size:13px', 'font-family:system-ui',
      'display:flex', 'align-items:center', 'gap:10px',
      'box-shadow:0 4px 16px rgba(0,0,0,0.35)'
    ].join(';')

    const label = document.createElement('span')
    label.textContent = i18n('readAloudReading')

    const btn = document.createElement('button')
    btn.textContent = i18n('readAloudStop')
    btn.style.cssText = 'background:#ff3b30;color:#fff;border:none;border-radius:10px;padding:3px 10px;cursor:pointer;font-size:12px'
    btn.addEventListener('click', stopReading)

    bar.append(label, btn)
    document.body.appendChild(bar)
  }

  function showToast(message, duration) {
    const el = document.createElement('div')
    el.style.cssText = [
      'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
      'background:#333', 'color:#fff', 'padding:10px 14px', 'border-radius:6px',
      'font-size:13px', 'font-family:system-ui'
    ].join(';')
    el.textContent = message
    document.body.appendChild(el)
    if (duration > 0) setTimeout(() => el.remove(), duration)
    return el
  }
})()
```

**Step 2: Commit**

```bash
git add content/reader.js
git commit -m "feat: add reader.js — Read Aloud via speechSynthesis with stop bar"
```

---

### Task 5: options/options.html — Shortcuts 卡片加 Read Aloud 行

**Files:**
- Modify: `options/options.html`

**Step 1: 在 `#shortcuts-section` 卡片中，现有 `rewrite` shortcut-row 之后加入 `read-aloud` 行**

找到：
```html
  <div class="form-row shortcut-row">
    <span class="shortcut-label" data-i18n="optionsShortcutRewrite">Rewrite with AI</span>
    <kbd id="shortcut-rewrite"></kbd>
  </div>
```

在其后插入：
```html
  <div class="form-row shortcut-row">
    <span class="shortcut-label" data-i18n="optionsShortcutReadAloud">Read Aloud</span>
    <kbd id="shortcut-read-aloud"></kbd>
  </div>
```

**Step 2: 在 `options/options.js` 的快捷键读取代码之后，加入 read-aloud 的显示**

找到：
```js
  document.getElementById('shortcut-rewrite').textContent = rewriteCmd?.shortcut || i18n('optionsShortcutNotSet')
```

在其后加入：
```js
  const readAloudCmd = commands.find(c => c.name === 'read-aloud')
  document.getElementById('shortcut-read-aloud').textContent = readAloudCmd?.shortcut || i18n('optionsShortcutNotSet')
```

**Step 3: Commit**

```bash
git add options/options.html options/options.js
git commit -m "feat: show read-aloud shortcut in options Shortcuts section"
```

---

### Task 6: 手动测试

1. `chrome://extensions` 重新加载插件
2. `chrome://extensions/shortcuts` 确认出现 "Read selected text aloud" 条目，默认 `Command+Shift+E`
3. 打开任意外文网页，选中一段文字
4. 右键 → 应出现 "Read Aloud" 菜单项 → 点击 → 页面底部中央出现朗读条，开始朗读
5. 点击 "Stop" → 停止朗读，朗读条消失
6. 再次选中文字，使用 `Command+Shift+E` 快捷键触发 → 同样效果
7. 进入 Options 页 → Keyboard Shortcuts 卡片应显示两行：Rewrite with AI 和 Read Aloud，各自显示当前快捷键
