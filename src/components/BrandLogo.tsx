type BrandLogoProps = {
  className?: string
  compact?: boolean
  inverse?: boolean
  markOnly?: boolean
  tagline?: boolean
}

export function BrandLogo({
  className = '',
  compact = false,
  inverse = false,
  markOnly = false,
  tagline = true,
}: BrandLogoProps) {
  const label = tagline ? 'IdenTime Authentic Presence' : 'IdenTime'
  const classes = [
    'identime-logo',
    compact && 'identime-logo-compact',
    inverse && 'identime-logo-inverse',
    markOnly && 'identime-logo-mark-only',
    className,
  ].filter(Boolean).join(' ')

  return (
    <span className={classes} aria-label={label}>
      <span className="identime-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" focusable="false">
          <path className="identime-hex identime-hex-navy" d="M32 5 55 18.5v27L32 59 9 45.5v-27L32 5Z" />
          <path className="identime-hex identime-hex-teal" d="M32 5 55 18.5v27L32 59" />
          <circle className="identime-clock" cx="31.5" cy="32" r="20.5" />
          <path className="identime-print" d="M20 28c4.1-6 13.9-7.5 20-1.4" />
          <path className="identime-print" d="M18.5 33.2c1.9-9.2 14.5-14.3 23.6-6" />
          <path className="identime-print" d="M19.6 38.5c.7-6.8 5.3-12.8 12.3-12.8 3.5 0 6.6 1.5 8.7 4" />
          <path className="identime-print" d="M24 43.4c-1.3-8.2 2.3-14.2 8.1-14.2 4.2 0 6.8 2.8 7.5 6.6" />
          <path className="identime-print" d="M30.2 46c-1.8-5.8-.3-12.4 3.1-12.4 2.2 0 3.4 1.7 3.4 4.4" />
          <path className="identime-hand" d="M31.7 32.2V22.1" />
          <path className="identime-hand" d="M31.7 32.2 40.5 29" />
          <circle className="identime-center" cx="31.7" cy="32.2" r="3.2" />
          <path className="identime-tick" d="M31.5 13.5v4" />
          <path className="identime-tick" d="M31.5 46.5v4" />
          <path className="identime-tick" d="M50 32h-4" />
          <path className="identime-tick" d="M17 32h-4" />
          <path className="identime-tick" d="M44.5 19l-2.7 2.7" />
          <path className="identime-tick" d="M21.3 42.2 18.6 45" />
        </svg>
      </span>
      {!markOnly && (
        <span className="identime-copy">
          <span className="identime-name"><span>Iden</span><em>Time</em></span>
          {tagline && <small>Authentic Presence</small>}
        </span>
      )}
    </span>
  )
}
