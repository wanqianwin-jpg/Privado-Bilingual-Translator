const { getTranslatableElements } = require('../content/detector.js')

describe('getTranslatableElements debug-only decision trace', () => {
  test('no options: behavior unchanged — normal <p> yields one kept element', () => {
    document.body.textContent = ''
    const p = document.createElement('p')
    p.textContent = 'This is a normal English paragraph long enough to translate.'
    document.body.appendChild(p)

    const result = getTranslatableElements(document.body)
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(1)
    expect(result[0]).toBe(p)
  })

  test('with trace: nav <p> -> SKIP blacklisted-ancestor, normal <p> -> TRANSLATE', () => {
    document.body.textContent = ''

    const nav = document.createElement('nav')
    const navP = document.createElement('p')
    navP.textContent = 'NAVENTRY navigation links menu items here for the trace'
    nav.appendChild(navP)
    document.body.appendChild(nav)

    const normalP = document.createElement('p')
    normalP.textContent = 'NORMALENTRY this is a real article paragraph in English.'
    document.body.appendChild(normalP)

    const trace = []
    const result = getTranslatableElements(document.body, { trace })

    // Behavior still correct: only the normal <p> is kept
    expect(result.length).toBe(1)
    expect(result[0]).toBe(normalP)

    // Trace populated
    expect(trace.length).toBeGreaterThan(0)

    const navEntry = trace.find(e => e.text && e.text.includes('NAVENTRY'))
    expect(navEntry).toBeDefined()
    expect(navEntry.decision).toBe('SKIP')
    expect(navEntry.reason).toBe('blacklisted-ancestor')

    const normalEntry = trace.find(e => e.text && e.text.includes('NORMALENTRY'))
    expect(normalEntry).toBeDefined()
    expect(normalEntry.decision).toBe('TRANSLATE')
  })

  test('with trace = null (explicit): zero behavior change, no trace writes', () => {
    document.body.textContent = ''
    const p = document.createElement('p')
    p.textContent = 'Another normal English paragraph that is long enough.'
    document.body.appendChild(p)

    const result = getTranslatableElements(document.body, { trace: null })
    expect(result.length).toBe(1)
    expect(result[0]).toBe(p)
  })
})
