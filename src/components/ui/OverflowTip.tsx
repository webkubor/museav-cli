import { useRef, useState } from 'react'
import type * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface OverflowTipProps {
  text: string
  className?: string
  /**
   * 多行省略场景（外部 CSS 打了 `-webkit-line-clamp`）：把测量轴从宽换成高。
   * 多行文本横向是不溢出的（它会换行），scrollWidth 永远等于 clientWidth，
   * 单行那套判定在这里恒为「没截断」，气泡永远不冒。
   */
  multiline?: boolean
  /**
   * 渲染成哪个标签，默认 span。
   * ⚠️ multiline 场景必须让本组件渲染**产生截断的那个元素本身**（如 `as="p"`），
   * 不能在外面套一层再把它塞进去 —— 剪裁发生在外层，量内层永远是「没截断」。
   */
  as?: 'span' | 'p' | 'strong'
}

/**
 * 省略文本 + 悬停气泡显全文（气泡样式与 InfoTip 同一套 token）。
 * 与 TruncatedText 的区别：那边是原生 title（数据表场景够用），这里是真气泡 ——
 * 且只在文本真的被截断时才冒（mouseenter 时量），没截断不打扰。
 * 气泡走 portal 挂 body：规格值嵌在 .mg-tile 卡片里，卡片有 overflow 剪裁 +
 * hover transform（transform 会劫持 fixed 的包含块），absolute/fixed 内联都会被剪。
 * 精选轮播的 slide 同时有 overflow:hidden 与 translateX/scale，同一个理由。
 */
export function OverflowTip({ text, className, multiline, as: Tag = 'span' }: OverflowTipProps) {
  const ref = useRef<HTMLElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  const show = () => {
    const el = ref.current
    if (!el) return
    const clipped = multiline
      ? el.scrollHeight > el.clientHeight + 1
      : el.scrollWidth > el.clientWidth + 1
    if (!clipped) return
    const r = el.getBoundingClientRect()
    setPos({ x: r.left + r.width / 2, y: r.top - 6 })
  }

  return (
    <Tag
      ref={ref as React.Ref<never>}
      // 多行不能加 whitespace-nowrap（那就不换行了），截断交给外部的 line-clamp
      className={cn(
        'min-w-0 overflow-hidden',
        !multiline && 'text-ellipsis whitespace-nowrap',
        className,
      )}
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
    </Tag>
  )
}
