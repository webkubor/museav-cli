/**
 * 小标签行折叠后的「+N」计数标签：悬停/键盘聚焦冒气泡列出被折叠的项。
 * 可体验任务与 API 协议共用（外观由调用方给 className 决定，行为一致）。
 *
 * 每项的配色不在这里定，由调用方给来源那一行的 class（协议 .mg-proto、任务
 * .mg-task-tip-item）——气泡是另一层表面，但标签得和卡片/详情里是同一个颜色。
 *
 * 气泡里也按 tag 逐个排（不是逗号串成一段话）：这一行本来就是标签，串成
 * 「OpenAI Responses, OpenAI Images, OpenAI Image Edits, Anthropic Messages」两行文字
 * 时既看不出边界、也和触发它的标签行对不上（需求方 2026-08-27 反馈观感差）。
 * aria-label 仍保留分隔符串好的整句 —— 读屏要的是一句连读，不是四个孤立词。
 *
 * 气泡走 portal 挂 body，与 OverflowTip 同一套 token 与理由 —— 标签嵌在 .mg-tile
 * 卡片里，卡片有 overflow 剪裁 + hover transform（transform 会劫持 fixed 的包含块），
 * absolute/fixed 内联都会被剪掉。
 */
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

export function TagOverflowChip({
  hidden,
  className,
  itemClassName,
}: {
  hidden: string[]
  className: string
  /** 气泡内每项的 class。给来源那一行的同一个 class，配色才与卡片/详情一致。 */
  itemClassName: string
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const text = hidden.join(t('modelsExperience.listSeparator'))

  const show = () => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ x: r.left + r.width / 2, y: r.top - 6 })
  }

  return (
    <span
      ref={ref}
      role="img"
      tabIndex={0}
      aria-label={text}
      className={className}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      onFocus={show}
      onBlur={() => setPos(null)}
    >
      +{hidden.length}
      {pos && createPortal(
        <span
          role="tooltip"
          style={{ left: pos.x, top: pos.y }}
          className="mg-tag-tip pointer-events-none fixed z-[var(--mg-z-tooltip)] w-max max-w-[300px] -translate-x-1/2 -translate-y-full rounded-[var(--mg-tooltip-radius)] border border-mg-border bg-mg-bg-3 px-[var(--mg-tooltip-pad-x)] py-[var(--mg-tooltip-pad-y)] text-left mg-text-caption font-medium leading-snug text-mg-text-2 shadow-lg"
        >
          {hidden.map((label) => <span key={label} className={itemClassName}>{label}</span>)}
        </span>,
        document.body,
      )}
    </span>
  )
}
