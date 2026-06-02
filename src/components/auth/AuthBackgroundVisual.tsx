import { useId } from 'react'

type AuthVisualVariant = 'login' | 'signup'

interface AuthBackgroundVisualProps {
  variant: AuthVisualVariant
}

export function AuthBackgroundVisual({ variant }: AuthBackgroundVisualProps) {
  const rawId = useId().replace(/:/g, '')
  const bgGradient = `authVisualBg-${variant}-${rawId}`
  const brandGradient = `authVisualBrand-${variant}-${rawId}`
  const lineGradient = `authVisualLine-${variant}-${rawId}`
  const glowFilter = `authVisualGlow-${variant}-${rawId}`
  const gridPattern = `authVisualGrid-${variant}-${rawId}`
  const isSignup = variant === 'signup'

  return (
    <div className="auth-background-visual" aria-hidden="true">
      <svg className="h-full w-full" viewBox="0 0 2100 900" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={bgGradient} x1="0" y1="0" x2="2100" y2="900" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--mg-bg-0)" stopOpacity="0.88" />
            <stop offset="0.55" stopColor="var(--mg-bg-1)" stopOpacity="0.74" />
            <stop offset="1" stopColor="var(--brand-pale)" stopOpacity="0.68" />
          </linearGradient>
          <linearGradient id={brandGradient} x1="360" y1="160" x2="1680" y2="760" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--brand-light)" />
            <stop offset="0.5" stopColor="var(--brand-base)" />
            <stop offset="1" stopColor="var(--brand-deep)" />
          </linearGradient>
          <linearGradient id={lineGradient} x1="210" y1="458" x2="1890" y2="458" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--brand-base)" stopOpacity="0" />
            <stop offset="0.22" stopColor="var(--brand-base)" stopOpacity="0.48" />
            <stop offset="0.5" stopColor="var(--brand-light)" stopOpacity="0.92" />
            <stop offset="0.78" stopColor="var(--brand-base)" stopOpacity="0.48" />
            <stop offset="1" stopColor="var(--brand-base)" stopOpacity="0" />
          </linearGradient>
          <filter id={glowFilter} x="-20%" y="-30%" width="140%" height="160%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="32" />
          </filter>
          <pattern id={gridPattern} width="72" height="72" patternUnits="userSpaceOnUse">
            <path d="M72 0H0V72" stroke="var(--grid-color)" strokeWidth="2" />
          </pattern>
        </defs>

        <rect width="2100" height="900" rx="72" fill={`url(#${bgGradient})`} />
        <rect width="2100" height="900" rx="72" fill={`url(#${gridPattern})`} />
        <ellipse cx="1160" cy="450" rx="710" ry="260" fill="var(--brand-glow)" filter={`url(#${glowFilter})`} />

        {isSignup ? <SignupNetwork brandGradient={brandGradient} lineGradient={lineGradient} glowFilter={glowFilter} /> : <LoginGate brandGradient={brandGradient} lineGradient={lineGradient} glowFilter={glowFilter} />}
      </svg>
    </div>
  )
}

