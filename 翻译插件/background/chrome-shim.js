// Browser compatibility shim for background
const chrome = browser || self.chrome || {}
if (typeof window !== 'undefined') {
  window.chrome = chrome
}
if (typeof self !== 'undefined') {
  self.chrome = chrome
}