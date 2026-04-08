const BingTranslator = require('../background/translators/bing-translator.js')

describe('BingTranslator', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  test('成功翻译单个文本', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [{ translations: [{ text: '你好', to: 'zh' }] }]
    })

    const result = await BingTranslator.translate(['Hello'], 'en', 'zh')
    expect(result).toEqual(['你好'])
  })

  test('成功批量翻译多个文本', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { translations: [{ text: '你好', to: 'zh' }] },
        { translations: [{ text: '世界', to: 'zh' }] }
      ]
    })

    const result = await BingTranslator.translate(['Hello', 'World'], 'en', 'zh')
    expect(result).toEqual(['你好', '世界'])
  })

  test('HTTP 错误时抛出异常', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 429 })

    await expect(BingTranslator.translate(['Hello'], 'en', 'zh'))
      .rejects.toThrow('Bing HTTP 429')
  })

  test('auto-detect 时不传 from 参数', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [{ translations: [{ text: '你好', to: 'zh' }] }]
    })

    await BingTranslator.translate(['Hello'], 'auto', 'zh')

    const calledUrl = global.fetch.mock.calls[0][0]
    expect(calledUrl).not.toContain('from=')
    expect(calledUrl).toContain('to=zh')
  })

  test('指定源语言时传 from 参数', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [{ translations: [{ text: '你好', to: 'zh' }] }]
    })

    await BingTranslator.translate(['Hello'], 'en', 'zh')

    const calledUrl = global.fetch.mock.calls[0][0]
    expect(calledUrl).toContain('from=en')
  })

  test('请求体包含正确的 Text 数组', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [{ translations: [{ text: '你好', to: 'zh' }] }]
    })

    await BingTranslator.translate(['Hello'], 'en', 'zh')

    const callOptions = global.fetch.mock.calls[0][1]
    expect(JSON.parse(callOptions.body)).toEqual([{ Text: 'Hello' }])
    expect(callOptions.headers['Content-Type']).toBe('application/json')
    expect(callOptions.method).toBe('POST')
  })
})
