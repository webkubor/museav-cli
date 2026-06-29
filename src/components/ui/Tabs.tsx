import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const tabsListVariants = cva("select-none", {
  variants: {
    variant: {
      underline: "inline-flex items-center justify-start border-b border-mg-border/60 w-full gap-6",
      pills: "inline-flex items-center gap-1 bg-mg-fill-0 p-1 rounded-lg border border-mg-border",
    },
  },
  defaultVariants: { variant: "underline" },
})

const tabsTriggerVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap mg-text-body font-semibold transition-all duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 outline-none cursor-pointer",
  {
    variants: {
      variant: {
        underline:
          "py-[var(--mg-space-3)] border-b-2 border-transparent text-mg-text-3 hover:text-mg-text-1 data-[state=active]:border-brand-base data-[state=active]:text-brand-base tracking-tight",
        pills:
          "rounded-md px-[var(--mg-control-px-md)] py-1.5 text-mg-text-3 hover:text-mg-text-1 data-[state=active]:bg-brand-base data-[state=active]:text-white data-[state=active]:shadow-sm",
      },
    },
    defaultVariants: { variant: "underline" },
  }
)

type TabsVariant = "underline" | "pills"

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsVariant }
>(({ className, variant = "underline", ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(tabsListVariants({ variant }), className)}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & { variant?: TabsVariant }
>(({ className, variant = "underline", ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(tabsTriggerVariants({ variant }), className)}
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
