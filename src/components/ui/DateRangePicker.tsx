import React, { useState } from 'react'
import { Popover } from './Popover'
import { Button } from './Button'
import { LuCalendar, LuChevronRight } from 'react-icons/lu'
import { cn } from '@/lib/utils'

export interface DateRangeValue {
  startDate?: string // 格式: YYYY-MM-DD
  endDate?: string   // 格式: YYYY-MM-DD
  preset?: string    // 预设: 'all' | '1h' | '24h' | '7d' | '30d' | 'custom'
}

export interface DateRangePreset {
  key: string
  label: string
}

interface DateRangePickerProps {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  placeholder?: string
  className?: string
  presets?: DateRangePreset[]
  customLabel?: string
  customTitle?: string
  hideStartDate?: boolean
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  value,
  onChange,
  placeholder = '选择时间范围',
  className,
  presets,
  customLabel,
  customTitle,
  hideStartDate = false
}) => {
  const defaultPresets = [
    { key: 'all', label: '全部时间' },
    { key: '1h', label: '近 1 小时' },
    { key: '24h', label: '近 24 小时' },
    { key: '7d', label: '近 7 天' },
    { key: '30d', label: '近 30 天' },
    { key: 'custom', label: '自定义范围' }
  ]
  const activePresets = presets || defaultPresets

  const [activePreset, setActivePreset] = useState<string>(value.preset || activePresets[0]?.key || 'all')
  const [customStart, setCustomStart] = useState<string>(value.startDate || '')
  const [customEnd, setCustomEnd] = useState<string>(value.endDate || '')

  // Custom inline calendar state
  const [currentYear, setCurrentYear] = useState(() => {
    const dStr = value.endDate || value.startDate
    if (dStr) {
      const d = new Date(dStr)
      if (!isNaN(d.getTime())) return d.getFullYear()
    }
    return new Date().getFullYear()
  })
  const [currentMonth, setCurrentMonth] = useState(() => {
    const dStr = value.endDate || value.startDate
    if (dStr) {
      const d = new Date(dStr)
      if (!isNaN(d.getTime())) return d.getMonth()
    }
    return new Date().getMonth()
  })

  // 外部 value 变化时在渲染期同步内部状态（react.dev: adjusting state when a prop changes）
  // 按字段比较而非对象引用，避免父组件每次渲染新建对象导致死循环
  const [prevValue, setPrevValue] = useState(value)
  if (
    value.preset !== prevValue.preset ||
    value.startDate !== prevValue.startDate ||
    value.endDate !== prevValue.endDate
  ) {
    setPrevValue(value)
    if (value.preset) setActivePreset(value.preset)
    if (value.startDate) setCustomStart(value.startDate)
    if (value.endDate) setCustomEnd(value.endDate)
  }

  const getDisplayText = () => {
    if (activePreset !== 'custom') {
      return activePresets.find(p => p.key === activePreset)?.label || placeholder
    }
    if (hideStartDate && customEnd) {
      return customEnd
    }
    if (customStart && customEnd) {
      return `${customStart} 至 ${customEnd}`
    }
    return placeholder
  }

  const handlePresetSelect = (key: string, close: () => void) => {
    setActivePreset(key)
    if (key !== 'custom') {
      onChange({ preset: key })
      close() // 选中非自定义预设即收起弹层
    }
  }

  const handleApplyCustom = (close: () => void) => {
    if (!customStart || !customEnd) return
    onChange({
      preset: 'custom',
      startDate: customStart,
      endDate: customEnd
    })
    close()
  }

  // Inline calendar calculations
  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
  const getFirstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay()

  const handleDateClick = (dateStr: string) => {
    if (hideStartDate) {
      if (dateStr < customStart) return // Prevent selecting past dates
      setCustomEnd(dateStr)
    } else {
      if (!customStart || (customStart && customEnd)) {
        setCustomStart(dateStr)
        setCustomEnd('')
      } else {
        if (dateStr < customStart) {
          setCustomStart(dateStr)
        } else {
          setCustomEnd(dateStr)
        }
      }
    }
  }

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear(y => y - 1)
    } else {
      setCurrentMonth(m => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear(y => y + 1)
    } else {
      setCurrentMonth(m => m + 1)
    }
  }

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentYear, currentMonth)
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth)
    const cells: React.ReactNode[] = []

    // Empty spaces for previous month's trailing days
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="h-[var(--mg-calendar-cell-size)] w-[var(--mg-calendar-cell-size)]" />)
    }

    // Days grid
    for (let day = 1; day <= daysInMonth; day++) {
      const monthStr = String(currentMonth + 1).padStart(2, '0')
      const dayStr = String(day).padStart(2, '0')
      const dateStr = `${currentYear}-${monthStr}-${dayStr}`

      const isSelected = hideStartDate
        ? customEnd === dateStr
        : (customStart === dateStr || customEnd === dateStr)

      const isInRange = !hideStartDate && customStart && customEnd && dateStr > customStart && dateStr < customEnd
      const isDisabled = hideStartDate && dateStr < customStart

      cells.push(
        <button
          key={`day-${day}`}
          type="button"
          disabled={isDisabled}
          onClick={() => handleDateClick(dateStr)}
          className={cn(
            "h-[var(--mg-calendar-cell-size)] w-[var(--mg-calendar-cell-size)] rounded-lg mg-compact-badge transition-all flex items-center justify-center cursor-pointer active:scale-95",
            isSelected && "bg-brand-base text-white shadow-sm shadow-brand-glow",
            isInRange && "bg-brand-base/15 text-brand-base rounded-none",
            !isSelected && !isInRange && !isDisabled && "text-mg-text-1 hover:bg-mg-fill-0/40",
            isDisabled && "text-mg-text-3/40 cursor-not-allowed opacity-30"
          )}
        >
          {day}
        </button>
      )
    }

    const weekDays = ['日', '一', '二', '三', '四', '五', '六']

    return (
      <div className="flex flex-col gap-2 w-full select-none">
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-[var(--mg-space-1)] rounded-lg hover:bg-mg-fill-0 text-mg-text-3 hover:text-mg-text-1 cursor-pointer mg-text-caption"
          >
            &lt;
          </button>
          <span className="mg-compact-badge text-mg-text-1">
            {currentYear}年 {currentMonth + 1}月
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-[var(--mg-space-1)] rounded-lg hover:bg-mg-fill-0 text-mg-text-3 hover:text-mg-text-1 cursor-pointer mg-text-caption"
          >
            &gt;
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {weekDays.map(w => (
            <span key={w} className="mg-compact-badge text-mg-text-3">{w}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {cells}
        </div>
      </div>
    )
  }

  const isCustomActive = activePreset === 'custom'

  const renderPanel = (close: () => void) => (
    <div className={cn('flex gap-0 text-left', isCustomActive ? 'w-[460px]' : 'w-[140px]')}>
      {/* Preset List */}
      <div className={cn(
        'flex flex-col gap-0.5 shrink-0',
        isCustomActive ? 'pr-3 mr-3 border-r border-mg-border/50 w-[108px]' : 'w-full'
      )}>
        <span className="mg-text-label text-mg-text-3 mb-1.5 px-[var(--mg-control-px-xs)]">{customTitle || '常用时间'}</span>
        {activePresets.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => handlePresetSelect(p.key, close)}
            className={cn(
              "px-[var(--mg-control-px-xs)] py-1.5 rounded-lg mg-compact-badge text-left cursor-pointer transition-colors",
              activePreset === p.key
                ? "bg-brand-selected-bg text-brand-base"
                : "text-mg-text-2 hover:text-mg-text-1 hover:bg-mg-fill-1"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom Area：仅选中「自定义范围」时展开，切回其他预设自动收起 */}
      {isCustomActive && (
      <div className="flex-1 flex flex-col gap-2.5 min-w-0">
        <span className="mg-text-label text-mg-text-3">{customLabel || '自定义日期区间'}</span>

        {/* Selected preview bar — 轻量纯文本 */}
        <div className="flex items-center justify-between gap-2 px-[var(--mg-control-px-xs)] py-[var(--mg-space-1)] rounded-lg bg-mg-fill-1 mg-text-caption font-semibold text-mg-text-2">
          {hideStartDate ? (
            <span className={customEnd ? 'text-mg-text-1' : 'text-mg-text-4'}>
              截止: {customEnd || '请在下方选择'}
            </span>
          ) : (
            <>
              <span className={customStart ? 'text-mg-text-1 font-bold' : 'text-mg-text-4'}>
                始: {customStart || '待选择'}
              </span>
              <span className="text-mg-text-4">→</span>
              <span className={customEnd ? 'text-mg-text-1 font-bold' : 'text-mg-text-4'}>
                终: {customEnd || '待选择'}
              </span>
            </>
          )}
        </div>

        {/* 日历 — 去掉外层边框 */}
        <div className="pt-0.5">
          {renderCalendar()}
        </div>

        <Button
          variant="brand"
          disabled={hideStartDate ? !customEnd : (!customStart || !customEnd)}
          onClick={() => handleApplyCustom(close)}
          className="mg-control-sm mg-compact-badge !rounded-lg w-full flex items-center justify-center gap-1 cursor-pointer"
        >
          确定应用 <LuChevronRight size={13} />
        </Button>
      </div>
      )}
    </div>
  )

  const triggerButton = (
    <button
      type="button"
      className={cn(
        "group flex items-center gap-2 px-[var(--mg-control-px-md)] py-[var(--mg-control-py-sm)] border border-mg-border/70 rounded-full bg-mg-fill-0/20 hover:bg-mg-fill-0/40 mg-text-body font-bold text-mg-text-2 hover:text-mg-text-1 hover:border-brand-mid transition-all duration-300 shadow-inner select-none active:scale-[0.97]",
        className
      )}
    >
      <LuCalendar size={14} className="text-brand-base group-hover:scale-110 transition-transform duration-300" />
      <span className="truncate max-w-[200px]">{getDisplayText()}</span>
    </button>
  )

  return (
    <Popover
      trigger={triggerButton}
      content={renderPanel}
      position="bottom"
      className="!w-auto mg-panel"
    />
  )
}
