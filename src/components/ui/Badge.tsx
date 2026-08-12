/**
 * 极简现代高颜值 Badge 组件
 * 职责：提供高度自适应、动效优雅的标签/徽章组件
 * 依赖：class-variance-authority, cn 工具函数
 */

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border font-bold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-glow select-none",
  {
    variants: {
      size: {
        default: "px-[var(--mg-control-px-sm)] py-0.5 mg-compact-badge",
        sm: "px-[var(--mg-control-px-xs)] py-0.5 mg-compact-badge",
        xs: "px-1.5 py-px mg-compact-badge",
      },
      variant: {
        default:
          "border-transparent bg-brand-base text-white hover:bg-brand-mid shadow-sm",
        secondary:
          "border-transparent bg-mg-fill-1 text-mg-text-2 hover:bg-mg-fill-2",
        destructive:
          "border-transparent bg-[var(--mg-btn-danger-bg)] text-[var(--mg-btn-danger-text)] hover:bg-[var(--mg-btn-danger-bg-hover)] shadow-sm",
        outline: 
          "text-mg-text-2 border-mg-border hover:bg-mg-fill-0",
        success:
          "bg-[var(--mg-success-bg)] text-[var(--mg-success-text)] border-[var(--mg-success-border)]",
        warning:
          "bg-[var(--mg-warning-bg)] text-[var(--mg-warning-text)] border-[var(--mg-warning-border)]",
        danger:
          "bg-[var(--mg-danger-bg)] text-[var(--mg-danger-text)] border-[var(--mg-danger-border)]",
        brand:
          "border-transparent bg-brand-base/10 text-brand-base border-brand-base/20",
        purple:
          "bg-[var(--mg-accent-purple-bg)] text-[var(--mg-accent-purple-fg)] border-[var(--mg-accent-purple-border)]",
        info:
          "bg-[var(--mg-info-bg)] text-[var(--mg-info-text)] border-[var(--mg-info-border)]",
        glass:
          "bg-white/10 backdrop-blur-md border-white/20 text-mg-text-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
}

function Badge({ className, variant, size, dot, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
      {children}
    </div>
  )
}

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>
export { Badge }
