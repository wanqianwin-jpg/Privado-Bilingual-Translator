# Rewrite Selection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 右键菜单 + 快捷键触发 AI 改写选中的 textarea 文字，改写后在 textarea 下方显示原文可撤销。

**Architecture:** SW 注册右键菜单（仅 Chrome）和快捷键命令，触发后向 content script 发 `REWRITE_SELECTION` 消息；新增 `content/rewriter.js` 负责调用 Chrome Prompt API（`ai.languageModel`）改写、替换 textarea 内容、展示原文还原条。

**Tech Stack:** Chrome Manifest V3 `commands` API, `contextMenus` API, `ai.languageModel` (Chrome Prompt API / Gemini Nano), Chrome `i18n` API

---

### Task 1: manifest.json — 添加权限和命令声明

**Files:**
- Modify: `manifest.json`

**Step 1: 在 `permissions` 数组中加入 `contextMenus`**

```json
"permissions": ["storage", "activeTab", "scripting", "contextMenus"],
```

**Step 2: 在 manifest 根层加入 `commands` 块**

```json
"commands": {
  "rewrite-selection": {
    "suggested_key": { "default": "Ctrl+Shift+R", "mac": "Command+Shift+R" },
    "description": "Rewrite selected text with AI"
  }
},
```

**Step 3: 在所有四个 `content_scripts` 条目里的 `js` 数组末尾（content.js 之前）加入 `"content/rewriter.js"`**

每个 js 数组示例（通用、reddit、youtube）：
```json
"js": ["content/detector.js", "content/renderer.js", "content/chrome-translator.js",
       "content/safari-translator.js", "content/floatball.js",
       "content/rewriter.js", "content/content.js"]
```

YouTube MAIN world 条目只有 `youtube-main.js`，**不需要加**。

**Step 4: 验证 manifest 合法**

```bash
cd /Users/qianwan/Privado/翻译插件
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('OK')"
```
Expected: `OK`

**Step 5: Commit**

```bash
git add manifest.json
git commit -m "feat: add contextMenus permission and rewrite-selection command"
```

---

### Task 2: i18n — 添加新字符串

**Files:**
- Modify: `_locales/en/messages.json`
- Modify: `_locales/zh_CN/messages.json`
- Modify: `_locales/zh_TW/messages.json`
- Modify: `_locales/es/messages.json`
- Modify: `_locales/de/messages.json`
- Modify: `_locales/fr/messages.json`
- Modify: `_locales/it/messages.json`

**Step 1: 在每个 messages.json 的最后一个条目前插入以下键（各语言对应翻译见下方）**

**en:**
```json
"ctxRewriteSelection": { "message": "Rewrite with AI" },
"rewriteWorking":      { "message": "Rewriting…" },
"rewriteRestoreLabel": { "message": "Original:" },
"rewriteRestoreBtn":   { "message": "Restore" },
"rewriteUnavailable":  { "message": "⚠ AI rewriter not available on this device" },
```

**zh_CN:**
```json
"ctxRewriteSelection": { "message": "AI 改写" },
"rewriteWorking":      { "message": "改写中…" },
"rewriteRestoreLabel": { "message": "原文：" },
"rewriteRestoreBtn":   { "message": "还原" },
"rewriteUnavailable":  { "message": "⚠ 此设备不支持 AI 改写" },
```

**zh_TW:**
```json
"ctxRewriteSelection": { "message": "AI 改寫" },
"rewriteWorking":      { "message": "改寫中…" },
"rewriteRestoreLabel": { "message": "原文：" },
"rewriteRestoreBtn":   { "message": "還原" },
"rewriteUnavailable":  { "message": "⚠ 此裝置不支援 AI 改寫" },
```

**es:**
```json
"ctxRewriteSelection": { "message": "Reescribir con IA" },
"rewriteWorking":      { "message": "Reescribiendo…" },
"rewriteRestoreLabel": { "message": "Original:" },
"rewriteRestoreBtn":   { "message": "Restaurar" },
"rewriteUnavailable":  { "message": "⚠ Reescritor de IA no disponible en este dispositivo" },
```

