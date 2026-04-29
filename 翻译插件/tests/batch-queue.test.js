jest.useFakeTimers()
const { createBatchQueue } = require('../background/batch-queue.js')

describe('BatchQueue', () => {
  test('300ms 后自动发送', async () => {
    const mockTranslate = jest.fn().mockResolvedValue(['译文1'])
    const queue = createBatchQueue(mockTranslate, { intervalMs: 300, maxCount: 8, maxChars: 8000 })

    queue.add({ id: '1', text: 'Hello world this is a test sentence.' })
    expect(mockTranslate).not.toHaveBeenCalled()

    jest.advanceTimersByTime(300)
    await Promise.resolve()

    expect(mockTranslate).toHaveBeenCalledWith(['Hello world this is a test sentence.'])
  })

  test('达到 maxCount 立即发送', async () => {
    const mockTranslate = jest.fn().mockResolvedValue(new Array(8).fill('译文'))
    const queue = createBatchQueue(mockTranslate, { intervalMs: 300, maxCount: 8, maxChars: 8000 })

    for (let i = 0; i < 8; i++) {
      queue.add({ id: String(i), text: `Sentence number ${i} for testing the batch queue system.` })
    }

    await Promise.resolve()
    expect(mockTranslate).toHaveBeenCalled()
  })

  test('翻译结果通过 onResult 回调返回', async () => {
    const mockTranslate = jest.fn().mockResolvedValue(['你好世界'])
    const queue = createBatchQueue(mockTranslate, { intervalMs: 300, maxCount: 8, maxChars: 8000 })

    const results = {}
    queue.add({
      id: 'a',
      text: 'Hello world sentence for testing.',
      onResult: (t) => { results['a'] = t }
    })

    jest.advanceTimersByTime(300)
    await Promise.resolve()
    await Promise.resolve()

    expect(results['a']).toBe('你好世界')
  })

  test('同批次内相同文本只发送一次但分发给所有请求方', async () => {
    const mockTranslate = jest.fn().mockResolvedValue(['你好', '世界'])
    const queue = createBatchQueue(mockTranslate, { intervalMs: 300, maxCount: 8, maxChars: 8000 })

    const results = {}
    queue.add({ id: 'a', text: 'Hello world repeated text', onResult: (t) => { results['a'] = t } })
    queue.add({ id: 'b', text: 'Different sentence here',  onResult: (t) => { results['b'] = t } })
    queue.add({ id: 'c', text: 'Hello world repeated text', onResult: (t) => { results['c'] = t } })

    jest.advanceTimersByTime(300)
    await Promise.resolve(); await Promise.resolve()

    // Only 2 unique texts should reach translateFn
    expect(mockTranslate).toHaveBeenCalledWith(['Hello world repeated text', 'Different sentence here'])
    expect(results['a']).toBe('你好')
    expect(results['c']).toBe('你好')
    expect(results['b']).toBe('世界')
  })
})
