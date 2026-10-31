import { brand } from '../brand/theme'

/**
 * Brightloop's signature element: how far through its billing period something is.
 *
 *   <CycleRing progress={0.6} />                    small, for table rows
 *   <CycleRing progress={0.6} size={44} label="12d" /> with centre text
 *
 * `progress` 0..1 = share of the current period already used.
 * `dueSoon` turns the marker marigold (e.g. invoice within 3 days).
 * Use it on Subscriptions ("next invoice in N days") and the portal.
 */
export function CycleRing({
  progress,
  size = 22,
  stroke,
  dueSoon = false,
  label,
  title,
}: {
  progress: number
  size?: number
  stroke?: number
  dueSoon?: boolean
  label?: string
  title?: string
}) {
  const p = Math.min(1, Math.max(0, progress))
  const sw = stroke ?? Math.max(2.5, size / 9)
  const r = (size - sw) / 2 - 1
  const c = size / 2
  const circ = 2 * Math.PI * r
  const angle = p * 2 * Math.PI - Math.PI / 2
  const mx = c + r * Math.cos(angle)
  const my = c + r * Math.sin(angle)
  const markerColor = dueSoon ? brand.marigold : brand.green

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title ?? `${Math.round(p * 100)}% through billing period`}>
      {title && <title>{title}</title>}
      <circle cx={c} cy={c} r={r} fill="none" stroke={brand.line} strokeWidth={sw} />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={markerColor}
        strokeOpacity={0.35}
        strokeWidth={sw}
        strokeDasharray={`${circ * p} ${circ}`}
        transform={`rotate(-90 ${c} ${c})`}
        strokeLinecap="round"
      />
      <circle cx={mx} cy={my} r={sw * 0.9} fill={markerColor} />
      {label && (
        <text
          x={c}
          y={c}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.26}
          fontWeight={600}
          fill={brand.slate}
          style={{ fontFamily: brand.fontBody }}
        >
          {label}
        </text>
      )}
    </svg>
  )
}
