// Unit tests for chromeTranslatorDownload's Port-client promise logic.
// Drives a fake chrome.runtime port whose onMessage/onDisconnect listeners
// we capture and fire manually — no real chrome.runtime / Translator needed.

function makeFakePort() {
  const port = {
    name: 'bt-chrome-dl',
    posted: [],
    disconnected: false,
    _msgCb: null,
    _disCb: null,
    onMessage: { addListener: (cb) => { port._msgCb = cb } },
    onDisconnect: { addListener: (cb) => { port._disCb = cb } },
    postMessage: (m) => port.posted.push(m),
    disconnect: () => { port.disconnected = true }
  }
  return port
}

describe('chromeTranslatorDownload (Port client)', () => {
  let port
  let lastError

  beforeEach(() => {
    jest.resetModules()
    port = makeFakePort()
    lastError = undefined
    global.chrome = {
      runtime: {
        connect: jest.fn(() => port),
        get lastError() { return lastError }
      }
    }
  })

  afterEach(() => { delete global.chrome })

  test('connects with the bt-chrome-dl port name and sends fromLang/toLang', () => {
    const { chromeTranslatorDownload } = require('../content/chrome-translator.js')
    chromeTranslatorDownload('auto', 'zh', () => {})
    expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'bt-chrome-dl' })
    expect(port.posted).toEqual([{ fromLang: 'auto', toLang: 'zh' }])
  })

  test('streams pct via onProgress without settling', () => {
    const { chromeTranslatorDownload } = require('../content/chrome-translator.js')
    const seen = []
    chromeTranslatorDownload('auto', 'zh', (p) => seen.push(p))
    port._msgCb({ pct: 10 })
    port._msgCb({ pct: 80 })
    expect(seen).toEqual([10, 80])
    expect(port.disconnected).toBe(false)
  })

  test('resolves and disconnects on {done:true}', async () => {
    const { chromeTranslatorDownload } = require('../content/chrome-translator.js')
    const p = chromeTranslatorDownload('auto', 'zh', () => {})
    port._msgCb({ done: true })
    await expect(p).resolves.toBeUndefined()
    expect(port.disconnected).toBe(true)
  })

  test('rejects with the error message on {error}', async () => {
    const { chromeTranslatorDownload } = require('../content/chrome-translator.js')
    const p = chromeTranslatorDownload('auto', 'zh', () => {})
    port._msgCb({ error: 'no-api' })
    await expect(p).rejects.toThrow('no-api')
    expect(port.disconnected).toBe(true)
  })

  test('rejects on premature disconnect using lastError message', async () => {
    const { chromeTranslatorDownload } = require('../content/chrome-translator.js')
    const p = chromeTranslatorDownload('auto', 'zh', () => {})
    lastError = { message: 'SW died' }
    port._disCb()
    await expect(p).rejects.toThrow('SW died')
  })

  test('does not re-settle: disconnect after done is a no-op', async () => {
    const { chromeTranslatorDownload } = require('../content/chrome-translator.js')
    const p = chromeTranslatorDownload('auto', 'zh', () => {})
    port._msgCb({ done: true })
    await expect(p).resolves.toBeUndefined()
    // Late disconnect must not throw / reject an already-resolved promise.
    expect(() => port._disCb()).not.toThrow()
  })
})
