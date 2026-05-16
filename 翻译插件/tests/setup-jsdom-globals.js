// jsdom's whatwg-url needs TextEncoder/TextDecoder; jest's jsdom env
// doesn't expose them. Make them ambient for every suite (jest setupFiles).
const { TextEncoder, TextDecoder } = require('util')
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder
