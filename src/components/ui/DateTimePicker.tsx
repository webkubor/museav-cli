/**
 * 日期 + 时分选择器（自绘，不使用原生 `<input type="datetime-local">`）。
 *
 * 为什么要有它：原生 datetime-local 的选择面板由**操作系统**渲染 —— 国际站上出的是
 * 浏览器中文控件、半透明、不跟随主题（1.0.6 #456 实测）。而「护栏提额到期时间」
 * 「客服反馈-发生时间」这几处要的恰好是「日期 + 时分」，此前只能退回原生控件。
 * 这里「日期」用共用的 <Calendar>，「时分」用面板内的滚动列 —— 全站一套主题与质感。
 *
 * value / onChange 的字符串沿用原生 datetime-local 的 `YYYY-MM-DDTHH:mm`（本地时区），
 * 调用方的状态与提交契约不用改，只换控件。
 */
import * as React from "react"
import { useTranslation } from "react-i18next"
import { LuCalendar } from "react-icons/lu"
import { Popover } from "./Popover"
import { Input } from "./Input"
import { Button } from "./Button"
import { Calendar } from "./Calendar"
import { cn } from "@/lib/utils"

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"))

export interface DateTimePickerProps {
  /** `YYYY-MM-DDTHH:mm`（本地时区）；空串表示未选 */
  value?: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  "aria-label"?: string
}

function splitValue(value?: string): { date: string; hour: string; minute: string } {
  if (!value) return { date: "", hour: "00", minute: "00" }
  const [date = "", time = ""] = value.split("T")
  const [hour = "00", minute = "00"] = time.split(":")
  return {
    date,
    hour: hour.padStart(2, "0").slice(0, 2),
    minute: minute.padStart(2, "0").slice(0, 2),
  }
}

export function DateTimePicker({ value, onChange, disabled, placeholder, "aria-label": ariaLabel }: DateTimePickerProps) {
  const { t } = useTranslation()
  const initial = splitValue(value)
  const [draftDate, setDraftDate] = React.useState(initial.date)
  const [draftHour, setDraftHour] = React.useState(initial.hour)
  const [draftMinute, setDraftMinute] = React.useState(initial.minute)
  const [prevValue, setPrevValue] = React.useState(value)

  // 外部 value 变化（表单重置 / 保存后回填）时在渲染期同步草稿，
  // 而不是 useEffect —— 后者会先渲染一帧旧值再纠正，闪一下。
  if (value !== prevValue) {
    setPrevValue(value)
    const next = splitValue(value)
    setDraftDate(next.date)
    setDraftHour(next.hour)
    setDraftMinute(next.minute)
  }

  // 展示用「YYYY-MM-DD HH:mm」（空格比 T 好读），提交仍走 T 格式
  const display = value ? value.replace("T", " ") : ""

  const trigger = (
    <Input
      readOnly
      disabled={disabled}
      value={display}
      placeholder={placeholder ?? t("common.dateTimePicker.placeholder")}
      aria-label={ariaLabel}
      suffix={<LuCalendar size={14} className="text-brand-base" />}
      className="cursor-pointer"
    />
  )

  // 禁用态直接给输入框，不套 Popover —— 否则点击仍会展开（Popover 的触发层
  // 在外层 div 上，Input 的 pointer-events-none 挡不住它）
  if (disabled) return trigger

  return (
    <Popover
      trigger={trigger}
      className="!w-auto mg-panel"
      content={(close) => (
        <div className="flex w-[268px] flex-col gap-3">
          <Calendar
            defaultDate={draftDate || undefined}
            dayState={(date) => ({ selected: date === draftDate })}
            onSelectDate={setDraftDate}
          />

          <div className="flex items-center gap-2">
            <span className="mg-text-caption text-mg-text-3 shrink-0">{t("common.dateTimePicker.time")}</span>
            <TimeColumn
              values={HOURS}
              selected={draftHour}
              onSelect={setDraftHour}
              label={t("common.dateTimePicker.hour")}
            />
            <span className="text-mg-text-3">:</span>
            <TimeColumn
              values={MINUTES}
              selected={draftMinute}
              onSelect={setDraftMinute}
              label={t("common.dateTimePicker.minute")}
            />
          </div>

          <Button
            variant="brand"
            size="small"
            disabled={!draftDate}
            onClick={() => {
              onChange(draftDate ? `${draftDate}T${draftHour}:${draftMinute}` : "")
              close()
            }}
            className="w-full"
          >
            {t("common.dateTimePicker.apply")}
          </Button>
        </div>
      )}
    />
  )
}

/**
 * 时/分滚动列。
 *
 * 刻意不用 ui/Select：Radix Select 的内容 portal 到 body、落在 Popover 的面板之外，
 * 点选项会被 Popover 的「点击外部关闭」判定命中而把整个面板关掉。滚动列留在面板内，
 * 既不触发那条判定，也省掉「一层浮层套另一层浮层」。
 */
function TimeColumn({
  values,
  selected,
  onSelect,
  label,
}: {
  values: string[]
  selected: string
  onSelect: (value: string) => void
  label: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)

  // 打开时把当前值滚到列中部，省得从 00 一路滚到 23。
  // 只改自身 scrollTop，不用 scrollIntoView —— 后者会连带滚动外层页面。
  React.useEffect(() => {
    const container = ref.current
    const el = container?.querySelector<HTMLElement>(`[data-value="${selected}"]`)
    if (container && el) {
      container.scrollTop = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2
    }
  }, [selected])

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className="h-[120px] flex-1 overflow-y-auto rounded-lg border border-mg-border bg-mg-fill-0/30 p-0.5"
    >
      {values.map((v) => (
        <button
          key={v}
          type="button"
          data-value={v}
          aria-label={`${label} ${v}`}
          onClick={() => onSelect(v)}
          className={cn(
            "w-full rounded-md py-1 mg-compact-badge transition-colors",
            v === selected ? "bg-brand-base text-white font-bold" : "text-mg-text-2 hover:bg-mg-fill-0"
          )}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

export default DateTimePicker
