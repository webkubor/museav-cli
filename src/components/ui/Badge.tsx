/**
 * 极简现代高颜值 Badge 组件
 * 职责：提供高度自适应、动效优雅的标签/徽章组件
 * 依赖：class-variance-authority, cn 工具函数
 */

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-glow",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-brand-base text-white hover:bg-brand-mid",
        secondary:
          "border-transparent bg-semi-color-fill-0 text-semi-color-text-1 hover:bg-semi-color-fill-1",
        destructive:
          "border-transparent bg-rose-500 text-white hover:bg-rose-600",
        outline: "text-semi-color-text-1 border-semi-color-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * 统一的高阶 Badge 徽章组件
 */
function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
