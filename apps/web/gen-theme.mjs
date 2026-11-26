// Porta mockup/ui/css/tokens.css in app/assets/css/tokens.css. Rieseguire se i token cambiano.
// La trasformazione sta in theme-transform.mjs, senza effetti collaterali, cosi' un test la confronta col file generato.
import { readFileSync, writeFileSync } from 'node:fs'
import { transformTokens } from './theme-transform.mjs'
const out = transformTokens(readFileSync(new URL('../../mockup/ui/css/tokens.css', import.meta.url), 'utf8'))
writeFileSync(new URL('./app/assets/css/tokens.css', import.meta.url), out)
console.log('tokens.css', out.length)
