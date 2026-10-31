import dayjs from 'dayjs'
import { brand } from '../../brand/theme'

const WINDOW = 30 // days on the ring
const PAST = 11 // days before today shown on the ring
// Example renewals, as day offsets from today (negative = already billed).
const RENEWALS = [-10, -7, -3, -1, 2, 5, 9, 13, 16]

/**
 * A rolling 30-day billing cycle: a tick per day, a dot per renewal.
 * Renewals already billed are mint; upcoming ones are marigold.
 * The ring draws itself once on load (skipped with reduced motion).
 */
export function MonthRing({ size = 340 }: { size?: number }) {
  const today = dayjs()
  const c = size / 2
  const r = size * 0.4
  // position 0 = start of window, at 12 o'clock
  const at = (pos: number, radius: number) => {
    const a = (pos / WINDOW) * 2 * Math.PI - Math.PI / 2
    return [c + radius * Math.cos(a), c + radius * Math.sin(a)] as const
  }
  const circ = 2 * Math.PI * r
  const doneShare = PAST / WINDOW
  const upcoming = RENEWALS.filter((d) => d >= 0)
  const lastDue = today.add(Math.max(...upcoming), 'day')

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: size }}
      role="img"
      aria-label={`${upcoming.length} renewals due before ${lastDue.format('D MMMM')}`}
    >
      <style>{`
        @keyframes ss-draw { from { stroke-dashoffset: ${circ}; } to { stroke-dashoffset: ${circ * (1 - doneShare)}; } }
        @keyframes ss-fade { from { opacity: 0; } to { opacity: 1; } }
        .ss-arc { animation: ss-draw 1.3s cubic-bezier(.2,.7,.2,1) both; }
        .ss-dot { animation: ss-fade .4s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .ss-arc, .ss-dot { animation: none; } }
      `}</style>

      {/* day ticks; longer tick on the 1st of a month */}
      {Array.from({ length: WINDOW }, (_, i) => {
        const day = today.add(i - PAST, 'day')
        const first = day.date() === 1
        const [x1, y1] = at(i, r - 14)
        const [x2, y2] = at(i, r - (first ? 28 : 19))
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={first ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.2)'} strokeWidth={1.5} strokeLinecap="round" />
        )
      })}

      {/* the cycle, filled up to today */}
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={6} />
      <circle
        className="ss-arc"
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={brand.mint}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - doneShare)}
        transform={`rotate(-90 ${c} ${c})`}
      />

      {/* renewals */}
      {RENEWALS.map((d, i) => {
        const [x, y] = at(d + PAST, r)
        const billed = d < 0
        return (
          <circle
            key={d}
            className="ss-dot"
            style={{ animationDelay: `${0.5 + i * 0.07}s` }}
            cx={x}
            cy={y}
            r={billed ? 6 : 7.5}
            fill={billed ? brand.mint : brand.marigold}
            stroke={brand.pine}
            strokeWidth={3}
          />
        )
      })}

      {/* today marker */}
      {(() => {
        const [x1, y1] = at(PAST, r + 8)
        const [x2, y2] = at(PAST, r + 20)
        const [tx, ty] = at(PAST, r + 34)
        return (
          <g>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
            <text x={tx} y={ty} textAnchor="middle" dominantBaseline="central" fontSize={12} fill="rgba(255,255,255,0.85)" style={{ fontFamily: brand.fontBody }}>
              today
            </text>
          </g>
        )
      })()}

      <text x={c} y={c - 8} textAnchor="middle" fontSize={34} fontWeight={700} fill="#FFFFFF" style={{ fontFamily: brand.fontDisplay, letterSpacing: '-0.02em' }}>
        {today.format('D MMM')}
      </text>
      <text x={c} y={c + 20} textAnchor="middle" fontSize={14} fill="rgba(255,255,255,0.72)" style={{ fontFamily: brand.fontBody }}>
        {upcoming.length} renewals due by {lastDue.format('D MMM')}
      </text>
    </svg>
  )
}
