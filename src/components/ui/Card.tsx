import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * 现代高颜值 Card 组件
 * 职责：提供统一的内容容器，支持阴影、边框、玻璃拟态及悬停动效
 */

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { 
    hoverable?: boolean;
    glass?: boolean;
    noBorder?: boolean;
    level?: 1 | 2;
  }
>(({ className, hoverable, glass, noBorder, level = 1, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "text-mg-text-1 shadow-[var(--shadow-md)] transition-all duration-300",
      level === 1 ? "rounded-lg bg-mg-bg-0" : "rounded-lg bg-mg-bg-2",
      !noBorder && "border border-mg-border",
      hoverable && !glass && (
        level === 1
          ? "hover:shadow-[var(--shadow-lg)] hover:-translate-y-1 hover:border-brand-base/20"
          : "hover:bg-mg-bg-3 hover:shadow-[var(--shadow-lg)] hover:border-brand-base/30 active:scale-[0.98]"
      ),
      glass && "glass-card-glow",
      glass && hoverable && "glass-card-glow-interactive",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 mg-panel-roomy", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "mg-text-title-sm font-bold tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("mg-text-body text-mg-text-3", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("mg-panel-roomy pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center mg-panel-roomy pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