**de:**
```json
"ctxRewriteSelection": { "message": "Mit KI umschreiben" },
"rewriteWorking":      { "message": "Umschreiben…" },
"rewriteRestoreLabel": { "message": "Original:" },
"rewriteRestoreBtn":   { "message": "Wiederherstellen" },
"rewriteUnavailable":  { "message": "⚠ KI-Umschreiber auf diesem Gerät nicht verfügbar" },
```

**fr:**
```json
"ctxRewriteSelection": { "message": "Réécrire avec l'IA" },
"rewriteWorking":      { "message": "Réécriture…" },
"rewriteRestoreLabel": { "message": "Original :" },
"rewriteRestoreBtn":   { "message": "Restaurer" },
"rewriteUnavailable":  { "message": "⚠ Réécrivain IA non disponible sur cet appareil" },
```

**it:**
```json
"ctxRewriteSelection": { "message": "Riscrivi con IA" },
"rewriteWorking":      { "message": "Riscrittura…" },
"rewriteRestoreLabel": { "message": "Originale:" },
"rewriteRestoreBtn":   { "message": "Ripristina" },
"rewriteUnavailable":  { "message": "⚠ Riscrittore IA non disponibile su questo dispositivo" },
```

**Step 2: Commit**

```bash
git add _locales/
git commit -m "feat: add i18n strings for rewrite-selection feature"
```

---

### Task 3: service-worker.js — 注册右键菜单 + 命令监听

**Files:**
- Modify: `background/service-worker.js`

**Step 1: 修改 `registerContextMenus()` 函数，在 OCR 菜单项之后加入改写菜单（仅 Chrome）**

找到 `registerContextMenus` 函数，在 `ocr-translate` 的 `create` 之后加入：

```js
function registerContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'ocr-only',      title: chrome.i18n.getMessage('ctxOcrOnly'),      contexts: ['image'] })
    chrome.contextMenus.create({ id: 'ocr-translate', title: chrome.i18n.getMessage('ctxOcrTranslate'), contexts: ['image'] })
    if (!IS_SAFARI) {
      chrome.contextMenus.create({ id: 'rewrite-selection', title: chrome.i18n.getMessage('ctxRewriteSelection'), contexts: ['selection'] })
    }
  })
}
```

**Step 2: 修改调用 `registerContextMenus()` 的条件块，让 Chrome 也注册**

找到：
```js
if (IS_SAFARI) {
  registerContextMenus()
}
```

改为：
```js
chrome.runtime.onInstalled.addListener(registerContextMenus)
chrome.runtime.onStartup.addListener(registerContextMenus)
if (IS_SAFARI) {
  registerContextMenus()
}
```

> 原因：MV3 service worker 重启后上下文菜单会丢失，需在 onInstalled/onStartup 时重新注册。Safari MV2 persistent background 不需要这个。

**Step 3: 在 `chrome.contextMenus.onClicked.addListener` 的 handler 头部加入改写分支**

找到：
```js
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.srcUrl || !tab?.id) return
  if (info.menuItemId !== 'ocr-only' && info.menuItemId !== 'ocr-translate') return
```

改为：
```js
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'rewrite-selection') {
    if (!tab?.id) return
    const { targetLang = 'zh' } = await chrome.storage.local.get('targetLang')
    chrome.tabs.sendMessage(tab.id, {
      type: 'REWRITE_SELECTION',
      text: info.selectionText || null,
      targetLang
    }).catch(() => {})
    return
  }

  if (!info.srcUrl || !tab?.id) return
  if (info.menuItemId !== 'ocr-only' && info.menuItemId !== 'ocr-translate') return
```

**Step 4: 在文件末尾（`chrome.runtime.onMessage.addListener` 之后）加入命令监听**

```js
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'rewrite-selection') return
  if (!tab?.id) return
  const { targetLang = 'zh' } = await chrome.storage.local.get('targetLang')
  chrome.tabs.sendMessage(tab.id, {
    type: 'REWRITE_SELECTION',
    text: null,   // content script will read selection from document
    targetLang
  }).catch(() => {})
})
```

**Step 5: Commit**

```bash
git add background/service-worker.js
git commit -m "feat: register rewrite-selection context menu and command handler in SW"
```

---

### Task 4: content/rewriter.js — 改写逻辑 + 原文还原条

**Files:**
- Create: `content/rewriter.js`

**Step 1: 创建文件**

