const { resolveTargetLang } = require('../shared/config.js')

describe('resolveTargetLang', () => {
  test('explicit stored choice wins, browserLang ignored', () => {
    expect(resolveTargetLang({ targetLang: 'fr' }, 'de-DE')).toBe('fr')
  })

  test('no stored value derives target from browser language', () => {
    expect(resolveTargetLang({}, 'de-DE')).toBe('de')
  })

  test('unsupported browser language falls back to en', () => {
    expect(resolveTargetLang({}, 'th')).toBe('en')
  })

  test('undefined stored derives from browser language', () => {
    expect(resolveTargetLang(undefined, 'zh-TW')).toBe('zh-TW')
  })

  test('empty string is NOT an explicit choice → derive', () => {
    expect(resolveTargetLang({ targetLang: '' }, 'ja')).toBe('ja')
  })
})
