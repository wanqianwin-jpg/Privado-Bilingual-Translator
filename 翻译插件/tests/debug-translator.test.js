// Unit tests for shared/debug-translator.js — the dev-only, default-OFF fake
// Translator harness. The critical test is the production-safety invariant:
// when the storage key is ABSENT, self.Translator must be byte-identical
// before/after and NO fake may be installed.

describe('makeFakeTranslator', () => {
  const { makeFakeTranslator } = require('../shared/debug-translator.js')

  test('availability() returns the configured state', async () => {
    const t = makeFakeTranslator({ availability: 'downloadable' })
    await expect(t.availability({ sourceLanguage: 'en', targetLanguage: 'zh' }))
      .resolves.toBe('downloadable')
  })

  test('availability() maps unknown → "unavailable"', async () => {
    const t = makeFakeTranslator({ availability: 'something-weird' })
    await expect(t.availability({ sourceLanguage: 'en', targetLanguage: 'zh' }))
      .resolves.toBe('unavailable')
  })

  test('create() rejects when failCreate is set', async () => {
    const t = makeFakeTranslator({ availability: 'downloadable', failCreate: true })
    await expect(t.create({ sourceLanguage: 'en', targetLanguage: 'zh' }))
      .rejects.toThrow('FAKE: download failed')
  })

  test('create() for a download state emits monotonic [0,1] progress ending at 1', async () => {
    const t = makeFakeTranslator({ availability: 'downloadable', downloadMs: 100 })
    const seen = []
    const inst = await t.create({
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      monitor: (m) => m.addEventListener('downloadprogress', (e) => seen.push(e.loaded))
    })
    expect(seen.length).toBeGreaterThan(0)
    for (let i = 0; i < seen.length; i++) {
      expect(seen[i]).toBeGreaterThanOrEqual(0)
      expect(seen[i]).toBeLessThanOrEqual(1)
      if (i > 0) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1])
    }
    expect(seen[seen.length - 1]).toBe(1)
    await expect(inst.translate('hello')).resolves.toEqual(expect.stringContaining('hello'))
  })

  test('availability:"available" resolves create immediately with zero progress events', async () => {
    const t = makeFakeTranslator({ availability: 'available' })
    const seen = []
    const inst = await t.create({
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      monitor: (m) => m.addEventListener('downloadprogress', (e) => seen.push(e.loaded))
    })
    expect(seen).toEqual([])
    await expect(inst.translate('x')).resolves.toEqual(expect.stringContaining('x'))
  })
})

describe('maybeInstallFakeTranslator production-safety', () => {
  let storageValue

  beforeEach(() => {
    jest.resetModules()
    storageValue = {}
    global.chrome = {
      storage: {
        local: {
          get: jest.fn(async () => storageValue)
        }
      }
    }
  })

  afterEach(() => {
    delete global.chrome
    delete global.Translator
  })

  test('key ABSENT → self.Translator byte-identical, no fake installed (undefined stays undefined)', async () => {
    // self.Translator is undefined here.
    const { maybeInstallFakeTranslator } = require('../shared/debug-translator.js')
    const before = self.Translator
    expect(before).toBeUndefined()
    storageValue = {}
    await maybeInstallFakeTranslator()
    expect(self.Translator).toBe(before)
    expect('Translator' in self).toBe(false)
  })

  test('key ABSENT with a pre-existing real Translator → same object reference preserved', async () => {
    const realTranslator = { availability: async () => 'available', __real: true }
    self.Translator = realTranslator
    const { maybeInstallFakeTranslator } = require('../shared/debug-translator.js')
    const before = self.Translator
    storageValue = {}
    await maybeInstallFakeTranslator()
    expect(self.Translator).toBe(before)
    expect(self.Translator).toBe(realTranslator)
    delete self.Translator
  })

  test('enabled downloadable → fake installed; then OFF → restored to original', async () => {
    const realTranslator = { availability: async () => 'available', __real: true }
    self.Translator = realTranslator
    const { maybeInstallFakeTranslator } = require('../shared/debug-translator.js')

    // Enable: fake downloadable
    storageValue = { __btDebugTranslator: { enabled: true, availability: 'downloadable', downloadMs: 600 } }
    await maybeInstallFakeTranslator()
    expect(self.Translator).not.toBe(realTranslator)
    await expect(self.Translator.availability({ sourceLanguage: 'en', targetLanguage: 'zh' }))
      .resolves.toBe('downloadable')

    // no-api: Translator removed entirely
    storageValue = { __btDebugTranslator: { enabled: true, availability: 'no-api' } }
    await maybeInstallFakeTranslator()
    expect('Translator' in self).toBe(false)

    // Turn OFF: restored to the original real reference
    storageValue = {}
    await maybeInstallFakeTranslator()
    expect(self.Translator).toBe(realTranslator)
    delete self.Translator
  })

  test('enabled:false is treated as OFF (no install)', async () => {
    const { maybeInstallFakeTranslator } = require('../shared/debug-translator.js')
    const before = self.Translator
    storageValue = { __btDebugTranslator: { enabled: false, availability: 'downloadable' } }
    await maybeInstallFakeTranslator()
    expect(self.Translator).toBe(before)
    expect('Translator' in self).toBe(false)
  })
})
