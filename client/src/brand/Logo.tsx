import { brand } from './theme'

/**
 * The Brightloop mark: a billing cycle drawn as an open ring,
 * with a marigold dot where the next renewal lands.
 */
export function LogoMark({ size = 28, onDark = false }: { size?: number; onDark?: boolean }) {
  const ring = onDark ? brand.mint : brand.green
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {/* 300° arc: open at the top right, where a cycle closes and renews */}
      <path d="M16 4 A12 12 0 1 0 26.4 10" fill="none" stroke={ring} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="26.4" cy="10" r="3.6" fill={brand.marigold} />
    </svg>
  )
}

export function Logo({ onDark = false, compact = false }: { onDark?: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2" aria-label="Brightloop">
      <LogoMark onDark={onDark} />
      {!compact && (
        <span
          style={{
            fontFamily: brand.fontDisplay,
            fontWeight: 700,
            fontSize: 21,
            letterSpacing: '-0.02em',
            color: onDark ? '#FFFFFF' : brand.slate,
            lineHeight: 1,
          }}
        >
          brightloop
        </span>
      )}
    </span>
  )
}
