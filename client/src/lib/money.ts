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
