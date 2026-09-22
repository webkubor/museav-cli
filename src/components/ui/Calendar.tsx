/**
 * 月历（布局件）—— 年月导航 + 星期表头 + 日格。
 *
 * 只负责「怎么排」，不决定「哪天算选中 / 区间内 / 禁用」：那由调用方的
 * dayState() 给出。这样 DateRangePicker（区间）与 DateTimePicker（单选）
 * 共用同一份日历，不用各画一个 —— 日期控件的样式与可访问性只维护一处。
 *
 * 页面请勿直接使用：日期筛选走 DateRangePicker，日期+时分走 DateTimePicker。
 */
import * as React from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

export interface CalendarDayState {
  selected?: boolean
  inRange?: boolean
  disabled?: boolean
}

export interface CalendarProps {
  /** 初始展示的年月取这个日期（YYYY-MM-DD）；不传用今天 */
  defaultDate?: string
  /** 每天的状态（选中 / 区间内 / 禁用），语义由调用方定 */
  dayState: (date: string) => CalendarDayState
  /** 点击某天；disabled 的日期不会触发 */
  onSelectDate: (date: string) => void
  className?: string
}

/**
 * 手工拆 YYYY-MM-DD 而不是 new Date(value)：后者按 UTC 解析，
 * 在东八区以外会把日期整体挪一天（月历停在错误月份）。
 */
function baseDate(value?: string): Date {
  if (value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  }
  return new Date()
}

export function Calendar({ defaultDate, dayState, onSelectDate, className }: CalendarProps) {
  const { t } = useTranslation()
  const initial = baseDate(defaultDate)
  const [currentYear, setCurrentYear] = React.useState(initial.getFullYear())
  const [currentMonth, setCurrentMonth] = React.useState(initial.getMonth())

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const firstDay = new Date(currentYear, currentMonth, 1).getDay()

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear((y) => y - 1)
    } else {
      setCurrentMonth((m) => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear((y) => y + 1)
    } else {
      setCurrentMonth((m) => m + 1)
    }
  }

  const cells: React.ReactNode[] = []
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`empty-${i}`} className="h-[var(--mg-calendar-cell-size)] w-[var(--mg-calendar-cell-size)]" />)
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    const state = dayState(dateStr)
    cells.push(
      <button
        key={`day-${day}`}
        type="button"
        disabled={state.disabled}
        onClick={() => onSelectDate(dateStr)}
        aria-pressed={state.selected || undefined}
        className={cn(
          "h-[var(--mg-calendar-cell-size)] w-[var(--mg-calendar-cell-size)] rounded-lg mg-compact-badge transition-all flex items-center justify-center cursor-pointer active:scale-95",
          state.selected && "bg-brand-base text-white font-bold shadow-sm shadow-brand-glow",
          state.inRange && "bg-brand-base/15 text-brand-base rounded-none",
          !state.selected && !state.inRange && !state.disabled && "text-mg-text-1 font-medium hover:bg-mg-fill-0/40",
          state.disabled && "text-mg-text-3/60 cursor-not-allowed opacity-40"
        )}
      >
        {day}
      </button>
    )
  }

  const weekDays = [
    t("common.dateRange.weekdays.sun"),
    t("common.dateRange.weekdays.mon"),
    t("common.dateRange.weekdays.tue"),
    t("common.dateRange.weekdays.wed"),
    t("common.dateRange.weekdays.thu"),
    t("common.dateRange.weekdays.fri"),
    t("common.dateRange.weekdays.sat"),
  ]

  return (
    <div className={cn("flex flex-col gap-2 w-full select-none", className)}>
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={handlePrevMonth}
          aria-label={t("common.dateRange.prevMonth")}
          className="p-[var(--mg-space-1)] rounded-lg hover:bg-mg-fill-0 text-mg-text-2 hover:text-mg-text-1 cursor-pointer mg-text-caption"
        >
          &lt;
        </button>
        <span className="mg-compact-badge text-mg-text-1">
          {t("common.dateRange.monthLabel", { year: currentYear, month: currentMonth + 1 })}
        </span>
        <button
          type="button"
          onClick={handleNextMonth}
          aria-label={t("common.dateRange.nextMonth")}
          className="p-[var(--mg-space-1)] rounded-lg hover:bg-mg-fill-0 text-mg-text-2 hover:text-mg-text-1 cursor-pointer mg-text-caption"
        >
          &gt;
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {weekDays.map((w) => (
          <span key={w} className="mg-compact-badge font-semibold text-mg-text-2">{w}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {cells}
      </div>
    </div>
  )
}

export default Calendar
