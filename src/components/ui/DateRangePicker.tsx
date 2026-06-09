import React, { useState, useEffect } from 'react'
import { Popover } from './Popover'
import { Input } from './Input'
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

  const presetList = (
    <div className="flex flex-col md:flex-row gap-4 w-[280px] md:w-[480px] text-left">
      {/* 预设列表 */}
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

      {/* 自定义区域 */}
      <div className="flex-1 flex flex-col gap-3.5 pt-1">
        <span className="text-[10px] font-bold text-mg-text-2 uppercase tracking-wider">{customLabel || '自定义日期区间'}</span>
        <div className="flex flex-col gap-2">
          {!hideStartDate && (
            <div className="flex flex-col gap-1">
              <span className="text-[10.5px] font-semibold text-mg-text-1">起始日期</span>
              <Input
                type="date"
                value={customStart}
                disabled={activePreset !== 'custom'}
                onChange={e => setCustomStart(e.target.value)}
                className="bg-mg-fill-0/20 font-medium h-9 text-xs"
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-[10.5px] font-semibold text-mg-text-1">
              {hideStartDate ? '截止日期（失效时间）' : '截止日期'}
            </span>
            <Input
              type="date"
              value={customEnd}
              disabled={activePreset !== 'custom'}
              min={hideStartDate ? customStart : undefined}
              onChange={e => setCustomEnd(e.target.value)}
              className="bg-mg-fill-0/20 font-medium h-9 text-xs"
            />
          </div>
        </div>
        <Button
          variant="brand"
          disabled={activePreset !== 'custom' || !customStart || !customEnd}
          onClick={handleApplyCustom}
          className="mt-auto h-8 text-xs font-bold !rounded-lg w-full flex items-center justify-center gap-1"
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