```js
;(function () {
  const i18n = (key) => chrome.i18n.getMessage(key)

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'REWRITE_SELECTION') return
    handleRewrite(msg.text, msg.targetLang)
  })

  async function handleRewrite(providedText, targetLang) {
    // Resolve target element and text
    const active = document.activeElement
    const isEditable = active && (
      active.tagName === 'TEXTAREA' ||
      (active.tagName === 'INPUT' && active.type === 'text') ||
      active.isContentEditable
    )

    const text = providedText || (isEditable ? getEditableText(active) : null)
    if (!text?.trim()) return

    // Check API availability
    if (typeof ai === 'undefined' || !ai.languageModel) {
      showRewriteToast(i18n('rewriteUnavailable'), 4000)
      return
    }

    const toast = showRewriteToast(i18n('rewriteWorking'), 0)

    let session
    try {
      const langName = new Intl.DisplayNames(['en'], { type: 'language' }).of(targetLang) || targetLang
      session = await ai.languageModel.create({
        systemPrompt: `You are a writing assistant. Rewrite the user's input in fluent ${langName}. Output only the rewritten text with no explanation.`
      })
      const result = await session.prompt(text)
      toast.remove()

      if (isEditable && active.isConnected) {
        const original = getEditableText(active)
        setEditableText(active, result)
        showRestoreBar(active, original)
      }
    } catch (e) {
      toast.remove()
      showRewriteToast('⚠ ' + (e.message || 'Rewrite failed'), 4000)
    } finally {
      session?.destroy()
    }
  }

  function getEditableText(el) {
    return el.isContentEditable ? el.innerText : el.value
  }

  function setEditableText(el, text) {
    if (el.isContentEditable) {
      el.innerText = text
    } else {
      // Trigger React/Vue synthetic event if needed
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      if (nativeSetter) nativeSetter.call(el, text)
      else el.value = text
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }

  function showRestoreBar(anchor, original) {
    document.getElementById('bt-rewrite-restore')?.remove()

    const bar = document.createElement('div')
    bar.id = 'bt-rewrite-restore'
    bar.style.cssText = [
      'display:flex', 'align-items:center', 'gap:8px',
      'margin-top:4px', 'font-size:12px', 'font-family:system-ui',
      'color:#888'
    ].join(';')

    const label = document.createElement('span')
    label.textContent = i18n('rewriteRestoreLabel') + ' ' + original.slice(0, 60) + (original.length > 60 ? '…' : '')

    const btn = document.createElement('button')
    btn.textContent = i18n('rewriteRestoreBtn')
    btn.style.cssText = 'background:transparent;border:1px solid #ccc;border-radius:3px;padding:1px 6px;cursor:pointer;color:#555;font-size:11px'
    btn.addEventListener('click', () => {
      if (anchor.isConnected) setEditableText(anchor, original)
      bar.remove()
    })

    bar.append(label, btn)
    anchor.insertAdjacentElement('afterend', bar)

    // Auto-remove when user submits or after 30s
    const cleanup = () => bar.remove()
    anchor.closest('form')?.addEventListener('submit', cleanup, { once: true })
    setTimeout(cleanup, 30000)
  }

  function showRewriteToast(message, duration) {
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
git add content/rewriter.js
git commit -m "feat: add rewriter.js — AI rewrite via Prompt API with restore bar"
```

---

### Task 5: 手动测试

**准备：**
1. 在 Chrome 打开 `chrome://extensions` → 加载/刷新插件
2. 确认 `chrome://extensions/shortcuts` 中 Privado 有 "Rewrite selected text with AI" 条目，默认 `Ctrl+Shift+R`

**测试流程：**

1. 打开任意有评论区的外文网站（如 reddit.com）
2. 点击评论框，输入一段中文
3. 选中文字 → 右键 → 应出现 "Rewrite with AI" 菜单项
4. 点击 → 等待改写 → textarea 内容变为英文，下方出现原文还原条
5. 点击 "Restore" → 内容还原为原来的中文
6. 重复第 2 步，使用 `Ctrl+Shift+R` 快捷键触发 → 同样效果

**边界测试：**
- 在普通页面文字（非 textarea）选中后右键触发 → 不应崩溃，toast 提示不可用或静默
- Safari 浏览器中右键菜单 → 不应出现 "Rewrite with AI" 条目
