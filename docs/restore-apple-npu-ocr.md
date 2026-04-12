# 恢复 Apple NPU / OCR 功能指南

> 完整代码保存在 `feature/apple-npu-ocr` 分支。
> 本文档描述该分支相对 main 多出的所有改动，方便 rebase 冲突时参考。

---

## 背景

Apple NPU 路径依赖 **SnapFocus**——一个 macOS 原生 App，
在 `localhost:57312` 暴露 HTTP 接口，浏览器插件通过它调用系统 ANE 能力。

接口约定：
- `GET  /ping`         → 200 表示 App 在线
- `POST /ocr`          → body `{ image: "data:image/...;base64,..." }`, 返回 `{ full: "识别文字" }`
- `POST /translate`    → (由 content/snapfocus.js 实现，见下)

---

## 恢复步骤

### 方式一：直接用分支（推荐）

```bash
git checkout feature/apple-npu-ocr
git rebase main          # 把 apple 改动接到最新 main 上
# 解决冲突（通常只在下列几处）
git checkout main
git merge feature/apple-npu-ocr
```

### 方式二：手动打补丁（rebase 冲突无法自动解决时参考）

---

## 需要恢复的文件及改动

### 1. `manifest.json`

权限加回 `"contextMenus"`：

```diff
- "permissions": ["storage", "activeTab", "scripting"],
+ "permissions": ["storage", "activeTab", "scripting", "contextMenus"],
```

### 2. `background/service-worker.js`

在 `// ── Page translation queue` 注释之前，插入整个 OCR 区块：

```js
// ── Context menus (SnapFocus image OCR) ──────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'ocr-only',      title: chrome.i18n.getMessage('ctxOcrOnly'),      contexts: ['image'] })
  chrome.contextMenus.create({ id: 'ocr-translate', title: chrome.i18n.getMessage('ctxOcrTranslate'), contexts: ['image'] })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.srcUrl || !tab?.id) return
  if (info.menuItemId !== 'ocr-only' && info.menuItemId !== 'ocr-translate') return

  const needTranslate = info.menuItemId === 'ocr-translate'

  // 1. Ping SnapFocus
  try {
    const ping = await fetch('http://localhost:57312/ping', { signal: AbortSignal.timeout(1500) })
    if (!ping.ok) throw new Error()
  } catch {
    chrome.tabs.sendMessage(tab.id, { type: 'OCR_ERROR', error: 'snapfocus_offline' }).catch(() => {})
    return
  }

  // 2. Fetch image → base64 data URI
  let dataUri
  try {
    dataUri = await fetchImageAsDataUri(info.srcUrl)
  } catch {
    chrome.tabs.sendMessage(tab.id, { type: 'OCR_ERROR', error: 'fetch_failed' }).catch(() => {})
    return
  }

  // 3. OCR
  let full
  try {
    const res = await fetch('http://localhost:57312/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUri }),
      signal: AbortSignal.timeout(12000)
    })
    const json = await res.json()
    full = (json.full || '').trim()
  } catch {
    chrome.tabs.sendMessage(tab.id, { type: 'OCR_ERROR', error: 'ocr_failed' }).catch(() => {})
    return
  }

  if (!full) {
    chrome.tabs.sendMessage(tab.id, { type: 'OCR_ERROR', error: 'no_text' }).catch(() => {})
    return
  }

  // 4. Translate (optional)
  let translation = null
  if (needTranslate) {
    try {
      const { targetLang = 'zh' } = await chrome.storage.local.get('targetLang')
      const { translateMode, apiProvider, apiKey, apiModel, apiBaseUrl } = config
      const userApiConfig = translateMode === 'api' && apiKey
        ? { provider: apiProvider, key: apiKey, model: apiModel, baseUrl: apiBaseUrl }
        : null
      ;[translation] = await translateTexts([full], 'auto', targetLang, userApiConfig)
    } catch {}
  }

  chrome.tabs.sendMessage(tab.id, { type: 'OCR_RESULT', srcUrl: info.srcUrl, full, translation }).catch(() => {})
})

async function fetchImageAsDataUri(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const mimeType = res.headers.get('content-type')?.split(';')[0] || 'image/png'
  const uint8 = new Uint8Array(await res.arrayBuffer())
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < uint8.length; i += chunk) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunk))
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}
```

