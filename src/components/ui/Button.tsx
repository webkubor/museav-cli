/**
 * 极简现代高颜值 Button 组件
 * 职责：提供高度自适应、动效优雅、符合折中样式的 shadcn 风格 Button
 * 依赖：class-variance-authority, cn 工具函数
 */

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/** Button 组件变体样式定义 */
const buttonVariants = cva(
  "modern-btn active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-200",
  {
    variants: {
      variant: {
        default:
          "modern-btn-default",
        destructive:
          "modern-btn-destructive",
        outline:
          "modern-btn-outline",
        secondary:
          "modern-btn-secondary",
        ghost:
          "modern-btn-ghost",
        link:
          "modern-btn-link",
        glass:
          "bg-white/10 dark:bg-black/20 backdrop-blur-md border border-white/20 dark:border-white/10 text-semi-color-text-0 hover:bg-white/20 dark:hover:bg-black/30 shadow-sm",
        brand:
          "bg-brand-base text-white hover:bg-brand-mid shadow-md shadow-brand-glow/20 border-none",
      },
      size: {
        default: "h-10 px-5 py-2",
        xs: "h-7 rounded-md px-2 text-[10px] font-bold uppercase tracking-wider",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-12 rounded-lg px-8 text-base",
        xl: "h-14 rounded-xl px-10 text-lg font-bold",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

/**
 * 统一的高阶 Button 组件
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            {/* 微小旋转 Loading 环 */}
            <svg
              className="mr-2 h-4 w-4 animate-spin text-current"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
