// Spezza lo sprite del design system (mockup/ui/assets/icons.svg) in SVG singoli per @nuxt/icon.
// Uso: node gen-icons.mjs   (rigenera app/assets/icons/*.svg)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const src = readFileSync(new URL('../../mockup/ui/assets/icons.svg', import.meta.url), 'utf8').replace(/<metadata>[\s\S]*?<\/metadata>/, '')
const out = new URL('./app/assets/icons/', import.meta.url)
mkdirSync(out, { recursive: true })
let n = 0
for (const m of src.matchAll(/<symbol id="i-([^"]+)"[^>]*>([\s\S]*?)<\/symbol>/g)) {
  // I cerchi piccoli (puntini di i-more, i-dots-v) sono pieni, il resto è tratto.
  const body = m[2].replace(/<circle ([^>]*?)r="(?:0?\.\d+|1(?:\.\d+)?)"/g, '<circle fill="currentColor" stroke="none" $1r="1.2"')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`
  writeFileSync(new URL(`${m[1]}.svg`, out), svg)
  n++
}
// Spinner: non presente nello sprite.
writeFileSync(new URL('loader.svg', out), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.2-8.56"/></svg>\n')
console.log(`${n} icone + loader`)
