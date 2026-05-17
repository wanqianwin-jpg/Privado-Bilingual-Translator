const {
  resolveMessage,
  btI18nInit,
  btI18n
} = require('../shared/i18n.js')

describe('resolveMessage — pure substitution', () => {
  test('plain message, no placeholders', () => {
    const t = { hello: { message: 'Hello world' } }
    expect(resolveMessage(t, 'hello')).toBe('Hello world')
  })

  test('positional $1/$2 with array subs', () => {
    const t = { greet: { message: 'Hi $1, you are $2' } }
    expect(resolveMessage(t, 'greet', ['Alice', 'cool'])).toBe('Hi Alice, you are cool')
  })

  test('positional $1 with single string subs (normalized to array)', () => {
    const t = { greet: { message: 'Hi $1' } }
    expect(resolveMessage(t, 'greet', 'Bob')).toBe('Hi Bob')
  })

  test('named $FOO$ resolved via placeholders.content = $1', () => {
    const t = { site: { message: 'Translate $HOSTNAME$', placeholders: { hostname: { content: '$1' } } } }
    expect(resolveMessage(t, 'site', ['example.com'])).toBe('Translate example.com')
  })

  test('named placeholder name is case-insensitive', () => {
    const t = { site: { message: 'Translate $hostname$', placeholders: { HOSTNAME: { content: '$1' } } } }
    expect(resolveMessage(t, 'site', ['x.com'])).toBe('Translate x.com')
  })

  test('named placeholder content can reference $2', () => {
    const t = { s: { message: '$A$ and $B$', placeholders: { a: { content: '$1' }, b: { content: '$2' } } } }
    expect(resolveMessage(t, 's', ['one', 'two'])).toBe('one and two')
  })

  test('$$ escapes to a single $', () => {
    const t = { price: { message: 'Cost is $$5' } }
    expect(resolveMessage(t, 'price')).toBe('Cost is $5')
  })

  test('$ not forming valid $n/$NAME$ left as-is', () => {
    const t = { x: { message: 'a $ b $z c' } }
    expect(resolveMessage(t, 'x')).toBe('a $ b $z c')
  })

  test('missing subs become empty string', () => {
    const t = { g: { message: 'Hi $1 and $2' } }
    expect(resolveMessage(t, 'g', ['only'])).toBe('Hi only and ')
  })

  test('named placeholder with missing sub becomes empty string', () => {
    const t = { s: { message: 'X=$VAL$', placeholders: { val: { content: '$1' } } } }
    expect(resolveMessage(t, 's')).toBe('X=')
  })

  test('subs undefined → treated as []', () => {
    const t = { g: { message: 'Hi $1' } }
    expect(resolveMessage(t, 'g')).toBe('Hi ')
  })

  test('key absent → undefined', () => {
    const t = { hello: { message: 'Hi' } }
    expect(resolveMessage(t, 'nope')).toBeUndefined()
  })

  test('null/empty table → undefined', () => {
    expect(resolveMessage(null, 'k')).toBeUndefined()
    expect(resolveMessage({}, 'k')).toBeUndefined()
    expect(resolveMessage(undefined, 'k')).toBeUndefined()
  })

  test('empty/missing placeholders object — $NAME$ unresolved left as-is', () => {
    const t = { s: { message: 'val $FOO$', placeholders: {} } }
    expect(resolveMessage(t, 's', ['ignored'])).toBe('val $FOO$')
    const t2 = { s: { message: 'val $FOO$' } }
    expect(resolveMessage(t2, 's', ['ignored'])).toBe('val $FOO$')
  })

  test('repeated placeholder substituted every occurrence', () => {
    const t = { s: { message: '$1 $1 $1' } }
    expect(resolveMessage(t, 's', ['x'])).toBe('x x x')
  })

  test('deterministic — same input twice', () => {
    const t = { g: { message: 'Hi $1' } }
    expect(resolveMessage(t, 'g', ['a'])).toBe(resolveMessage(t, 'g', ['a']))
  })
})

describe('btI18n — three-level fallback chain', () => {
  let store
  beforeEach(() => {
    store = {}
    global.chrome = {
      runtime: { getURL: (p) => p },
      storage: {
        local: {
          get: (keys, cb) => {
            const out = {}
            const list = Array.isArray(keys) ? keys : [keys]
            list.forEach((k) => { if (k in store) out[k] = store[k] })
            cb(out)
          },
          set: (obj, cb) => { Object.assign(store, obj); if (cb) cb() }
        }
      },
      i18n: { getMessage: jest.fn((k, s) => 'CHROME:' + k) }
    }
  })
  afterEach(() => { delete global.chrome })

  test('active table wins when it has the key', async () => {
    store['__btUiStrings_fr'] = { hello: { message: 'Bonjour' } }
    store['__btUiStrings_en'] = { hello: { message: 'Hello' } }
    await btI18nInit('fr')
    expect(btI18n('hello')).toBe('Bonjour')
  })

  test('falls to en when active missing the key', async () => {
    store['__btUiStrings_fr'] = { other: { message: 'Autre' } }
    store['__btUiStrings_en'] = { hello: { message: 'Hello' } }
    await btI18nInit('fr')
    expect(btI18n('hello')).toBe('Hello')
  })

  test('falls to chrome.i18n when neither has the key', async () => {
    store['__btUiStrings_fr'] = { other: { message: 'Autre' } }
    store['__btUiStrings_en'] = { other: { message: 'Other' } }
    await btI18nInit('fr')
    expect(btI18n('missing')).toBe('CHROME:missing')
    expect(global.chrome.i18n.getMessage).toHaveBeenCalledWith('missing', undefined)
  })

  test('chrome.i18n absent → empty string', async () => {
    store['__btUiStrings_fr'] = {}
    store['__btUiStrings_en'] = {}
    await btI18nInit('fr')
    delete global.chrome.i18n
    expect(btI18n('missing')).toBe('')
  })

  test('safe to call before init (caches null) → chrome.i18n', () => {
    expect(btI18n('foo')).toBe('CHROME:foo')
  })

  test('substitution flows through the chain', async () => {
    store['__btUiStrings_fr'] = { g: { message: 'Salut $1' } }
    store['__btUiStrings_en'] = {}
    await btI18nInit('fr')
    expect(btI18n('g', 'Marie')).toBe('Salut Marie')
  })

  test('btI18nInit tolerates missing chrome.storage (no throw, caches null)', async () => {
    delete global.chrome.storage
    await expect(btI18nInit('fr')).resolves.toBeUndefined()
    expect(btI18n('x')).toBe('CHROME:x')
  })
})
