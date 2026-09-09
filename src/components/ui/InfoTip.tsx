import { LuInfo } from 'react-icons/lu'
import { cn } from '@/lib/utils'

/**
 * 字段说明 ⓘ 小图标 + hover/focus 气泡（对齐 PRD 原型：部分字段后带 Info 提示）。
 * 纯 CSS group-hover，无依赖；放在 label/标题后即可。文案以 PRD 为准。
 */
export function InfoTip({
  text,
  className,
  side = 'top',
}: {
  text: string
  className?: string
  /** 气泡方位：默认 top */
  side?: 'top' | 'bottom'
}) {
  return (
    <span className={cn('group relative inline-flex align-middle', className)}>
      {/* 触发器用 span（非 button）：可安全嵌在 button/可点卡片内不违反 HTML 嵌套；
          stopPropagation 防止点 ⓘ 误触父级点击 */}
      <span
        role="button"
        tabIndex={0}
        aria-label={text}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex cursor-help text-mg-text-3 outline-none transition-colors hover:text-mg-text-2 focus-visible:text-mg-text-2"
      >
        <LuInfo className="h-3.5 w-3.5" />
      </span>
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-[var(--mg-z-tooltip)] w-max max-w-[260px] -translate-x-1/2 rounded-[var(--mg-tooltip-radius)] border border-mg-border bg-mg-bg-3 px-[var(--mg-tooltip-pad-x)] py-[var(--mg-tooltip-pad-y)] text-left mg-text-caption font-medium leading-snug text-mg-text-2 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100',
          side === 'top' ? 'bottom-6' : 'top-6',
        )}
      >
        {text}
      </span>
    </span>
  )
}
