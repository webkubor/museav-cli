import LottieLib from 'lottie-react'
import { cn } from '@/lib/utils'
import fireAnimation from './fire-lottie.json'

// Vite CJS interop: default import can be the module object in some build scenarios
const Lottie = (typeof LottieLib === 'function'
  ? LottieLib
  : (LottieLib as unknown as { default: typeof LottieLib }).default) as typeof LottieLib

/**
 * 火焰动效图标：用现成 Lottie 火焰动画（fire-lottie.json）。
 * prefers-reduced-motion 下不自动播放（停在首帧，静态火焰）。
 */
export function FlameIcon({ size = 16, className }: { size?: number; className?: string }) {
  const reduce =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <span className={cn('inline-flex shrink-0', className)} style={{ width: size, height: size }} aria-hidden>
      <Lottie
        animationData={fireAnimation}
        loop={!reduce}
        autoplay={!reduce}
        style={{ width: size, height: size }}
      />
    </span>
  )
}
