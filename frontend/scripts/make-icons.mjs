// Generates public/*.svg and PNG icons from a single logo definition.
// Usage: npm run icons
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// "Méditerranée" palette: flat coral tile, sand pages, coral sound waves.
const CORAL = '#c7421f'
const SAND = '#fbf6ec'
const defs = ''


// An open book whose pages carry sound-wave bars.
const book = `
  <path d="M256 158C212 130 154 128 108 144V364C154 348 212 350 256 378Z" fill="${SAND}"/>
  <path d="M256 158C300 130 358 128 404 144V364C358 348 300 350 256 378Z" fill="${SAND}" fill-opacity=".9"/>
  <g stroke="${CORAL}" stroke-width="16" stroke-linecap="round">
    <path d="M150 232v62"/><path d="M186 208v110"/><path d="M222 238v52"/>
    <path d="M290 238v52"/><path d="M326 208v110"/><path d="M362 232v62"/>
  </g>`

const svg = (inner, rx) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}<rect width="512" height="512" rx="${rx}" fill="${CORAL}"/>${inner}</svg>`

const standard = svg(book, 112)
const maskable = svg(`<g transform="translate(256 256) scale(.78) translate(-256 -256)">${book}</g>`, 0)

writeFileSync(join(out, 'icon.svg'), standard)
writeFileSync(join(out, 'favicon.svg'), standard)

const png = (source, size, name) =>
  sharp(Buffer.from(source), { density: 384 }).resize(size, size).png().toFile(join(out, name))

await png(standard, 192, 'icon-192.png')
await png(standard, 512, 'icon-512.png')
await png(maskable, 512, 'icon-maskable-512.png')
await png(maskable, 180, 'apple-touch-icon.png')
console.log('icons written to', out)
