// Runs in MAIN world — can patch XMLHttpRequest.
// Intercepts YouTube's timedtext (caption) requests and forwards them to the content script.
;(function () {
  const orig = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (...args) {
    const url = args[1]
    if (typeof url === 'string' && url.includes('timedtext')) {
      this.addEventListener('load', function () {
        window.postMessage(
          { type: 'BT_YOUTUBE_TIMEDTEXT', url: this.responseURL },
          window.location.origin
        )
      })
    }
    return orig.apply(this, args)
  }
})()
