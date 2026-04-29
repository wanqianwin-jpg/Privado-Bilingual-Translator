// content/youtube.js — bilingual YouTube captions via XHR interception + timeupdate sync.
// youtube-main.js (MAIN world) intercepts the timedtext XHR and posts the URL here.
// Also handles YouTube page translation (comments, descriptions, titles) via direct element queries.

// Signal to content.js that YouTube-specific scanning is active; content.js skips generic scan.
window.BT_IS_YOUTUBE = true

let subtitles = []        // [{start, end, text, translation, pending}]
let currentVideoId = null
let overlayEl = null
let paperEl = null
let playerBtn = null
let targetLang = 'zh'
let translateMode = 'machine'
let timeUpdateBound = false
let videoEl = null

// 三档：'bilingual' | 'translation-only' | 'off'
const YT_MODES = ['bilingual', 'translation-only', 'off']
const YT_MODE_LABEL = { 'bilingual': '双语', 'translation-only': '仅译', 'off': '字幕' }
let ytMode = 'bilingual'

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const data = await chrome.storage.local.get(['targetLang', ...TRANSLATE_MODE_KEYS])
  targetLang = data.targetLang || 'zh'
  translateMode = resolveTranslateMode(data)

  window.addEventListener('message', onMainWorldMessage)
  window.addEventListener('yt-navigate-finish', onNavigate)

  waitForControls()
}

function onNavigate() {
  restoreNativeCC()
  subtitles = []
  currentVideoId = null
  overlayEl?.remove(); overlayEl = null
  paperEl = null
  if (videoEl) { videoEl.removeEventListener('timeupdate', onTimeUpdate); videoEl = null }
  timeUpdateBound = false
  playerBtn?.remove(); playerBtn = null
  waitForControls()
  setTimeout(scanYtPage, 1500)  // wait for new page content to render
}

// ── XHR interception handler ─────────────────────────────────────────────────

function onMainWorldMessage(e) {
  if (e.data?.type !== 'BT_YOUTUBE_TIMEDTEXT') return
  const videoId = new URLSearchParams(location.search).get('v')
  if (!videoId) return

  const url = new URL(e.data.url)
  const urlVideoId = url.searchParams.get('v')
  if (urlVideoId && urlVideoId !== videoId) return  // different video, skip

  // Already loaded subtitles for this video
  if (videoId === currentVideoId && subtitles.length) return

  currentVideoId = videoId
  loadSubtitles(url, videoId)
}

async function loadSubtitles(url, videoId) {
  try {
    // Re-fetch in json3 format, strip any translation override
    url.searchParams.delete('tlang')
    url.searchParams.set('fmt', 'json3')

    const res = await fetch(url.href)
    if (!res.ok) return
    const json = await res.json()
    const events = json.events
    if (!Array.isArray(events)) return

    subtitles = []
    for (const ev of events) {
      if (!ev.segs) continue
      const text = ev.segs.map(s => s.utf8 ?? '').join('').replace(/\n/g, ' ').trim()
      if (!text) continue
      subtitles.push({
        start: ev.tStartMs,
        end: ev.tStartMs + (ev.dDurationMs ?? 0),
        text,
        translation: null,
        pending: false
      })
    }

    if (!subtitles.length) return

    showYtStartingHint()

    // Pre-translate the first 90 seconds
    preTranslate(0, 90000)
    attachTimeUpdate()
  } catch (err) {
    // silent
  }
}

// ── Native CC control ─────────────────────────────────────────────────────────

function hideNativeCC() {
  const el = document.querySelector('#ytp-caption-window-container')
  if (el) el.style.visibility = 'hidden'
}

function restoreNativeCC() {
  const el = document.querySelector('#ytp-caption-window-container')
  if (el) el.style.visibility = ''
}

function applyMode() {
  if (ytMode === 'off') {
    if (paperEl) paperEl.style.display = 'none'
    restoreNativeCC()
  } else {
    hideNativeCC()
    // re-render current subtitle with new mode
    const nowMs = videoEl ? videoEl.currentTime * 1000 : 0
    const idx = _findActiveSubIdx(nowMs)
    renderSubtitle(idx !== -1 ? subtitles[idx] : null)
  }
  updateBtnStyle()
}

// ── Translation ───────────────────────────────────────────────────────────────

// Subtitles are sorted by start time, so we can binary-search instead of scanning all of them
// on every onTimeUpdate (which fires ~4Hz). For long videos with hundreds of subs this matters.
function _findSubStartIdx(targetMs) {
  // Returns smallest idx where subtitles[idx].start >= targetMs (or subtitles.length if none).
  let lo = 0, hi = subtitles.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (subtitles[mid].start < targetMs) lo = mid + 1
    else hi = mid
  }
  return lo
}

