import { cn } from '@/lib/utils'
import './flame.css'

/**
 * 手工 SVG 火焰图标（双层火焰 + 跳动动画，无依赖）。
 * 用于「爆火榜」等需要动态小火苗的位置。prefers-reduced-motion 下静止。
 */
export function FlameIcon({ size = 16, className }: { size?: number; className?: string }) {
  // lucide flame 轮廓，分外焰 + 内焰两层，各自不同相位跳动，形成有机火苗感
  const FLAME_PATH =
    'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'
  return (
    <span className={cn('mg-flame', className)} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
        <defs>
          <linearGradient id="mgFlameBody" x1="12" y1="23" x2="12" y2="2" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#f97316" />
            <stop offset="0.55" stopColor="#fb923c" />
            <stop offset="1" stopColor="#fde047" />
          </linearGradient>
          <linearGradient id="mgFlameCore" x1="12" y1="22" x2="12" y2="8" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fbbf24" />
            <stop offset="1" stopColor="#fff7cc" />
          </linearGradient>
        </defs>
        <path className="mg-flame__body" fill="url(#mgFlameBody)" d={FLAME_PATH} />
        <path className="mg-flame__core" fill="url(#mgFlameCore)" d={FLAME_PATH} />
      </svg>
    </span>
  )
}
