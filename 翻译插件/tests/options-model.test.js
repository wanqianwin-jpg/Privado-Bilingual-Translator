// Unit tests for the pure model-section helpers in options/options.js.
// availabilityToUiState() maps a Translator.availability() result (plus the
// source===target and no-Translator environment facts) to the UI state the
// Options page renders. clampPct() clamps a 0..1 fraction to 0..100.

const { availabilityToUiState, clampPct } = require('../options/options.js')

describe('availabilityToUiState', () => {
  test('source===target (English) → no model needed, no button', () => {
    expect(availabilityToUiState('available', 'en', true)).toEqual({
      statusKey: 'optionsModelNoneNeeded', isError: false, showButton: false, buttonEnabled: false
    })
    // even with no Translator the en short-circuit wins (no crash path)
    expect(availabilityToUiState('unavailable', 'en', false).statusKey).toBe('optionsModelNoneNeeded')
  })

  test('no Translator API → online-fallback message, no button', () => {
    expect(availabilityToUiState('downloadable', 'zh', false)).toEqual({
      statusKey: 'optionsModelNoApi', isError: true, showButton: false, buttonEnabled: false
    })
  })

  test("'available' → ready, no button", () => {
    expect(availabilityToUiState('available', 'zh', true)).toEqual({
      statusKey: 'optionsModelReady', isError: false, showButton: false, buttonEnabled: false
    })
  })

  test("'downloadable' → needs download, enabled button", () => {
    expect(availabilityToUiState('downloadable', 'zh', true)).toEqual({
      statusKey: 'optionsModelNeeded', isError: false, showButton: true, buttonEnabled: true
    })
  })

  test("legacy 'after-download' alias behaves like 'downloadable'", () => {
    expect(availabilityToUiState('after-download', 'zh', true)).toEqual({
      statusKey: 'optionsModelNeeded', isError: false, showButton: true, buttonEnabled: true
    })
  })

  test("'downloading' → downloading status, button shown but disabled", () => {
    expect(availabilityToUiState('downloading', 'zh', true)).toEqual({
      statusKey: 'statusDownloading', isError: false, showButton: true, buttonEnabled: false
    })
  })

  test("'unavailable' → unsupported message, no button", () => {
    expect(availabilityToUiState('unavailable', 'zh', true)).toEqual({
      statusKey: 'optionsModelUnsupported', isError: true, showButton: false, buttonEnabled: false
    })
  })

  test('unexpected availability value falls through to unsupported (honest, no button)', () => {
    const ui = availabilityToUiState('something-weird', 'zh', true)
    expect(ui.statusKey).toBe('optionsModelUnsupported')
    expect(ui.showButton).toBe(false)
  })
})

describe('clampPct', () => {
  test('maps 0..1 fraction to integer 0..100', () => {
    expect(clampPct(0)).toBe(0)
    expect(clampPct(0.5)).toBe(50)
    expect(clampPct(0.333)).toBe(33)
    expect(clampPct(1)).toBe(100)
  })

  test('clamps out-of-range and missing input', () => {
    expect(clampPct(undefined)).toBe(0)
    expect(clampPct(null)).toBe(0)
    expect(clampPct(-0.2)).toBe(0)
    expect(clampPct(1.5)).toBe(100)
  })
})