function _findActiveSubIdx(nowMs) {
  // Largest idx where subtitles[idx].start <= nowMs, then verify end >= nowMs.
  let lo = 0, hi = subtitles.length - 1, found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (subtitles[mid].start <= nowMs) { found = mid; lo = mid + 1 }
    else hi = mid - 1
  }
  if (found === -1) return -1
  return nowMs <= subtitles[found].end ? found : -1
}

function preTranslate(fromMs, toMs) {
  for (let i = _findSubStartIdx(fromMs); i < subtitles.length; i++) {
    const sub = subtitles[i]
    if (sub.start > toMs) break
    if (sub.translation !== null || sub.pending) continue
    translateSub(sub)
  }
}

function translateSub(sub) {
  sub.pending = true
  chrome.runtime.sendMessage(
    { type: 'TRANSLATE', id: 'yt-' + sub.start, text: sub.text, fromLang: 'auto', toLang: targetLang },
    (res) => {
      sub.pending = false
      if (res?.ok) sub.translation = res.translation
    }
  )
}

// ── Playback sync ─────────────────────────────────────────────────────────────

function attachTimeUpdate() {
  videoEl = document.querySelector('#container video') || document.querySelector('video')
  if (!videoEl || timeUpdateBound) return
  timeUpdateBound = true
  videoEl.addEventListener('timeupdate', onTimeUpdate)
  ensureOverlay()
  if (ytMode !== 'off') hideNativeCC()
}

let lastSubIdx = -1
function onTimeUpdate() {
  if (ytMode === 'off') return
  const nowMs = videoEl.currentTime * 1000
  const idx = _findActiveSubIdx(nowMs)

  if (idx !== lastSubIdx) {
    lastSubIdx = idx
    const sub = idx !== -1 ? subtitles[idx] : null
    renderSubtitle(sub)
  }

  // Pre-translate 90s window ahead of current position
  preTranslate(nowMs, nowMs + 90000)
}

// ── Overlay ───────────────────────────────────────────────────────────────────

function ensureOverlay() {
  if (overlayEl) return
  const container = videoEl?.parentElement?.parentElement
  if (!container) return

  overlayEl = document.createElement('div')
  overlayEl.className = 'bt-yt-overlay'
  Object.assign(overlayEl.style, {
    position: 'absolute', inset: '0', pointerEvents: 'none',
    zIndex: '2147483646', display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
  })

  paperEl = document.createElement('div')
  paperEl.className = 'bt-yt-paper'
  Object.assign(paperEl.style, {
    marginBottom: '8%', textAlign: 'center', maxWidth: '80%',
    fontFamily: 'system-ui, sans-serif', display: 'none',
    lineHeight: '1.5', textShadow: '0 0 4px #000, 0 0 4px #000'
  })

  overlayEl.appendChild(paperEl)
  container.style.position = 'relative'
  container.appendChild(overlayEl)
}

function renderSubtitle(sub) {
  if (!paperEl) return
  if (!sub || ytMode === 'off') { paperEl.style.display = 'none'; return }

  const children = []

  if (ytMode === 'bilingual') {
    const origEl = document.createElement('p')
    origEl.style.cssText = 'margin:0; color:#fff; font-size:26px'
    origEl.textContent = sub.text
    children.push(origEl)
  }

  const transEl = document.createElement('p')
  transEl.style.cssText = 'margin:2px 0 0; color:#ffe; font-size:26px'
  transEl.textContent = sub.translation ?? '…'
  children.push(transEl)

  paperEl.replaceChildren(...children)
  paperEl.style.display = 'block'
}

function updateBtnStyle() {
  if (!playerBtn) return
  playerBtn.textContent = YT_MODE_LABEL[ytMode]
  playerBtn.title = { bilingual: '双语字幕（点击切换）', 'translation-only': '仅译文（点击切换）', off: '字幕关闭（点击开启）' }[ytMode]
  playerBtn.style.background = ytMode === 'off' ? 'rgba(255,255,255,0.15)' : 'rgba(255,145,50,0.85)'
  playerBtn.style.opacity = ytMode === 'off' ? '0.5' : '1'
}

// ── Player button ─────────────────────────────────────────────────────────────

