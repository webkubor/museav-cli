import { useId } from 'react'

export function DashboardHeroVisual() {
  const rawId = useId().replace(/:/g, '')
  const bgGradient = `dashboardHeroBg-${rawId}`
  const brandGradient = `dashboardHeroBrand-${rawId}`
  const softGlow = `dashboardHeroGlow-${rawId}`
  const lineGradient = `dashboardHeroLine-${rawId}`
  const gridPattern = `dashboardHeroGrid-${rawId}`

  return (
    <div
      aria-hidden="true"
      className="relative w-full min-w-[320px] max-w-[620px] overflow-hidden rounded-lg border border-mg-border bg-mg-bg-0 shadow-lg"
      style={{ aspectRatio: '21 / 9' }}
    >
      <svg className="h-full w-full" viewBox="0 0 2100 900" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={bgGradient} x1="0" y1="0" x2="2100" y2="900" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--mg-bg-0)" />
            <stop offset="0.48" stopColor="var(--mg-bg-1)" />
            <stop offset="1" stopColor="var(--brand-pale)" stopOpacity="0.72" />
          </linearGradient>
          <linearGradient id={brandGradient} x1="454" y1="240" x2="1500" y2="720" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--brand-light)" />
            <stop offset="0.42" stopColor="var(--brand-base)" />
            <stop offset="1" stopColor="var(--brand-deep)" />
          </linearGradient>
          <linearGradient id={lineGradient} x1="320" y1="456" x2="1780" y2="456" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--brand-base)" stopOpacity="0" />
            <stop offset="0.18" stopColor="var(--brand-base)" stopOpacity="0.58" />
            <stop offset="0.52" stopColor="var(--brand-light)" stopOpacity="0.95" />
            <stop offset="0.82" stopColor="var(--brand-base)" stopOpacity="0.58" />
            <stop offset="1" stopColor="var(--brand-base)" stopOpacity="0" />
          </linearGradient>
          <filter id={softGlow} x="-20%" y="-30%" width="140%" height="160%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="34" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.62 0"
            />
          </filter>
          <pattern id={gridPattern} width="72" height="72" patternUnits="userSpaceOnUse">
            <path d="M72 0H0V72" stroke="var(--grid-color)" strokeWidth="2" />
          </pattern>
        </defs>

        <rect width="2100" height="900" rx="68" fill={`url(#${bgGradient})`} />
        <rect width="2100" height="900" rx="68" fill={`url(#${gridPattern})`} />
        <ellipse cx="1080" cy="452" rx="620" ry="238" fill="var(--brand-glow)" filter={`url(#${softGlow})`} />

        <g opacity="0.88">
          <path
            d="M250 454C414 318 604 318 782 454C966 594 1156 596 1344 454C1518 322 1702 328 1850 454"
            stroke={`url(#${lineGradient})`}
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d="M250 454C414 318 604 318 782 454C966 594 1156 596 1344 454C1518 322 1702 328 1850 454"
            stroke="var(--brand-light)"
            strokeOpacity="0.22"
            strokeWidth="38"
            strokeLinecap="round"
            filter={`url(#${softGlow})`}
          />
        </g>

        <g transform="translate(750 214)">
          <rect x="0" y="0" width="600" height="472" rx="44" fill="var(--mg-bg-0)" fillOpacity="0.88" />
          <rect x="0" y="0" width="600" height="472" rx="44" stroke="var(--mg-border)" strokeWidth="2" />
          <rect x="46" y="48" width="206" height="28" rx="14" fill="var(--mg-fill-2)" />
          <rect x="46" y="98" width="504" height="2" fill="var(--mg-border)" />

          <g transform="translate(96 144)">
            <path
              d="M156 16L42 84V220L156 288L270 220V84L156 16Z"
              stroke={`url(#${brandGradient})`}
              strokeWidth="32"
              strokeLinejoin="round"
            />
            <path
              d="M156 62L82 106V194L156 238L230 194V106L156 62Z"
              stroke="var(--mg-border)"
              strokeWidth="14"
              strokeLinejoin="round"
            />
            <circle cx="156" cy="150" r="42" fill={`url(#${brandGradient})`} />
            <circle cx="156" cy="150" r="18" fill="var(--mg-bg-0)" />
          </g>

          <g transform="translate(390 158)">
            <rect x="0" y="0" width="118" height="34" rx="17" fill="var(--brand-glow)" />
            <rect x="0" y="58" width="166" height="18" rx="9" fill="var(--mg-fill-2)" />
            <rect x="0" y="100" width="128" height="18" rx="9" fill="var(--mg-fill-1)" />
            <rect x="0" y="142" width="154" height="18" rx="9" fill="var(--mg-fill-1)" />
            <rect x="0" y="208" width="178" height="48" rx="24" fill="var(--brand-glow)" />
            <circle cx="24" cy="232" r="8" fill="var(--brand-base)" />
            <rect x="42" y="224" width="96" height="16" rx="8" fill="var(--brand-base)" fillOpacity="0.72" />
          </g>
        </g>

        <g>
          {[
            [348, 286, 108],
            [428, 612, 82],
            [1624, 294, 96],
            [1746, 620, 118],
          ].map(([cx, cy, size], index) => (
            <g key={`${cx}-${cy}`} transform={`translate(${cx - size / 2} ${cy - size / 2})`}>
              <rect
                width={size}
                height={size}
                rx={size * 0.28}
                fill="var(--mg-bg-0)"
                fillOpacity="0.86"
                stroke="var(--mg-border)"
                strokeWidth="2"
              />
              <circle cx={size / 2} cy={size / 2} r={size * 0.18} fill={index % 2 ? 'var(--mg-fill-2)' : 'var(--brand-glow)'} />
              <path
                d={`M${size * 0.3} ${size * 0.5}H${size * 0.7}M${size * 0.5} ${size * 0.3}V${size * 0.7}`}
                stroke={index % 2 ? 'var(--brand-light)' : 'var(--brand-base)'}
                strokeWidth={size * 0.06}
                strokeLinecap="round"
              />
            </g>
          ))}
        </g>

        <g opacity="0.68">
          <circle cx="606" cy="452" r="11" fill="var(--brand-light)" />
          <circle cx="1050" cy="452" r="14" fill="var(--brand-base)" />
          <circle cx="1494" cy="452" r="11" fill="var(--brand-light)" />
          <rect x="290" y="752" width="540" height="10" rx="5" fill="var(--mg-fill-1)" />
          <rect x="290" y="752" width="228" height="10" rx="5" fill="var(--brand-base)" fillOpacity="0.52" />
          <rect x="1294" y="752" width="516" height="10" rx="5" fill="var(--mg-fill-1)" />
          <rect x="1294" y="752" width="318" height="10" rx="5" fill="var(--brand-base)" fillOpacity="0.46" />
        </g>
      </svg>
    </div>
  )
}
