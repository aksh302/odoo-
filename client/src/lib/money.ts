// The API sends and expects ALL money as integer paise (1 INR = 100 paise).
// Never do maths on rupee floats in the UI — convert at the edges only.

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** 123450 -> "₹1,234.50" */
export function formatINR(paise: number | null | undefined): string {
  if (paise == null) return '—'
  return inr.format(paise / 100)
}

/** User typed 1234.5 (rupees) -> 123450 paise, rounded half-up. */
export function toPaise(rupees: number | string | null | undefined): number {
  const n = Number(rupees ?? 0)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** 123450 paise -> 1234.5 (for pre-filling number inputs). */
export function toRupees(paise: number | null | undefined): number {
  return (paise ?? 0) / 100
}

/** Short Indian-style amount for chart axes: ₹950, ₹45K, ₹1.2L, ₹3.4Cr. */
export function formatINRCompact(paise: number): string {
  const r = paise / 100
  const fmt = (n: number) => (n >= 10 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ''))
  if (r >= 1e7) return `₹${fmt(r / 1e7)}Cr`
  if (r >= 1e5) return `₹${fmt(r / 1e5)}L`
  if (r >= 1e3) return `₹${fmt(r / 1e3)}K`
  return `₹${Math.round(r)}`
}

const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

/** Rounded to whole rupees, for headline numbers: 11706767 -> "₹1,17,068". */
export function formatINRWhole(paise: number | null | undefined): string {
  if (paise == null) return '—'
  return inrWhole.format(Math.round(paise / 100))
}