function _attachPlayerBtn(rightControls) {
  if (document.getElementById('bt-yt-btn')) return
  playerBtn = document.createElement('button')
  playerBtn.id = 'bt-yt-btn'
  playerBtn.style.cssText = [
    'display:inline-flex', 'align-items:center', 'justify-content:center',
    'height:28px', 'padding:0 10px', 'border-radius:14px', 'border:none',
    'font-size:12px', 'font-weight:600', 'font-family:system-ui',
    'color:#fff', 'cursor:pointer', 'white-space:nowrap',
    'transition:opacity 0.15s', 'align-self:center', 'margin:0 4px'
  ].join(';')
  playerBtn.addEventListener('click', () => {
    ytMode = YT_MODES[(YT_MODES.indexOf(ytMode) + 1) % YT_MODES.length]
    applyMode()
  })
  updateBtnStyle()
  rightControls.prepend(playerBtn)
}

// Use a MutationObserver instead of setInterval so embeds and pages without a player
// (e.g. /feed/* listing views) don't burn cycles polling forever.
function waitForControls() {
  const existing = document.querySelector('.ytp-right-controls')
  if (existing) { _attachPlayerBtn(existing); return }

  const mo = new MutationObserver(() => {
    const rc = document.querySelector('.ytp-right-controls')
    if (!rc) return
    mo.disconnect()
    _attachPlayerBtn(rc)
  })
  mo.observe(document.body, { childList: true, subtree: true })

  // Safety net: stop watching after 30s on pages that genuinely have no player.
  setTimeout(() => mo.disconnect(), 30000)
}

// ── YouTube page translation (comments, descriptions, titles) ─────────────────


// Unset -webkit-line-clamp on el and up to 2 ancestors so full text is visible
function expandClamp(el) {
  let node = el
  for (let i = 0; i < 3 && node && node !== document.body; i++, node = node.parentElement) {
    node.style.setProperty('-webkit-line-clamp', 'unset', 'important')
    node.style.setProperty('max-height', 'none', 'important')
    node.style.setProperty('overflow', 'visible', 'important')
  }
}

// Inject translation and apply a YouTube-appropriate text color (avoids inheriting black on dark themes)
function injectYtTranslation(el, text) {
  injectTranslationSibling(el, text)
  const sib = el.nextElementSibling
  if (sib?.dataset.btSiblingFor) sib.style.color = 'var(--yt-spec-text-secondary, #aaa)'
}

async function translateYtEl(el) {
  if (el.dataset.btTranslated) return
  el.dataset.btTranslated = 'pending'
  expandClamp(el)
  // textContent works here because getTranslatableElements already verified this
  // is a leaf block container with real text (possibly via shadow DOM traversal)
  const text = el.textContent.trim() || el.shadowRoot?.textContent?.trim() || ''
  if (!text) { delete el.dataset.btTranslated; return }

  // Chrome Translator API — only in chrome-local mode
  if (translateMode === 'chrome-local') {
    try {
      if (typeof chromeTranslatorAvailable !== 'undefined' && await chromeTranslatorAvailable('auto', targetLang)) {
        const [translation] = await chromeTranslatorTranslate([text], 'auto', targetLang)
        injectYtTranslation(el, translation)
        return
      }
    } catch {}
  }

  // Fall back to service worker
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: 'TRANSLATE', id: 'ytp-' + crypto.randomUUID(), text, fromLang: 'auto', toLang: targetLang },
        (res) => {
          if (chrome.runtime.lastError) { delete el.dataset.btTranslated; resolve(); return }
          if (res?.ok) injectYtTranslation(el, res.translation)
          else delete el.dataset.btTranslated
          resolve()
        }
      )
    } catch { resolve() }
  })
}

let _ytPending = 0
function ytBallStart() { window.btBall?.setState('translating') }
function ytBallDone()  { if (_ytPending === 0) window.btBall?.setState('done') }

function translateYtElTracked(el) {
  _ytPending++
  ytBallStart()
  translateYtEl(el).finally(() => {
    _ytPending--
    ytBallDone()
  })
}

// Directly scan known comment text elements — more reliable than the generic walker
// because yt-attributed-string's shadow DOM structure confuses findBlockContainer.
function scanYtComments(root = document) {
  root.querySelectorAll('yt-attributed-string#content-text').forEach(el => {
    if (!el.dataset.btTranslated) translateYtElTracked(el)
  })
}

// Video description area — ytd-text-inline-expander is often blocked by hasAdSignal (ytd- prefix)
// so we scan it directly like comments.
function scanYtDescription(root = document) {
  root.querySelectorAll('ytd-text-inline-expander, ytd-video-secondary-info-renderer').forEach(el => {
    // Only translate if it has meaningful text content (not just links/buttons)
    const text = el.textContent?.trim() || ''
    if (text.length < 20) return
    if (isMostlyCJK(text)) return
    if (!el.dataset.btTranslated) translateYtElTracked(el)
  })
}

