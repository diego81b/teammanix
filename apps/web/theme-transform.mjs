// Pure token transform shared by gen-theme.mjs and the unit test that guards the generated file.
// Differences from the mockup are deliberate: no Google Fonts @import (@nuxt/fonts handles it), dark theme through
// the `.dark` class of @nuxt/color-mode instead of [data-theme], no prefers-color-scheme block (color-mode owns it).
const HEAD = '/* GENERATO da gen-theme.mjs a partire da mockup/ui/css/tokens.css. Non modificare a mano. */\n'

/** @param {string} source content of mockup/ui/css/tokens.css */
export function transformTokens(source) {
  // A CRLF checkout (autocrlf) must give the same file as an LF one
  let t = source.replaceAll('\r\n', '\n').replace(/\/\* Font: solo per il mockup[\s\S]*?display=swap'\);\n/, '')
  t = t.slice(0, t.indexOf('@media (prefers-color-scheme: dark)')).trimEnd() + '\n'
  t = t.replace(/\[data-theme="light"\]/g, '.light').replace(/\[data-theme="dark"\]/g, '.dark')
  return HEAD + t
}
