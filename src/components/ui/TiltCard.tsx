import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useTilt } from '@/hooks/use-tilt'

/**
 * 3D 倾斜卡壳：包住任意卡片内容，鼠标跟随做轻微 3D 倾斜（纯 CSS transform，零依赖、GPU 合成、不掉帧）。
 * 用 flex + h-full 让内层卡片撑满栅格/弹性单元，不改内层卡自身样式（避免和其已有 hover transform 冲突）。
 */
export function TiltCard({ children, className, maxDeg = 6 }: { children: ReactNode; className?: string; maxDeg?: number }) {
  const ref = useTilt<HTMLDivElement>(maxDeg)
  return (
    <div ref={ref} className={cn('mg-tilt flex h-full', className)}>
      {children}
    </div>
  )
}
