import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"

/**
 * 现代高颜值 Switch 开关组件 (基于 Radix UI Switch Primitive)
 * 职责：提供高度自适应、带品牌发光环的高阻尼开关滑动器
 */

type SwitchProps = Omit<React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>, "onChange"> & {
  /** Alias for onCheckedChange */
  onChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(({ className, onChange, onCheckedChange, ...props }, ref) => (
  <SwitchPrimitive.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-250 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-glow focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-brand-base data-[state=unchecked]:bg-mg-fill-2",
      className
    )}
    onCheckedChange={onCheckedChange ?? onChange}
    {...props}
    ref={ref}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-250 data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitive.Root>
))
Switch.displayName = SwitchPrimitive.Root.displayName

export { Switch }
