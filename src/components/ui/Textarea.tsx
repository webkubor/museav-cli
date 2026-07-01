import * as React from "react"
import { cn } from "@/lib/utils"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

/**
 * 现代高颜值 Textarea 多行输入框组件
 * 职责：提供与 Input 完全统一的发光聚焦环、高感圆角和响应式状态的多行文本域
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, onBlur, ...props }, ref) => {
    const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      if (e.target.value !== e.target.value.trim()) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        nativeSetter?.call(e.target, e.target.value.trim())
        e.target.dispatchEvent(new Event('change', { bubbles: true }))
      }
      onBlur?.(e)
    }
    return (
      <textarea
        className={cn(
          "flex min-h-[var(--mg-textarea-min-h)] w-full rounded-lg border border-mg-border bg-mg-fill-0 px-[var(--mg-control-px-sm)] py-[var(--mg-control-py-sm)] mg-text-body outline-none transition-all duration-250 placeholder:text-mg-text-3/70 text-mg-text-1 hover:border-brand-mid/50 focus:border-brand-base focus:ring-2 focus:ring-brand-glow disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        onBlur={handleBlur}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
