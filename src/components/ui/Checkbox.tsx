import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { IoCheckmark } from "react-icons/io5"
import { cn } from "@/lib/utils"

/**
 * 现代高颜值 Checkbox 复选框组件 (基于 Radix UI Checkbox Primitive)
 * 职责：提供高度自适应、带物理微回弹的极雅复选框
 */

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded border border-mg-border bg-mg-bg-1 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-glow disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-brand-base data-[state=checked]:border-brand-base data-[state=checked]:text-white cursor-pointer",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("flex items-center justify-center text-current")}
    >
      <IoCheckmark className="h-3 w-3 stroke-[4px] animate-in zoom-in-50 duration-150" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
