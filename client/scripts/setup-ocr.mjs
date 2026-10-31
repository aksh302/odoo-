// Copies the OCR engine and English language data into public/ocr so
// "Read a payment" works offline (no CDN needed at the venue).
// Runs automatically after `npm install` (see "postinstall" in package.json).
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nm = join(root, 'node_modules')
const out = join(root, 'public', 'ocr')

const coreDir = join(nm, 'tesseract.js-core')
const worker = join(nm, 'tesseract.js', 'dist', 'worker.min.js')
const lang = join(nm, '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz')

if (!existsSync(coreDir) || !existsSync(worker) || !existsSync(lang)) {
  console.warn('[setup-ocr] OCR packages not installed yet; skipping.')
  process.exit(0)
}

mkdirSync(join(out, 'core'), { recursive: true })
mkdirSync(join(out, 'lang'), { recursive: true })
copyFileSync(worker, join(out, 'worker.min.js'))
for (const f of readdirSync(coreDir)) {
  if (f.endsWith('.wasm.js')) copyFileSync(join(coreDir, f), join(out, 'core', f))
}
copyFileSync(lang, join(out, 'lang', 'eng.traineddata.gz'))
console.log('[setup-ocr] OCR files ready in public/ocr')
