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
        default: "px-2.5 py-0.5 text-[11px]",
        sm: "px-2 py-0.5 text-[10px]",
        xs: "px-1.5 py-px text-[9px]",
      },
      variant: {
        default:
          "border-transparent bg-brand-base text-white hover:bg-brand-mid shadow-sm",
        secondary:
          "border-transparent bg-mg-fill-1 text-mg-text-1 hover:bg-mg-fill-2",
        destructive:
          "border-transparent bg-rose-500 text-white hover:bg-rose-600 shadow-sm",
        outline: 
          "text-mg-text-1 border-mg-border hover:bg-mg-fill-0",
        success:
          "border-transparent bg-mg-success/10 text-mg-success border-mg-success/20",
        warning:
          "border-transparent bg-mg-warning/10 text-mg-warning border-mg-warning/20",
        danger:
          "border-transparent bg-mg-danger/10 text-mg-danger border-mg-danger/20",
        purple:
          "border-transparent bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
        info:
          "border-transparent bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
        glass:
          "bg-white/10 backdrop-blur-md border-white/20 text-mg-text-1",
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
export { Badge, badgeVariants }
