function createBatchQueue(translateFn, { intervalMs = 300, maxCount = 8, maxChars = 8000 } = {}) {
  let pending = []
  let timer = null

  function flush() {
    if (pending.length === 0) return
    const batch = pending.splice(0)
    const texts = batch.map(item => item.text)

    translateFn(texts).then(results => {
      batch.forEach((item, i) => {
        if (item.onResult) item.onResult(results[i])
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

  return { add, flush }
}

if (typeof module !== 'undefined') {
  module.exports = { createBatchQueue }
}
