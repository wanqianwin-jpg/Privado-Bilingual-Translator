// content/gmail.js — Gmail-specific translation.
// Inbox: translates subject+snippet cells in each row.
// Email view: translates the email body when an email is opened.
window.BT_IS_GMAIL = true

let targetLang = 'zh'
let translateMode = 'machine'
let _currentHash = ''
let _pending = 0
let _bodyObserver = null
let _inboxObserver = null

function ballStart() { window.btBall?.setState('translating') }
function ballDone()  { if (_pending === 0) window.btBall?.setState('done') }

// ── Element translation ───────────────────────────────────────────────────────

async function translateGmailEl(el) {
  if (el.dataset.btTranslated) return
  el.dataset.btTranslated = 'pending'
  const text = el.textContent.trim()
  if (!text) { delete el.dataset.btTranslated; return }

  if (translateMode === 'chrome-local') {
    try {
      if (typeof chromeTranslatorAvailable !== 'undefined' && await chromeTranslatorAvailable('auto', targetLang)) {
        const [translation] = await chromeTranslatorTranslate([text], 'auto', targetLang)
        injectTranslationSibling(el, translation)
        return
      }
    } catch {}
  }

  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: 'TRANSLATE', id: 'gml-' + crypto.randomUUID(), text, fromLang: 'auto', toLang: targetLang },
        (res) => {
          if (chrome.runtime.lastError) { delete el.dataset.btTranslated; resolve(); return }
          if (res?.ok) injectTranslationSibling(el, res.translation)
          else delete el.dataset.btTranslated
          resolve()
        }
      )
    } catch { resolve() }
  })
}

function translateGmailElTracked(el) {
  _pending++
  ballStart()
  translateGmailEl(el).finally(() => {
    _pending--
    ballDone()
  })
}

// ── Navigation detection ──────────────────────────────────────────────────────

function isEmailOpen() {
  return /\/([\w-]{8,})$/.test(location.hash)
}

// ── Inbox scanning ────────────────────────────────────────────────────────────

// Gmail inbox rows: tr.zA (unread), tr.yO (read)
// Subject+snippet cell: .y6 — scanning only this cell avoids touching
// sender name, date, checkbox columns and prevents layout chaos.
const INBOX_ROW_SEL = 'tr.zA, tr.yO'

function scanInboxRow(row) {
  if (row.dataset.btGmailScanned) return
  row.dataset.btGmailScanned = 'true'
  const cell = row.querySelector('.y6')
  if (!cell) return
  getTranslatableElements(cell).forEach(translateGmailElTracked)
}

function scanInbox() {
  if (isEmailOpen()) return
  document.querySelectorAll(INBOX_ROW_SEL).forEach(scanInboxRow)
}

function startInboxObserver() {
  if (_inboxObserver) return
  _inboxObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue
        // New inbox row added directly
        if (node.matches?.(INBOX_ROW_SEL)) { scanInboxRow(node); continue }
        // Batch of rows added inside a tbody
        node.querySelectorAll?.(INBOX_ROW_SEL).forEach(scanInboxRow)
      }
    }
  })
  _inboxObserver.observe(document.body, { childList: true, subtree: true })
}

function stopInboxObserver() {
  if (_inboxObserver) { _inboxObserver.disconnect(); _inboxObserver = null }
}

// ── Email body scanning ───────────────────────────────────────────────────────

const EMAIL_BODY_SELECTORS = ['.a3s.aiL', '.a3s', '.ii.gt .a3s']

function getEmailBodies() {
  for (const sel of EMAIL_BODY_SELECTORS) {
    const els = document.querySelectorAll(sel)
    if (els.length) return Array.from(els)
  }
  return []
}

function scanEmailBody() {
  if (!isEmailOpen()) return
  const bodies = getEmailBodies()
  for (const body of bodies) {
    if (body.dataset.btGmailScanned) continue
    body.dataset.btGmailScanned = 'true'
    getTranslatableElements(body).forEach(translateGmailElTracked)
  }
}

function waitForEmailBody() {
  if (_bodyObserver) { _bodyObserver.disconnect(); _bodyObserver = null }
  if (!isEmailOpen()) return

  setTimeout(scanEmailBody, 300)
  setTimeout(scanEmailBody, 1200)

  let checks = 0
  _bodyObserver = new MutationObserver(() => {
    if (getEmailBodies().length) {
      _bodyObserver.disconnect()
      _bodyObserver = null
      setTimeout(scanEmailBody, 200)
      return
    }
    if (++checks > 60) { _bodyObserver.disconnect(); _bodyObserver = null }
  })
  _bodyObserver.observe(document.body, { childList: true, subtree: true })
}

// ── SPA navigation ────────────────────────────────────────────────────────────

function onNavigate() {
  const hash = location.hash
  if (hash === _currentHash) return
  _currentHash = hash
  _pending = 0

  if (isEmailOpen()) {
    stopInboxObserver()
    waitForEmailBody()
  } else {
    // Returned to inbox view
    setTimeout(scanInbox, 300)
    startInboxObserver()
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function initPageTranslation() {
  _currentHash = location.hash
  if (isEmailOpen()) {
    waitForEmailBody()
  } else {
    setTimeout(scanInbox, 500)
    startInboxObserver()
  }
  window.addEventListener('hashchange', onNavigate)
}

chrome.storage.local.get(['siteSettings', 'targetLang', ...TRANSLATE_MODE_KEYS], (data) => {
  const { siteSettings = {} } = data
  if (siteSettings[location.hostname] === 'never') return
  targetLang = resolveTargetLang(data)
  if (!('targetLang' in data)) chrome.storage.local.set({ targetLang })
  translateMode = resolveTranslateMode(data)
  initPageTranslation()
})
