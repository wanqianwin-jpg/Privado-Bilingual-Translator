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

  test('zh regional Traditional variants (HK/MO/Hant-*) map to zh-TW', () => {
    expect(mapToTargetLang('zh-Hant-HK')).toBe('zh-TW')
    expect(mapToTargetLang('zh-hant-hk')).toBe('zh-TW')
    expect(mapToTargetLang('zh-Hant-MO')).toBe('zh-TW')
    expect(mapToTargetLang('zh-HK')).toBe('zh-TW')
    expect(mapToTargetLang('zh-MO')).toBe('zh-TW')
    expect(mapToTargetLang('zh-Hant-TW')).toBe('zh-TW')
  })

  test('zh regional Simplified variants (SG/Hans-*) map to zh', () => {
    expect(mapToTargetLang('zh-SG')).toBe('zh')
    expect(mapToTargetLang('zh-Hans-CN')).toBe('zh')
    expect(mapToTargetLang('zh-Hans-SG')).toBe('zh')
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

  test('zh regional Traditional variants map to zh_TW locale dir', () => {
    expect(mapToUiLang('zh-Hant-HK')).toBe('zh_TW')
    expect(mapToUiLang('zh-hant-hk')).toBe('zh_TW')
    expect(mapToUiLang('zh-Hant-MO')).toBe('zh_TW')
    expect(mapToUiLang('zh-HK')).toBe('zh_TW')
    expect(mapToUiLang('zh-MO')).toBe('zh_TW')
    expect(mapToUiLang('zh-Hant-TW')).toBe('zh_TW')
  })

  test('zh regional Simplified variants map to zh_CN locale dir', () => {
    expect(mapToUiLang('zh-SG')).toBe('zh_CN')
    expect(mapToUiLang('zh-Hans-CN')).toBe('zh_CN')
    expect(mapToUiLang('zh-Hans-SG')).toBe('zh_CN')
    expect(mapToUiLang('zh-CN')).toBe('zh_CN')
    expect(mapToUiLang('zh-Hans')).toBe('zh_CN')
    expect(mapToUiLang('zh')).toBe('zh_CN')
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
