function createBatchQueue(translateFn, { intervalMs = 300, maxCount = 8, maxChars = 8000 } = {}) {
  let pending = []
  let timer = null

  function flush() {
    if (pending.length === 0) return
    const batch = pending.splice(0)

    // Dedupe identical texts inside one batch — saves both API tokens (LLM mode pays per char)
    // and request count. Translate each unique text once, then fan the result back to every
    // item that asked for it.
    const uniqTexts = []
    const indexByText = new Map()
    const itemTextIdx = []
    for (const item of batch) {
      let idx = indexByText.get(item.text)
      if (idx === undefined) {
        idx = uniqTexts.length
        indexByText.set(item.text, idx)
        uniqTexts.push(item.text)
      }
      itemTextIdx.push(idx)
    }

    translateFn(uniqTexts).then(results => {
      batch.forEach((item, i) => {
        if (item.onResult) item.onResult(results[itemTextIdx[i]])
      })
    }).catch(err => {
      batch.forEach(item => {
        if (item.onError) item.onError(err)
      })
    })
  }

  function scheduleFlush() {
    if (timer) return
    timer = setTimeout(() => { timer = null; flush() }, intervalMs)
  }

  function add(item) {
    pending.push(item)
    const totalChars = pending.reduce((sum, i) => sum + i.text.length, 0)
    if (pending.length >= maxCount || totalChars >= maxChars) {
      if (timer) { clearTimeout(timer); timer = null }
      flush()
      return
    }
    scheduleFlush()
  }

  function destroy() {
    if (timer) { clearTimeout(timer); timer = null }
    pending = []
  }

  return { add, flush, destroy }
}

if (typeof module !== 'undefined') {
  module.exports = { createBatchQueue }
}