### 3. `content/content.js`

**3a.** 在 `startTranslation()` 的 `chrome-local` 检测之后，加入 apple-npu ping：

```js
// apple-npu: ping SnapFocus upfront
if (translateMode === 'apple-npu') {
  const alive = await snapFocusPing()
  if (!alive) {
    showPrivacyUnavailableToast()
    ball.setState('idle')
    translationStarted = false
    return
  }
}
```

**3b.** 在 `translateElement()` 的 `chrome-local` 分支之后，加入 apple-npu 分支：

```js
// apple-npu: SnapFocus local HTTP
if (translateMode === 'apple-npu') {
  try {
    const translation = await snapFocusTranslate(text, targetLang)
    injectTranslation(el, translation)
    return
  } catch {}
  // SnapFocus unavailable for this element — silent SW fallback
}
```

**3c.** 在文件末尾（`makeBtn` 函数之后）加入整个 OCR overlay 区块：

```js
// ── OCR overlay (triggered by context menu via SW) ────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'OCR_RESULT') showOcrOverlay(msg.srcUrl, msg.full, msg.translation)
  if (msg.type === 'OCR_ERROR')  showOcrErrorToast(msg.error)
})

function showOcrOverlay(srcUrl, text, translation) {
  document.getElementById('bt-ocr-overlay')?.remove()

  let anchor = null
  for (const img of document.querySelectorAll('img')) {
    if (img.src === srcUrl || img.currentSrc === srcUrl) { anchor = img; break }
  }

  const overlay = document.createElement('div')
  overlay.id = 'bt-ocr-overlay'
  overlay.style.cssText = [
    'position:fixed', 'z-index:2147483647',
    'background:#1e1e1e', 'color:#f0f0f0',
    'border-radius:10px', 'padding:14px 16px',
    'font-size:13px', 'font-family:system-ui',
    'max-width:340px', 'min-width:180px',
    'box-shadow:0 6px 24px rgba(0,0,0,0.45)',
    'line-height:1.6'
  ].join(';')

  if (anchor) {
    const r = anchor.getBoundingClientRect()
    overlay.style.top  = Math.min(r.bottom + 10, window.innerHeight - 220) + 'px'
    overlay.style.left = Math.max(10, Math.min(r.left, window.innerWidth - 360)) + 'px'
  } else {
    overlay.style.top = '50%'
    overlay.style.left = '50%'
    overlay.style.transform = 'translate(-50%, -50%)'
  }

  const header = document.createElement('div')
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px'
  const title = document.createElement('span')
  title.style.cssText = 'font-size:11px;color:#888;font-weight:600;letter-spacing:0.03em'
  title.textContent = i18n('ocrHeader')
  const closeBtn = document.createElement('button')
  closeBtn.textContent = '✕'
  closeBtn.style.cssText = 'background:none;border:none;color:#666;cursor:pointer;font-size:12px;padding:0;line-height:1'
  closeBtn.addEventListener('click', () => overlay.remove())
  header.append(title, closeBtn)
  overlay.appendChild(header)

  const textEl = document.createElement('div')
  textEl.textContent = text
  textEl.style.cssText = 'white-space:pre-wrap;word-break:break-word'
  overlay.appendChild(textEl)

  if (translation) {
    const divider = document.createElement('div')
    divider.style.cssText = 'border-top:1px solid #333;margin:10px 0'
    overlay.appendChild(divider)
    const transEl = document.createElement('div')
    transEl.textContent = translation
    transEl.style.cssText = 'color:#aaa;white-space:pre-wrap;word-break:break-word'
    overlay.appendChild(transEl)
  }

  const btnRow = document.createElement('div')
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:12px'

  function makeCopyBtn(label, content) {
    const btn = document.createElement('button')
    btn.textContent = label
    btn.style.cssText = 'background:#333;color:#ddd;border:none;border-radius:5px;padding:5px 10px;font-size:11px;cursor:pointer;flex:1'
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(content)
      btn.textContent = i18n('btnCopied')
      setTimeout(() => { btn.textContent = label }, 1500)
    })
    return btn
  }

  btnRow.appendChild(makeCopyBtn(i18n('btnCopyOriginal'), text))
  if (translation) btnRow.appendChild(makeCopyBtn(i18n('btnCopyTranslation'), translation))
  overlay.appendChild(btnRow)

  document.body.appendChild(overlay)
  setTimeout(() => overlay.remove(), 30000)
}

const OCR_ERROR_KEYS = {
  snapfocus_offline: 'ocrErrOffline',
  fetch_failed:      'ocrErrFetchFailed',
  ocr_failed:        'ocrErrOcrFailed',
  no_text:           'ocrErrNoText'
}

function showOcrErrorToast(error) {
  const toast = makeToast()
  const msg = document.createElement('span')
  const key = OCR_ERROR_KEYS[error]
  msg.textContent = '⚠ ' + (key ? i18n(key) : i18n('toastOcrError').replace('⚠ ', ''))
  toast.appendChild(msg)
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 4000)
}
```

