import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { IoChevronDown, IoCheckmark } from 'react-icons/io5'
import { LuSearch } from 'react-icons/lu'
import Popover from '@/components/ui/Popover'
import { cn } from '@/lib/utils'

/**
 * 可搜索单选下拉（需求方#663：调用日志筛选框支持搜索）
 * 职责：视觉对齐 Select（触发器/选项样式同源 token），面板顶部带搜索框实时过滤选项。
 * 不基于 Radix Select 扩展：其 typeahead 会抢占面板内输入框键盘事件，且过滤卸载选中项后
 * SelectValue 会丢失回显文本，故用自研 Popover 组合实现。
 */

export interface ComboboxOption {
  value: string
  label: string
  /** 额外参与搜索匹配的隐藏关键字（如 model_id、邮箱、掩码 key） */
  keywords?: string
}

interface ComboboxProps {
  value?: string
  onChange?: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  /** 埋点/可测性：透传到触发器（值 = 埋点 event key），供自动化定位 */
  'data-track'?: string
}

const triggerClass =
  'flex h-[var(--mg-control-h-md)] w-full items-center justify-between rounded-[var(--mg-control-radius)] border border-mg-border bg-mg-fill-0 px-[var(--mg-control-px-sm)] mg-text-body outline-none transition-all duration-200 text-mg-text-1 hover:border-brand-mid/50 focus:border-brand-base focus:shadow-[var(--mg-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50'

function ComboboxPanel({
  options,
  value,
  onSelect,
  width,
}: {
  options: ComboboxOption[]
  value?: string
  onSelect: (value: string) => void
  width: number
}) {
  const { t } = useTranslation()
  const [query, setQuery] = React.useState('')
  const [activeIndex, setActiveIndex] = React.useState(0)
  const listRef = React.useRef<HTMLDivElement>(null)

  const keyword = query.trim().toLowerCase()
  const filtered = keyword
    ? options.filter(
        (option) =>
          option.label.toLowerCase().includes(keyword) ||
          (option.keywords ?? '').toLowerCase().includes(keyword)
      )
    : options

  const clampedActive = Math.min(activeIndex, Math.max(filtered.length - 1, 0))

  const scrollActiveIntoView = (index: number) => {
    listRef.current?.children[index]?.scrollIntoView({ block: 'nearest' })
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const next = Math.min(clampedActive + 1, filtered.length - 1)
      setActiveIndex(next)
      scrollActiveIntoView(next)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      const next = Math.max(clampedActive - 1, 0)
      setActiveIndex(next)
      scrollActiveIntoView(next)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const active = filtered[clampedActive]
      if (active) onSelect(active.value)
    }
  }

  return (
    <div style={{ width }} className="p-[var(--mg-menu-padding)]">
      <div className="flex items-center gap-2 border-b border-mg-border/60 px-2 pb-2">
        <LuSearch className="h-4 w-4 shrink-0 text-mg-text-3" />
        <input
          autoFocus
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }}
          onKeyDown={handleKeyDown}
          placeholder={t('common.combobox.searchPlaceholder')}
          className="h-7 w-full bg-transparent mg-text-body text-mg-text-1 outline-none placeholder:text-mg-text-3/70"
        />
      </div>
      <div ref={listRef} className="mt-1 max-h-60 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-2 py-3 text-center mg-text-caption text-mg-text-3">
            {t('common.combobox.empty')}
          </div>
        ) : (
          filtered.map((option, index) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                'relative flex w-full cursor-default select-none items-center rounded-[var(--mg-radius-sm)] py-[var(--mg-menu-item-py)] pl-8 pr-2 text-left mg-text-body text-mg-text-2 outline-none transition-colors duration-150',
                index === clampedActive && 'bg-mg-fill-0 text-mg-text-1'
              )}
            >
              <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                {option.value === value && <IoCheckmark className="h-4 w-4 text-brand-base" />}
              </span>
              <span className="line-clamp-1">{option.label}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

const Combobox: React.FC<ComboboxProps> = ({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  'data-track': dataTrack,
}) => {
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value)

  const triggerButton = (isDisabled?: boolean) => (
    <button type="button" disabled={isDisabled} className={cn(triggerClass, className)} data-track={dataTrack}>
      <span className={cn('line-clamp-1 text-left', !selected && 'text-mg-text-3/70')}>
        {selected?.label ?? placeholder}
      </span>
      <IoChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </button>
  )

  if (disabled || options.length === 0) {
    return triggerButton(true)
  }

  return (
    <div ref={wrapRef} className="w-full">
      <Popover
        trigger={triggerButton()}
        content={(close) => (
          <ComboboxPanel
            options={options}
            value={value}
            width={Math.max(wrapRef.current?.offsetWidth ?? 0, 220)}
            onSelect={(next) => { onChange?.(next); close() }}
          />
        )}
      />
    </div>
  )
}

export default Combobox