function LoginGate({
  brandGradient,
  lineGradient,
  glowFilter,
}: {
  brandGradient: string
  lineGradient: string
  glowFilter: string
}) {
  return (
    <>
      <path
        d="M288 454C470 330 626 332 804 454C984 578 1160 578 1340 454C1518 332 1692 330 1876 454"
        stroke={`url(#${lineGradient})`}
        strokeWidth="16"
        strokeLinecap="round"
      />
      <path
        d="M288 454C470 330 626 332 804 454C984 578 1160 578 1340 454C1518 332 1692 330 1876 454"
        stroke="var(--brand-light)"
        strokeOpacity="0.18"
        strokeWidth="46"
        strokeLinecap="round"
        filter={`url(#${glowFilter})`}
      />

      <g transform="translate(760 176)">
        <rect width="580" height="552" rx="54" fill="var(--mg-bg-0)" fillOpacity="0.82" />
        <rect width="580" height="552" rx="54" stroke="var(--mg-border)" strokeWidth="2" />
        <path
          d="M290 78L438 164V336L290 422L142 336V164L290 78Z"
          stroke="var(--mg-border)"
          strokeWidth="18"
          strokeLinejoin="round"
        />
        <path
          d="M290 122L398 184V308L290 370L182 308V184L290 122Z"
          stroke={`url(#${brandGradient})`}
          strokeWidth="24"
          strokeLinejoin="round"
        />
        <path
          d="M214 246H166M414 246H366M290 122V78M290 422V370"
          stroke="var(--brand-light)"
          strokeOpacity="0.58"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <rect x="224" y="204" width="132" height="132" rx="40" fill="var(--brand-glow)" />
        <rect x="224" y="204" width="132" height="132" rx="40" stroke={`url(#${brandGradient})`} strokeWidth="14" />
        <circle cx="290" cy="270" r="22" fill={`url(#${brandGradient})`} />
        <path d="M290 292V314" stroke={`url(#${brandGradient})`} strokeWidth="16" strokeLinecap="round" />
        <rect x="184" y="470" width="232" height="22" rx="11" fill="var(--mg-fill-1)" />
        <rect x="238" y="470" width="124" height="22" rx="11" fill="var(--brand-base)" fillOpacity="0.42" />
      </g>

      <g opacity="0.76">
        <AuthChip x={354} y={280} labelWidth={138} />
        <AuthChip x={1490} y={256} labelWidth={174} />
        <AuthChip x={392} y={626} labelWidth={112} />
        <AuthChip x={1528} y={638} labelWidth={136} />
      </g>
    </>
  )
}

function SignupNetwork({
  brandGradient,
  lineGradient,
  glowFilter,
}: {
  brandGradient: string
  lineGradient: string
  glowFilter: string
}) {
  const nodes = [
    [520, 272, 88],
    [748, 612, 104],
    [1080, 238, 124],
    [1328, 614, 102],
    [1646, 320, 92],
  ]

  return (
    <>
      <path
        d="M520 272L1080 238L1646 320M520 272L748 612L1328 614L1646 320M1080 238L1328 614M748 612L1080 238"
        stroke={`url(#${lineGradient})`}
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M520 272L1080 238L1646 320M520 272L748 612L1328 614L1646 320M1080 238L1328 614M748 612L1080 238"
        stroke="var(--brand-light)"
        strokeOpacity="0.16"
        strokeWidth="34"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${glowFilter})`}
      />

      <g transform="translate(880 318)">
        <rect width="420" height="250" rx="46" fill="var(--mg-bg-0)" fillOpacity="0.84" />
        <rect width="420" height="250" rx="46" stroke="var(--mg-border)" strokeWidth="2" />
        <rect x="52" y="52" width="140" height="24" rx="12" fill="var(--mg-fill-2)" />
        <rect x="52" y="100" width="316" height="16" rx="8" fill="var(--mg-fill-1)" />
        <rect x="52" y="136" width="244" height="16" rx="8" fill="var(--mg-fill-1)" />
        <rect x="52" y="182" width="178" height="42" rx="21" fill="var(--brand-glow)" />
        <circle cx="82" cy="203" r="9" fill="var(--brand-base)" />
        <rect x="104" y="194" width="92" height="18" rx="9" fill={`url(#${brandGradient})`} />
      </g>

      {nodes.map(([cx, cy, size], index) => (
        <g key={`${cx}-${cy}`} transform={`translate(${cx - size / 2} ${cy - size / 2})`}>
          <rect
            width={size}
            height={size}
            rx={size * 0.3}
            fill="var(--mg-bg-0)"
            fillOpacity="0.9"
            stroke="var(--mg-border)"
            strokeWidth="2"
          />
          <path
            d={`M${size * 0.28} ${size * 0.52}L${size * 0.44} ${size * 0.68}L${size * 0.72} ${size * 0.34}`}
            stroke={index === 2 ? `url(#${brandGradient})` : 'var(--brand-base)'}
            strokeWidth={size * 0.08}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ))}
    </>
  )
}

function AuthChip({ x, y, labelWidth }: { x: number; y: number; labelWidth: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={labelWidth + 92} height="66" rx="33" fill="var(--mg-bg-0)" fillOpacity="0.78" />
      <rect width={labelWidth + 92} height="66" rx="33" stroke="var(--mg-border)" strokeWidth="2" />
      <circle cx="34" cy="33" r="13" fill="var(--brand-base)" fillOpacity="0.8" />
      <rect x="60" y="23" width={labelWidth} height="20" rx="10" fill="var(--mg-fill-2)" />
    </g>
  )
}
