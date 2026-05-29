import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

/**
 * 现代高颜值 Tabs 多页签组件 (基于 Radix UI Tabs Primitive)
 * 职责：替代原有的 Tabs 组件，支持极致现代的大厂扁平标签页及微滑动交互效果
 */

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center justify-start border-b border-mg-border/60 w-full gap-6 select-none",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap py-3 text-sm font-semibold transition-all duration-250 border-b-2 border-transparent text-mg-text-2 hover:text-mg-text-0 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-brand-base data-[state=active]:text-brand-base outline-none cursor-pointer tracking-tight",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-glow focus-visible:ring-offset-2 animate-in fade-in-50 duration-200",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