// Titles inside #movie_player and role="complementary" are blocked by the generic walker.
// Handle them directly: .ytp-title-text is the ONLY visible title in Shorts; .ytp-ce-video-title
// are end-card recommendation titles.
function scanYtPlayerTitles() {
  document.querySelectorAll('.ytp-title-text, .ytp-ce-video-title').forEach(el => {
    if (el.dataset.btTranslated) return
    const text = el.textContent.trim()
    if (text.length < 20) return
    if (isMostlyCJK(text)) return
    translateYtElTracked(el)
  })
}

function scanYtPage() {
  const root = document.querySelector('ytd-page-manager') || document.body
  getTranslatableElements(root).forEach(translateYtElTracked)
  scanYtComments()
  scanYtDescription()
  scanYtPlayerTitles()
}

const _scheduleYtFlush = typeof requestIdleCallback === 'function'
  ? (cb) => requestIdleCallback(cb, { timeout: 300 })
  : (cb) => setTimeout(cb, 150)
let _ytMoPending = []
let _ytMoNeedsPlayer = false
let _ytMoNeedsDesc = false
let _ytMoScheduled = false

function _flushYtMo() {
  _ytMoScheduled = false
  const nodes = _ytMoPending; _ytMoPending = []
  const doPlayer = _ytMoNeedsPlayer; _ytMoNeedsPlayer = false
  const doDesc = _ytMoNeedsDesc; _ytMoNeedsDesc = false
  for (const node of nodes) {
    if (!node.isConnected) continue
    if (node.tagName === 'YTD-COMMENT-THREAD-RENDERER' || node.tagName === 'YTD-COMMENT-VIEW-MODEL') {
      scanYtComments(node)
    } else {
      node.querySelectorAll?.('yt-attributed-string#content-text').forEach(el => {
        if (!el.dataset.btTranslated) translateYtElTracked(el)
      })
    }
    if (node.tagName === 'YTD-TEXT-INLINE-EXPANDER' || node.tagName === 'YTD-VIDEO-SECONDARY-INFO-RENDERER') {
      scanYtDescription(node)
    }
    getTranslatableElements(node).forEach(translateYtElTracked)
  }
  if (doPlayer) scanYtPlayerTitles()
  if (doDesc) scanYtDescription()
}

function initPageTranslation() {
  // Initial scan — try twice to handle slow-loading pages
  setTimeout(scanYtPage, 800)
  setTimeout(scanYtPage, 2500)

  const mo = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue
        if (node.dataset.btSiblingFor) continue
        _ytMoPending.push(node)
        if (!_ytMoNeedsPlayer && (
          node.classList?.contains('ytp-title-text') ||
          node.classList?.contains('ytp-ce-video-title') ||
          node.querySelector?.('.ytp-title-text, .ytp-ce-video-title')
        )) {
          _ytMoNeedsPlayer = true
        }
        if (!_ytMoNeedsDesc && (
          node.tagName === 'YTD-TEXT-INLINE-EXPANDER' ||
          node.querySelector?.('ytd-text-inline-expander')
        )) {
          _ytMoNeedsDesc = true
        }
      }
    }
    if (!_ytMoScheduled && _ytMoPending.length > 0) {
      _ytMoScheduled = true
      _scheduleYtFlush(_flushYtMo)
    }
  })
  mo.observe(document.body, { childList: true, subtree: true })
}

function showYtStartingHint() {
  if (ytMode === 'off') return
  document.getElementById('bt-yt-hint')?.remove()

  const hint = document.createElement('div')
  hint.id = 'bt-yt-hint'
  hint.style.cssText = [
    'position:fixed', 'bottom:88px', 'left:50%', 'transform:translateX(-50%)',
    'z-index:2147483647', 'background:rgba(0,0,0,0.72)', 'color:#fff',
    'padding:7px 18px', 'border-radius:999px',
    'font-size:13px', 'font-family:system-ui', 'letter-spacing:0.01em',
    'pointer-events:none', 'white-space:nowrap',
    'opacity:0', 'transition:opacity 0.25s'
  ].join(';')
  hint.textContent = chrome.i18n.getMessage('ytStartingHint')
  document.body.appendChild(hint)

  // Fade in
  requestAnimationFrame(() => { hint.style.opacity = '1' })

  // Fade out and remove
  setTimeout(() => {
    hint.style.opacity = '0'
    setTimeout(() => hint.remove(), 280)
  }, 2800)
}

chrome.storage.local.get('siteSettings', ({ siteSettings = {} }) => {
  if (siteSettings[location.hostname] === 'never') return
  init()
  initPageTranslation()
})
