// Browser compatibility shim for popup
const chrome = browser || window.chrome || {}
if (typeof window !== 'undefined') {
  window.chrome = chrome
}
if (typeof self !== 'undefined') {
  self.chrome = chrome
}