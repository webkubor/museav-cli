import React, { useState, useEffect } from 'react'
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

  useEffect(() => {
    if (value.preset) setActivePreset(value.preset)
    if (value.startDate) setCustomStart(value.startDate)
    if (value.endDate) setCustomEnd(value.endDate)
  }, [value])

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

  const handlePresetSelect = (key: string) => {
    setActivePreset(key)
    if (key !== 'custom') {
      onChange({ preset: key })
    }
  }

  const handleApplyCustom = () => {
    if (!customStart || !customEnd) return
    onChange({
      preset: 'custom',
      startDate: customStart,
      endDate: customEnd
    })
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
      cells.push(<div key={`empty-${i}`} className="h-7 w-7" />)
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
            "h-7 w-7 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer active:scale-95",
            isSelected && "bg-brand-base text-white shadow-sm shadow-brand-glow",
            isInRange && "bg-brand-base/15 text-brand-base rounded-none",
            !isSelected && !isInRange && !isDisabled && "text-mg-text-0 hover:bg-mg-fill-0/40",
            isDisabled && "text-mg-text-2/40 cursor-not-allowed opacity-30"
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
            className="p-1 rounded-lg hover:bg-mg-fill-0 text-mg-text-2 hover:text-mg-text-0 cursor-pointer text-xs"
          >
            &lt;
          </button>
          <span className="text-xs font-bold text-mg-text-0">
            {currentYear}年 {currentMonth + 1}月
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1 rounded-lg hover:bg-mg-fill-0 text-mg-text-2 hover:text-mg-text-0 cursor-pointer text-xs"
          >
            &gt;
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {weekDays.map(w => (
            <span key={w} className="text-[10px] font-bold text-mg-text-2">{w}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {cells}
        </div>
      </div>
    )
  }

  const presetList = (
    <div className="flex flex-col md:flex-row gap-4 w-[280px] md:w-[480px] text-left">
      {/* Preset List */}
      <div className="flex flex-col gap-1 pr-0 md:pr-4 border-b md:border-b-0 md:border-r border-mg-border/40 pb-3 md:pb-0 shrink-0 w-full md:w-36">
        <span className="text-[10px] font-bold text-mg-text-2 uppercase tracking-wider mb-1 px-2">{customTitle || '常用时间'}</span>
        {activePresets.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => handlePresetSelect(p.key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold text-left cursor-pointer transition-all active:scale-[0.98]",
              activePreset === p.key
                ? "bg-brand-selected-bg text-brand-base"
                : "text-mg-text-1 hover:text-mg-text-0 hover:bg-mg-fill-0/40"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom Area */}
      <div className="flex-1 flex flex-col gap-3 pt-1 w-full min-w-[220px]">
        <span className="text-[10px] font-bold text-mg-text-2 uppercase tracking-wider mb-1">{customLabel || '自定义日期区间'}</span>
        
        {/* Selected preview bar */}
        <div className="text-[11px] font-semibold text-brand-base bg-brand-base/5 border border-brand-base/20 rounded-lg px-2.5 py-1.5 flex flex-col gap-0.5">
          {hideStartDate ? (
            <span>截止时间: {customEnd ? <span className="font-bold">{customEnd}</span> : '请在下方选择'}</span>
          ) : (
            <div className="flex justify-between items-center text-[10.5px]">
              <span>始: {customStart ? <span className="font-bold">{customStart}</span> : '待选择'}</span>
              <span>至</span>
              <span>终: {customEnd ? <span className="font-bold">{customEnd}</span> : '待选择'}</span>
            </div>
          )}
        </div>

        {/* Inline Custom Calendar Grid */}
        <div className="border border-mg-border/40 rounded-xl p-2.5 bg-mg-fill-0/10">
          {renderCalendar()}
        </div>

        <Button
          variant="brand"
          disabled={activePreset !== 'custom' || (hideStartDate ? !customEnd : (!customStart || !customEnd))}
          onClick={handleApplyCustom}
          className="mt-1 h-8 text-xs font-bold !rounded-lg w-full flex items-center justify-center gap-1 cursor-pointer"
        >
          确定应用 <LuChevronRight size={13} />
        </Button>
      </div>
    </div>
  )

  const triggerButton = (
    <button
      type="button"
      className={cn(
        "group flex items-center gap-2 px-4 py-2 border border-mg-border/70 rounded-full bg-mg-fill-0/20 hover:bg-mg-fill-0/40 text-[13px] font-bold text-mg-text-1 hover:text-mg-text-0 hover:border-brand-mid transition-all duration-300 shadow-inner select-none active:scale-[0.97]",
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
      content={presetList}
      position="bottom"
      className="!w-auto !p-4"
    />
  )
}
