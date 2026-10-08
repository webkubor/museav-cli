import type { ReactNode } from 'react'
import { LuInfo } from 'react-icons/lu'
import { cn } from '@/lib/utils'

/**
 * 字段说明 ⓘ 小图标 + hover/focus 气泡（对齐 PRD 原型：部分字段后带 Info 提示）。
 * 纯 CSS group-hover，无依赖；放在 label/标题后即可。文案以 PRD 为准。
 * 传 `children` 时改用它当触发器（如按钮的悬停说明），气泡样式与 ⓘ 同一套；
 * 此时给触发器自己加 `aria-describedby={id}` 关联气泡。
 */
export function InfoTip({
  text,
  className,
  side = 'top',
  align = 'center',
  onReveal,
  children,
  id,
}: {
  text: string
  /** 自定义触发器（不传则为 ⓘ 图标）。触发器自己负责可聚焦与点击行为 */
  children?: ReactNode
  /** 气泡元素 id，供自定义触发器 aria-describedby 关联 */
  id?: string
  className?: string
  /** 气泡方位：默认 top */
  side?: 'top' | 'bottom'
  /**
   * 气泡横向对齐：默认 center（相对触发器居中）。
   * 触发器贴近视口/容器右边缘时用 'end' 右对齐，否则居中气泡的右半边会溢出，
   * 把整页撑出横向滚动条（模型发现页最右列摘要卡实测溢出 26px）。
   */
  align?: 'center' | 'end'
  /**
   * 气泡被展开时回调（hover 进入 / 键盘聚焦各触发一次）—— 给需要埋点的调用方用，
   * 不传就是纯展示、行为与从前一致。**去重由调用方做**：同一个 ⓘ 反复 hover 会反复回调，
   * 组件不假设你想报几次（prd#1007 的 benchmark_tooltip_view 是每项每页只报一次）。
   */
  onReveal?: () => void
}) {
  return (
    <span className={cn('group relative inline-flex align-middle', className)}>
      {/* 触发器用 span（非 button）：可安全嵌在 button/可点卡片内不违反 HTML 嵌套；
          stopPropagation 防止点 ⓘ 误触父级点击 */}
      {children ?? (
        <span
          role="button"
          tabIndex={0}
          aria-label={text}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={onReveal}
          onFocus={onReveal}
          className="inline-flex cursor-help text-mg-text-3 outline-none transition-colors hover:text-mg-text-2 focus-visible:text-mg-text-2"
        >
          <LuInfo className="h-3.5 w-3.5" />
        </span>
      )}
      <span
        role="tooltip"
        id={id}
        className={cn(
          // 表面统一走 mg-float（同 Popover / Dialog 一档玻璃），不再单写 bg-mg-bg-3 + shadow-lg
          'pointer-events-none absolute z-[var(--mg-z-tooltip)] w-max max-w-[260px] rounded-[var(--mg-tooltip-radius)] mg-float px-[var(--mg-tooltip-pad-x)] py-[var(--mg-tooltip-pad-y)] text-left mg-text-caption font-medium leading-snug text-mg-text-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100',
          // ⓘ 是纯说明，聚焦即展开；自定义触发器多为按钮，只在键盘聚焦（focus-visible）时展开——
          // 否则鼠标点完按钮焦点还在，提示会一直挂着（对齐原型 .space-card-default-action:focus-visible）
          children ? 'invisible -translate-y-0.5 transition-[opacity,transform,visibility] group-hover:visible group-hover:translate-y-0 group-has-[:focus-visible]:visible group-has-[:focus-visible]:translate-y-0 group-has-[:focus-visible]:opacity-100' : 'group-focus-within:opacity-100',
          // ⓘ 图标高 14px，沿用固定偏移；自定义触发器高度不定，贴着触发器边缘
          children ? (side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5') : (side === 'top' ? 'bottom-6' : 'top-6'),
          align === 'center' ? 'left-1/2 -translate-x-1/2' : 'right-0',
        )}
      >
        {text}
      </span>
    </span>
  )
}
