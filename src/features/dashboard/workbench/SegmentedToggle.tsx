import type { ReactNode } from 'react'

/**
 * 分段切换控件（视图/粒度/指标切换共用），控制台尺度紧凑样式。
 *
 * 尺寸与形状全部走 design-tokens 的 --mg-segmented-*（0.9.0 起库里有完整 15 个），
 * 不再用 Tailwind 刻度 —— 设计改库里的分段控件规格，这里自动跟随。
 *
 * ⚠️ 颜色类仍用 Tailwind 主题类（bg-mg-fill-0 / text-mg-text-3 …）而不是 bg-[var(--mg-segmented-bg)]：
 * 那几个 token 的值是 color-mix()，用任意值语法引会被算成 transparent（Table 行 hover 踩过
 * 这个坑，见 ui/Table.tsx 注释）。值本来就相同（--mg-segmented-bg = var(--mg-fill-0)），
 * 等库 token 注册进 @theme 后再统一换成 token 类。
 */
interface Option<T extends string> {
  value: T
  label: string
  /** 可选前置图标（如主题的日/月/屏图标）；不传则纯文字 */
  icon?: ReactNode
}

export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  ariaLabel,
  className,
}: {
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  ariaLabel?: string
  className?: string
}) {
  // 高度与横向内边距按 size 走规范档：sm 28px/10px、md 32px/12px（原 px-2.5·px-3 同值，
  // 高度此前由 py 间接决定、没有确定值，现在收口到 token）
  const sizing =
    size === 'sm'
      ? 'h-[var(--mg-segmented-item-height-sm)] px-[var(--mg-segmented-item-pad-x-sm)] text-xs'
      : 'h-[var(--mg-segmented-item-height-md)] px-[var(--mg-segmented-item-pad-x-md)] text-xs'
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={[
        'inline-flex items-center gap-[var(--mg-segmented-gap)] rounded-[var(--mg-segmented-radius)]',
        'border border-mg-border bg-mg-fill-0 p-[var(--mg-segmented-pad)]',
        className ?? '',
      ].join(' ')}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(opt.value)}
            className={[
              'inline-flex items-center justify-center gap-1.5 rounded-[var(--mg-segmented-item-radius)]',
              'font-semibold transition-colors cursor-pointer whitespace-nowrap',
              sizing,
              active
                ? 'bg-mg-bg-0 text-brand-base shadow-[var(--mg-segmented-active-shadow)]'
                : 'text-mg-text-3 hover:text-mg-text-1',
            ].join(' ')}
          >
            {opt.icon}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
