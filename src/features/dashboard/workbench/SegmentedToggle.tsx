import type { ReactNode } from 'react'

/** 分段切换控件（视图/粒度/指标切换共用），控制台尺度紧凑样式 */
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
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs'
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={[
        'inline-flex items-center gap-1 rounded-lg border border-mg-border bg-mg-fill-0 p-1',
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
              'inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition-colors cursor-pointer whitespace-nowrap',
              pad,
              active
                ? 'bg-mg-bg-0 text-brand-base shadow-sm'
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
