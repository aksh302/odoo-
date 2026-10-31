// Reads text from a photo or screenshot in the browser with Tesseract.
// The engine and English data are served from /ocr (copied there by
// scripts/setup-ocr.mjs on npm install), so it works without internet.

import type { Worker } from 'tesseract.js'

let workerPromise: Promise<Worker> | null = null
let onProgress: ((p: number) => void) | null = null

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js') // loaded only when someone reads a receipt
      const base = window.location.origin
      return createWorker('eng', 1, {
        workerPath: `${base}/ocr/worker.min.js`,
        corePath: `${base}/ocr/core`,
        langPath: `${base}/ocr/lang`,
        gzip: true,
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') onProgress?.(m.progress)
        },
      })
    })().catch((err) => {
      workerPromise = null
      throw err
    })
  }
  return workerPromise
}

/** Returns the text found in an image (File, Blob, data URL or canvas). */
export async function readImageText(image: File | Blob | string | HTMLCanvasElement, progress?: (p: number) => void): Promise<string> {
  onProgress = progress ?? null
  const worker = await getWorker()
  const { data } = await worker.recognize(image)
  onProgress = null
  return data.text
}

/** Draws a plain sample bank-transfer receipt for demos, so OCR can be shown end to end. */
export function drawSampleReceipt(lines: { amount: string; date: string; payer: string; utr: string; note: string }): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 720
  c.height = 520
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#1D2A25'
  g.font = 'bold 30px Arial'
  g.fillText('Payment receipt', 40, 64)
  g.font = '22px Arial'
  g.fillStyle = '#4A5A53'
  g.fillText('Funds transfer via NEFT', 40, 100)
  g.strokeStyle = '#DCE4E0'
  g.beginPath()
  g.moveTo(40, 124)
  g.lineTo(680, 124)
  g.stroke()
  const rows: [string, string][] = [
    ['Amount', `Rs. ${lines.amount}`],
    ['Date', lines.date],
    ['From', lines.payer],
    ['To', 'Brightloop Software'],
    ['UTR', lines.utr],
    ['Remarks', lines.note],
  ]
  rows.forEach(([k, v], i) => {
    const y = 176 + i * 54
    g.fillStyle = '#5B6B64'
    g.font = '22px Arial'
    g.fillText(k, 40, y)
    g.fillStyle = '#1D2A25'
    g.font = i === 0 ? 'bold 28px Arial' : '24px Arial'
    g.fillText(v, 220, y)
  })
  return c
}
