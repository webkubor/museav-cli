/**
 * 极简现代高颜值 Input 组件
 * 职责：提供高度自适应、带 Focus 品牌环发光的标准 Input，高阶支持前缀与后缀元素
 * 依赖：cn 工具函数
 *
 * ── 尺寸即格式约束（2026-09-04 控件统一）──────────────────────────────────
 * size 是高度/字号/图标/内距的**成套档位**（同 Button 的 size 体系）：
 *   sm(32px) 面板内搜索（下拉面板/侧栏/弹窗内）
 *   md(40px) 默认；页面工具栏的搜索/筛选
 *   lg(48px) 公共主搜索（模型广场 hero 搜索）
 * 高度由 components.css 的 .modern-input-{size}（未分层 CSS + min-height）钉死，
 * 页面传 h-8/h-9 等高度类**不会**生效——要改尺寸只能传 size。
 * 字号一律 mg-text-body(13px)：内层 input 自带 mg-text-body，text-xs 等字号类
 * 覆盖 wrapper 也不影响正文。禁止在页面给本组件加高度/字号/圆角覆盖类
 * （ui-guard BLOCK 11 拦截），要例外用 ui-guard-ignore 并写理由。
 */

import * as React from "react"
import { cn } from "@/lib/utils"

export type InputSize = "sm" | "md" | "lg"

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'onChange' | 'size' | 'onKeyDown'> {
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  mode?: string // 兼容 Semi UI 的 mode 属性 (如 mode="password")
  variant?: "default" | "search" // 样式变体类型
  /** 尺寸档位：sm(32) 面板内 / md(40) 工具栏默认 / lg(48) 公共主搜索。高度+内距成套，页面不可覆盖 */
  size?: InputSize
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onEnterPress?: (e: React.KeyboardEvent<HTMLInputElement>) => void // 兼容 Semi UI 的回车事件属性
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  error?: boolean
  success?: boolean
}

/**
 * 统一的高阶 Input 输入组件
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, prefix, suffix, mode, variant, size = "md", onChange, onEnterPress, onKeyDown, onBlur, onClick, error, success, ...props }, ref) => {
    // 智能属性映射：mode="password" 自动解析为 type="password"
    const resolvedType = type || (mode === "password" ? "password" : "text")
    // date/datetime/time 等原生控件默认只有点日历小图标才弹选择器，点输入框文字区不弹。
    // 统一：点整个输入框即弹（showPicker 由 click 用户手势触发，合法），治「时间选择器不弹」。
    const isDateLike = resolvedType === "date" || resolvedType === "datetime-local" || resolvedType === "time" || resolvedType === "month" || resolvedType === "week"
    const shouldTrim = resolvedType === "text" || resolvedType === "search" || resolvedType === "url" || resolvedType === "email"
    const variantClasses = variant === "search"
      ? "modern-input-search rounded-full mg-flow-input"
      : ""
    const sizeClasses = size === "sm"
      ? "modern-input-sm"
      : size === "lg"
        ? "modern-input-lg"
        : ""

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (resolvedType === 'email') {
        // multiple（HTML 标准多邮箱语义）时必须放行分隔符 , ; 及空格，否则多邮箱永远打不进去（需求方#116）
        const emailChars = props.multiple ? /[^a-zA-Z0-9._%+\-@,;\s]/g : /[^a-zA-Z0-9._%+\-@]/g
        const filtered = e.target.value.replace(emailChars, '')
        if (filtered !== e.target.value) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
          setter?.call(e.target, filtered)
          e.target.dispatchEvent(new Event('input', { bubbles: true }))
        }
      }
      onChange?.(e)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (onKeyDown) onKeyDown(e)
      if (e.key === "Enter" && onEnterPress) {
        onEnterPress(e)
      }
    }

    const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
      if (isDateLike) {
        try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.() } catch { /* 非用户手势或不支持时静默 */ }
      }
      onClick?.(e)
    }

    // 原生 date/datetime 控件语言跟随浏览器而非站点语言，显式用 html lang（i18n 已同步）纠偏（需求方#456）
    const resolvedLang = props.lang ?? (isDateLike && typeof document !== 'undefined' ? document.documentElement.lang || undefined : undefined)

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (shouldTrim && e.target.value !== e.target.value.trim()) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        nativeInputValueSetter?.call(e.target, e.target.value.trim())
        e.target.dispatchEvent(new Event('change', { bubbles: true }))
      }
      onBlur?.(e)
    }

    // 统一采用复合包装容器，以支持前/后缀及高颜值流光边框动效
    return (
      <div
        className={cn(
          "modern-input-wrapper modern-input-field flex items-center gap-2",
          sizeClasses,
          variantClasses,
          error && "is-error",
          success && "is-success",
          props.disabled && "opacity-50 cursor-not-allowed pointer-events-none",
          className
        )}
      >
        {prefix && (
          <span className="modern-input-prefix inline-flex items-center text-mg-text-3 shrink-0 transition-colors duration-200">
            {prefix}
          </span>
        )}
        <input
          type={resolvedType}
          className="modern-input-inner flex-1 w-full h-full bg-transparent border-none outline-none p-0 mg-text-body focus:ring-0 focus:outline-none placeholder:text-mg-text-3/70 text-mg-text-1 disabled:cursor-not-allowed"
          ref={ref}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          onBlur={handleBlur}
          {...props}
          lang={resolvedLang}
        />
        {suffix && (
          <span className="modern-input-suffix inline-flex items-center text-mg-text-3 shrink-0 transition-colors duration-200">
            {suffix}
          </span>
        )}
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }


