const {
  mapToTargetLang,
  mapToUiLang,
  SUPPORTED_TARGET,
  SUPPORTED_UI_LOCALE
} = require('../shared/lang-map.js')

describe('mapToTargetLang', () => {
  test('Chinese variants', () => {
    expect(mapToTargetLang('zh-CN')).toBe('zh')
    expect(mapToTargetLang('zh-Hans')).toBe('zh')
    expect(mapToTargetLang('zh')).toBe('zh')
    expect(mapToTargetLang('zh-TW')).toBe('zh-TW')
    expect(mapToTargetLang('zh-Hant')).toBe('zh-TW')
  })

  test('Portuguese variants all map to pt-BR', () => {
    expect(mapToTargetLang('pt-BR')).toBe('pt-BR')
    expect(mapToTargetLang('pt-PT')).toBe('pt-BR')
    expect(mapToTargetLang('pt')).toBe('pt-BR')
  })

  test('supported base languages via primary subtag', () => {
    expect(mapToTargetLang('en-US')).toBe('en')
    expect(mapToTargetLang('en')).toBe('en')
    expect(mapToTargetLang('de')).toBe('de')
    expect(mapToTargetLang('fr-FR')).toBe('fr')
    expect(mapToTargetLang('ja')).toBe('ja')
    expect(mapToTargetLang('ko')).toBe('ko')
    expect(mapToTargetLang('ru')).toBe('ru')
    expect(mapToTargetLang('ar')).toBe('ar')
    expect(mapToTargetLang('it')).toBe('it')
    expect(mapToTargetLang('es-419')).toBe('es')
  })

  test('unsupported / empty / nullish fall back to en', () => {
    expect(mapToTargetLang('th')).toBe('en')
    expect(mapToTargetLang('')).toBe('en')
    expect(mapToTargetLang(undefined)).toBe('en')
    expect(mapToTargetLang(null)).toBe('en')
  })

  test('every output is a valid translation target', () => {
    const inputs = ['zh-CN', 'zh-TW', 'pt-PT', 'en-US', 'th', '', undefined, null]
    inputs.forEach((i) => {
      expect(SUPPORTED_TARGET).toContain(mapToTargetLang(i))
    })
  })

  test('deterministic — same input twice gives same output', () => {
    expect(mapToTargetLang('es-419')).toBe(mapToTargetLang('es-419'))
    expect(mapToTargetLang('zh-Hant')).toBe(mapToTargetLang('zh-Hant'))
  })
})

describe('mapToUiLang', () => {
  test('Chinese variants map to locale-dir names', () => {
    expect(mapToUiLang('zh-CN')).toBe('zh_CN')
    expect(mapToUiLang('zh-TW')).toBe('zh_TW')
    expect(mapToUiLang('zh-Hant')).toBe('zh_TW')
  })

  test('Portuguese variants map to pt_BR locale dir', () => {
    expect(mapToUiLang('pt-BR')).toBe('pt_BR')
    expect(mapToUiLang('pt')).toBe('pt_BR')
  })

  test('supported base languages return same code', () => {
    expect(mapToUiLang('en-US')).toBe('en')
    expect(mapToUiLang('de')).toBe('de')
    expect(mapToUiLang('ja')).toBe('ja')
  })

  test('unsupported / nullish fall back to en', () => {
    expect(mapToUiLang('th')).toBe('en')
    expect(mapToUiLang(undefined)).toBe('en')
  })

  test('every output is a valid UI locale dir', () => {
    const inputs = ['zh-CN', 'zh-TW', 'pt', 'en-US', 'th', undefined]
    inputs.forEach((i) => {
      expect(SUPPORTED_UI_LOCALE).toContain(mapToUiLang(i))
    })
  })

  test('deterministic — same input twice gives same output', () => {
    expect(mapToUiLang('zh-Hant')).toBe(mapToUiLang('zh-Hant'))
    expect(mapToUiLang('pt-PT')).toBe(mapToUiLang('pt-PT'))
  })
})