### 4. `popup/popup.html`

在 `#privacy-sub` 里的 `chrome-local` 选项之后，加回 apple-npu 选项：

```html
<div class="sub-option" data-sub="apple-npu">
  <span class="sub-dot"></span>
  <span class="sub-label" data-i18n="subLabelApple">Apple NPU</span>
  <span class="sub-status" id="status-apple" data-i18n="statusDetecting">Detecting</span>
</div>
```

### 5. `popup/popup.js`

**5a.** 第 1 行 PRIVACY_MODES 加回 `'apple-npu'`：

```diff
- const PRIVACY_MODES = new Set(['chrome-local'])
+ const PRIVACY_MODES = new Set(['chrome-local', 'apple-npu'])
```

**5b.** `runDetection()` 里加回调用：

```diff
  async function runDetection(targetLang) {
    if (detectionRan) return
    detectionRan = true
    detectChrome(targetLang)
+   detectAppleNpu()
  }
```

**5c.** 加回 `detectAppleNpu()` 函数（放在 `detectChrome` 之后）：

```js
async function detectAppleNpu() {
  const el = document.getElementById('status-apple')
  try {
    const res = await fetch('http://localhost:57312/ping', { signal: AbortSignal.timeout(1500) })
    res.ok ? setStatus(el, 'ok', i18n('statusConnected')) : setStatus(el, 'err', i18n('statusNotRunning'))
  } catch { setStatus(el, 'err', i18n('statusNotRunning')) }
}
```

---

## 待补充（功能当时未完成）

- `content/snapfocus.js`：实现 `snapFocusPing()` 和 `snapFocusTranslate()` 两个函数，
  通过 `fetch('http://localhost:57312/...')` 与 SnapFocus App 通信。
  需要加入 manifest.json 对应 content_scripts 的 `js` 列表。
- `_locales/*/messages.json`：确认 `subLabelApple`、`statusConnected`、`statusNotRunning`、
  `ctxOcrOnly`、`ctxOcrTranslate`、`ocrHeader`、`ocrErrOffline` 等 i18n key 存在。

---

## i18n key 清单（OCR/Apple 相关）

| key | 用途 |
|-----|------|
| `subLabelApple` | popup 子选项标签 |
| `statusConnected` | SnapFocus 在线状态 |
| `statusNotRunning` | SnapFocus 未运行状态 |
| `ctxOcrOnly` | 右键菜单：仅 OCR |
| `ctxOcrTranslate` | 右键菜单：OCR + 翻译 |
| `ocrHeader` | OCR 浮层标题 |
| `ocrErrOffline` | SnapFocus 离线错误 |
| `ocrErrFetchFailed` | 图片抓取失败错误 |
| `ocrErrOcrFailed` | OCR 识别失败错误 |
| `ocrErrNoText` | 未识别到文字错误 |
| `toastOcrError` | 通用 OCR 错误 toast |
| `btnCopyOriginal` | 复制原文按钮 |
| `btnCopyTranslation` | 复制译文按钮 |
| `btnCopied` | 复制成功状态 |
