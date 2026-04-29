const { resolveTranslateMode, TRANSLATE_MODE_KEYS } = require('../shared/config.js')

describe('resolveTranslateMode', () => {
  test('returns stored translateMode when valid', () => {
    expect(resolveTranslateMode({ translateMode: 'api' })).toBe('api')
    expect(resolveTranslateMode({ translateMode: 'chrome-local' })).toBe('chrome-local')
    expect(resolveTranslateMode({ translateMode: 'apple-npu' })).toBe('apple-npu')
    expect(resolveTranslateMode({ translateMode: 'machine' })).toBe('machine')
  })

  test("legacy 'privacy' value migrates to 'chrome-local'", () => {
    expect(resolveTranslateMode({ translateMode: 'privacy' })).toBe('chrome-local')
  })

  test('legacy apiEnabled=true migrates to api when translateMode missing', () => {
    expect(resolveTranslateMode({ apiEnabled: true })).toBe('api')
  })

  test('legacy apiEnabled=false migrates to machine when translateMode missing', () => {
    expect(resolveTranslateMode({ apiEnabled: false })).toBe('machine')
  })

  test('translateMode wins over legacy apiEnabled', () => {
    expect(resolveTranslateMode({ translateMode: 'chrome-local', apiEnabled: true })).toBe('chrome-local')
  })

  test('empty object falls back to machine', () => {
    expect(resolveTranslateMode({})).toBe('machine')
  })

  test('undefined input falls back to machine', () => {
    expect(resolveTranslateMode(undefined)).toBe('machine')
  })
})

describe('TRANSLATE_MODE_KEYS', () => {
  test('exposes the storage keys consumers should request', () => {
    expect(TRANSLATE_MODE_KEYS).toContain('translateMode')
    expect(TRANSLATE_MODE_KEYS).toContain('apiEnabled')
  })
})
