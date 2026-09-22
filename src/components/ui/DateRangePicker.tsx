import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Popover } from './Popover'
import { Button } from './Button'
import { Calendar } from './Calendar'
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
  placeholder,
  className,
  presets,
  customLabel,
  customTitle,
  hideStartDate = false
}) => {
  const { t } = useTranslation()
  const placeholderText = placeholder ?? t('common.dateRange.placeholder')
  const defaultPresets = [
    { key: 'all', label: t('common.dateRange.all') },
    { key: '1h', label: t('common.dateRange.last1h') },
    { key: '24h', label: t('common.dateRange.last24h') },
    { key: '7d', label: t('common.dateRange.last7d') },
    { key: '30d', label: t('common.dateRange.last30d') },
    { key: 'custom', label: t('common.dateRange.custom') }
  ]
  const activePresets = presets || defaultPresets

  const [activePreset, setActivePreset] = useState<string>(value.preset || activePresets[0]?.key || 'all')
  const [customStart, setCustomStart] = useState<string>(value.startDate || '')
  const [customEnd, setCustomEnd] = useState<string>(value.endDate || '')

  // 月历的「看哪个月」由 Calendar 自己管（初始月取自 defaultDate），这里不再重复一份状态

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
      return activePresets.find(p => p.key === activePreset)?.label || placeholderText
    }
    if (hideStartDate && customEnd) {
      return customEnd
    }
    if (customStart && customEnd) {
      return `${customStart} ${t('common.dateRange.separator')} ${customEnd}`
    }
    return placeholderText
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

  // 日历本体走共用 <Calendar>：这里只提供「哪天选中 / 区间内 / 禁用」的语义，
  // 布局、年月导航、星期表头由 Calendar 统一维护（DateRangePicker 与 DateTimePicker 共用一份）
  const renderCalendar = () => (
    <Calendar
      defaultDate={value.endDate || value.startDate}
      dayState={(dateStr) => ({
        selected: hideStartDate ? customEnd === dateStr : (customStart === dateStr || customEnd === dateStr),
        inRange: Boolean(!hideStartDate && customStart && customEnd && dateStr > customStart && dateStr < customEnd),
        disabled: Boolean(hideStartDate && customStart && dateStr < customStart),
      })}
      onSelectDate={handleDateClick}
    />
  )

  const isCustomActive = activePreset === 'custom'

  const renderPanel = (close: () => void) => (
    <div className={cn('flex gap-0 text-left', isCustomActive ? 'w-[460px]' : 'w-[140px]')}>
      {/* Preset List */}
      <div className={cn(
        'flex flex-col gap-0.5 shrink-0',
        isCustomActive ? 'pr-3 mr-3 border-r border-mg-border/50 w-[108px]' : 'w-full'
      )}>
        <span className="mg-text-label font-semibold text-mg-text-2 mb-1.5 px-[var(--mg-control-pad-x-xs)]">{customTitle || t('common.dateRange.presetsTitle')}</span>
        {activePresets.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => handlePresetSelect(p.key, close)}
            className={cn(
              "px-[var(--mg-control-pad-x-xs)] py-1.5 rounded-lg mg-compact-badge text-left cursor-pointer transition-colors",
              activePreset === p.key
                ? "bg-brand-base/15 text-brand-base font-bold ring-1 ring-brand-base/25"
                : "text-mg-text-1 font-medium hover:text-mg-text-1 hover:bg-mg-fill-1"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom Area：仅选中「自定义范围」时展开，切回其他预设自动收起 */}
      {isCustomActive && (
      <div className="flex-1 flex flex-col gap-2.5 min-w-0">
        <span className="mg-text-label font-semibold text-mg-text-2">{customLabel || t('common.dateRange.customLabel')}</span>

        {/* Selected preview bar — 轻量纯文本 */}
        <div className="flex items-center justify-between gap-2 px-[var(--mg-control-pad-x-xs)] py-[var(--mg-space-1)] rounded-lg border border-brand-base/20 bg-brand-base/5 mg-text-caption font-semibold text-mg-text-1">
          {hideStartDate ? (
            <span className={customEnd ? 'text-mg-text-1' : 'text-mg-text-4'}>
              {t('common.dateRange.deadline')}: {customEnd || t('common.dateRange.selectBelow')}
            </span>
          ) : (
            <>
              <span className={customStart ? 'text-mg-text-1 font-bold' : 'text-mg-text-4'}>
                {t('common.dateRange.start')}: {customStart || t('common.dateRange.pending')}
              </span>
              <span className="text-mg-text-4">→</span>
              <span className={customEnd ? 'text-mg-text-1 font-bold' : 'text-mg-text-4'}>
                {t('common.dateRange.end')}: {customEnd || t('common.dateRange.pending')}
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
          {t('common.dateRange.apply')} <LuChevronRight size={13} />
        </Button>
      </div>
      )}
    </div>
  )

  const triggerButton = (
    <button
      type="button"
      className={cn(
        // 高度与同排 Select/搜索框同档（--mg-control-h-md=40px，2026-09-04 控件统一：
        // 此前靠 py 撑高 ≈36px，与 40px 的 Select 排在一起高低不齐）。
        // 圆角走 pill——它是「带日历图标的筛选芯片」语义，与搜索变体同一语言。
        "group flex items-center gap-2 min-h-[var(--mg-control-h-md)] px-[var(--mg-control-pad-x-md)] border border-mg-border rounded-full bg-mg-fill-0/50 hover:bg-mg-fill-0/70 mg-text-body font-bold text-mg-text-1 hover:text-mg-text-1 hover:border-brand-mid transition-all duration-300 shadow-inner select-none active:scale-[0.97]",
        className
      )}
    >
      <LuCalendar size={14} className="text-brand-base group-hover:scale-110 transition-transform duration-300" />
      <span className="truncate">{getDisplayText()}</span>
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
