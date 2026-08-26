import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

/**
 * 单行省略文本 + 悬停气泡显全文（气泡样式与 InfoTip 同一套 token）。
 * 与 TruncatedText 的区别：那边是原生 title（数据表场景够用），这里是真气泡 ——
 * 且只在文本真的被截断时才冒（mouseenter 时量 scrollWidth），没截断不打扰。
 * 气泡走 portal 挂 body：规格值嵌在 .mg-tile 卡片里，卡片有 overflow 剪裁 +
 * hover transform（transform 会劫持 fixed 的包含块），absolute/fixed 内联都会被剪。
 */
export function OverflowTip({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  const show = () => {
    const el = ref.current
    if (!el || el.scrollWidth <= el.clientWidth + 1) return
    const r = el.getBoundingClientRect()
    setPos({ x: r.left + r.width / 2, y: r.top - 6 })
  }

  return (
    <span
      ref={ref}
      className={cn('min-w-0 overflow-hidden text-ellipsis whitespace-nowrap', className)}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
    >
      {text}
      {pos && createPortal(
        <span
          role="tooltip"
          style={{ left: pos.x, top: pos.y }}
          className="pointer-events-none fixed z-[var(--mg-z-tooltip)] w-max max-w-[300px] -translate-x-1/2 -translate-y-full whitespace-normal rounded-[var(--mg-tooltip-radius)] border border-mg-border bg-mg-bg-3 px-[var(--mg-tooltip-pad-x)] py-[var(--mg-tooltip-pad-y)] text-left mg-text-caption font-medium leading-snug text-mg-text-2 shadow-lg"
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  )
}
