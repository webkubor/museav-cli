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
  size?: "default" | "small" | "large" | string // 声明 size 以兼容 Semi，防止原生透传 number 报错
  onChange?: (e: any) => void // 联合签名兼容：同时接受 React 原生 ChangeEvent 和 Semi 字符串回调
  onEnterPress?: (e: React.KeyboardEvent<HTMLInputElement>) => void // 兼容 Semi UI 的回车事件属性
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

/**
 * 统一的高阶 Input 输入组件
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, prefix, suffix, mode, size, onChange, onEnterPress, onKeyDown, ...props }, ref) => {
    // 智能属性映射：mode="password" 自动解析为 type="password"
    const resolvedType = type || (mode === "password" ? "password" : "text")

    // 回车事件拦截处理
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (onKeyDown) onKeyDown(e)
      if (e.key === "Enter" && onEnterPress) {
        onEnterPress(e)
      }
    }

    // 存在前缀或后缀时，使用复合包装容器，将聚焦发光与悬停状态移至 wrapper 容器上
    if (prefix || suffix) {
      return (
        <div
          className={cn(
            "modern-input-wrapper flex items-center gap-2",
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
            className="modern-input-inner flex-1 w-full h-full bg-transparent border-none outline-none p-0 text-sm focus:ring-0 focus:outline-none placeholder:text-mg-text-2/70 text-mg-text-0 disabled:cursor-not-allowed"
            ref={ref}
            onChange={onChange}
            onKeyDown={handleKeyDown}
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

    // 默认标准单体输入框
    return (
      <input
        type={resolvedType}
        className={cn("modern-input-field", className)}
        ref={ref}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }



