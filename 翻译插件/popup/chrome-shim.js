// Browser compatibility shim for popup
if (typeof chrome === 'undefined') {
  window.chrome = typeof browser !== 'undefined' ? browser : {}
}