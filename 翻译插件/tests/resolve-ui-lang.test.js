const { resolveUiLang } = require('../shared/config.js')

describe('resolveUiLang', () => {
  test('explicit stored choice wins, browserLang ignored', () => {
    expect(resolveUiLang({ uiLang: 'fr' }, 'de-DE')).toBe('fr')
  })

  test('no stored value derives ui locale from browser language', () => {
    expect(resolveUiLang({}, 'de-DE')).toBe('de')
  })

  test('zh-TW maps to zh_TW locale dir', () => {
    expect(resolveUiLang({}, 'zh-TW')).toBe('zh_TW')
  })

  test('unsupported browser language falls back to en', () => {
    expect(resolveUiLang({}, 'th')).toBe('en')
  })

  test('undefined stored derives from browser language', () => {
    expect(resolveUiLang(undefined, 'pt-BR')).toBe('pt_BR')
  })

  test('empty string is NOT an explicit choice → derive', () => {
    expect(resolveUiLang({ uiLang: '' }, 'ja')).toBe('ja')
  })
})
