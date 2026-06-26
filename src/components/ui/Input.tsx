/**
 * 极简现代高颜值 Input 组件
 * 职责：提供高度自适应、带 Focus 品牌环发光的标准 Input，高阶支持前缀与后缀元素
 * 依赖：cn 工具函数
 */

import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'onChange' | 'size' | 'onKeyDown'> {
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  mode?: string // 兼容 Semi UI 的 mode 属性 (如 mode="password")
  variant?: "default" | "search" // 样式变体类型
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
  ({ className, type, prefix, suffix, mode, variant, onChange, onEnterPress, onKeyDown, onBlur, error, success, ...props }, ref) => {
    // 智能属性映射：mode="password" 自动解析为 type="password"
    const resolvedType = type || (mode === "password" ? "password" : "text")
    const shouldTrim = resolvedType === "text" || resolvedType === "search" || resolvedType === "url" || resolvedType === "email"
    const variantClasses = variant === "search"
      ? "modern-input-search rounded-full"
      : ""

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (resolvedType === 'email') {
        const filtered = e.target.value.replace(/[^a-zA-Z0-9._%+\-@]/g, '')
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
          variantClasses,
          error && "is-error",
          success && "is-success",
          props.disabled && "opacity-50 cursor-not-allowed pointer-events-none",
          className
        )}
      >
        {prefix && (
          <span className="modern-input-prefix inline-flex items-center text-mg-text-2 shrink-0 transition-colors duration-200">
            {prefix}
          </span>
        )}
        <input
          type={resolvedType}
          className="modern-input-inner flex-1 w-full h-full bg-transparent border-none outline-none p-0 mg-text-body focus:ring-0 focus:outline-none placeholder:text-mg-text-2/70 text-mg-text-0 disabled:cursor-not-allowed"
          ref={ref}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          {...props}
        />
        {suffix && (
          <span className="modern-input-suffix inline-flex items-center text-mg-text-2 shrink-0 transition-colors duration-200">
            {suffix}
          </span>
        )}
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }


