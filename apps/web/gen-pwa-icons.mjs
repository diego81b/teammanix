// Genera le icone di installazione da public/app-icon.svg (un riquadro petrolio con angoli tondi).
// Richiede sharp, che non è una dipendenza del progetto: npm i --no-save sharp && node gen-pwa-icons.mjs
import sharp from 'sharp'

const SRC = 'public/app-icon.svg'
// Tinta media del riquadro: riempie gli angoli dove il sistema vuole uno sfondo pieno.
const FULL = '#00666A'

/** Riquadro a tutto lato. Con `pieno` lo sfondo è opaco (iOS e maschere Android), altrimenti trasparente. */
async function icon(file, side, full) {
  const tile = await sharp(SRC, { density: 400 }).resize(side, side, { fit: 'contain' }).png().toBuffer()
  await sharp({ create: { width: side, height: side, channels: 4, background: full ? FULL : { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: tile, gravity: 'center' }])
    .png()
    .toFile(`public/${file}`)
  console.log(file)
}

await icon('icon-192.png', 192, false)
await icon('icon-512.png', 512, false)
// Il glifo occupa circa metà del riquadro: resta nel cerchio sicuro (80%) della maschera Android.
await icon('icon-maskable-512.png', 512, true)
await icon('apple-touch-icon.png', 180, true)
