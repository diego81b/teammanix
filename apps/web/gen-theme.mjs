// Porta mockup/ui/css/tokens.css in app/assets/css/tokens.css. Rieseguire se i token cambiano.
// Differenze volute: niente @import Google Fonts (usa @nuxt/fonts), tema scuro con la classe `.dark`
// di @nuxt/color-mode al posto di [data-theme], niente blocco prefers-color-scheme (lo gestisce color-mode).
import { readFileSync, writeFileSync } from 'node:fs'
let t = readFileSync(new URL('../../mockup/ui/css/tokens.css', import.meta.url), 'utf8')
t = t.replace(/\/\* Font: solo per il mockup[\s\S]*?display=swap'\);\n/, '')
t = t.slice(0, t.indexOf('@media (prefers-color-scheme: dark)')).trimEnd() + '\n'
t = t.replace(/\[data-theme="light"\]/g, '.light').replace(/\[data-theme="dark"\]/g, '.dark')
const head = '/* GENERATO da gen-theme.mjs a partire da mockup/ui/css/tokens.css. Non modificare a mano. */\n'
writeFileSync(new URL('./app/assets/css/tokens.css', import.meta.url), head + t)
console.log('tokens.css', t.length)
