import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { IoChevronDown, IoChevronUp, IoCheckmark } from "react-icons/io5"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

/**
 * 现代高颜值 Select 选择器组件 (基于 Radix UI Select Primitive)
 * 职责：替代原有的 Select 组件，支持优雅的定位、带品牌轮廓高亮的获焦边框以及平滑渐变
 *
 * ── 尺寸即格式约束（2026-09-04 控件统一，同 Button/Input 的 size 体系）────────
 * size 档位钉高度与图标：sm(32px) 面板内、md(40px) 默认（页面工具栏）。
 * 高度写在 components.css 的 .mg-select-trigger-{size}（未分层 CSS），页面传
 * h-8/h-9 等高度类不会生效——要改尺寸只能传 size（ui-guard BLOCK 11 拦截覆盖类）。
 * 字号一律 mg-text-body(13px)，不随档位变。
 */

export type SelectSize = "sm" | "md"

const selectSizeClasses: Record<SelectSize, string> = {
  sm: "mg-select-trigger-sm",
  md: "mg-select-trigger-md",
}

const SelectRoot = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & { triggerSize?: SelectSize }
>(({ className, children, triggerSize = "md", ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "mg-select-trigger flex w-full items-center justify-between rounded-[var(--mg-control-radius)] border border-mg-border bg-mg-fill-0 px-[var(--mg-control-pad-x-sm)] mg-text-body outline-none transition-all duration-200 placeholder:text-mg-text-3/70 text-mg-text-1 hover:border-brand-mid/50 focus:border-brand-base focus:shadow-[var(--mg-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      selectSizeClasses[triggerSize],
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <IoChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1 text-mg-text-3",
      className
    )}
    {...props}
  >
    <IoChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1 text-mg-text-3",
      className
    )}
    {...props}
  >
    <IoChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        // 表面统一走 mg-float（磨砂玻璃 + 品牌微染 + 微光），不再各自写 bg-mg-bg-2 + shadow-lg
        "relative z-[var(--mg-z-dropdown)] max-h-96 min-w-[8rem] overflow-hidden rounded-[var(--mg-popover-radius)] mg-float text-mg-text-1 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-[var(--mg-menu-padding)]",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("py-1.5 pl-8 pr-2 mg-text-label text-mg-text-3", className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-[var(--mg-radius-sm)] py-[var(--mg-menu-item-py)] pl-8 pr-2 mg-text-body text-mg-text-2 outline-none transition-colors duration-150 focus:bg-mg-fill-0 focus:text-mg-text-1 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <IoCheckmark className="h-4 w-4 text-brand-base" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-[1px] bg-mg-border/60", className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

// ── Wrapped Select component ─────────────────────────────────────────────────

interface SelectProps {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  children?: React.ReactNode
  emptyText?: string
  /** 尺寸档位：sm(32) 面板内 / md(40) 默认。高度+图标成套走 token，页面类覆盖不生效 */
  size?: SelectSize
  /** 埋点/可测性：透传到触发器（值 = 埋点 event key），供自动化定位 */
  'data-track'?: string
}

interface SelectComponent extends React.FC<SelectProps> {
  Option: typeof SelectItem
}

const Select = (({ value, defaultValue, onChange, placeholder, disabled, className, children, emptyText, size = "md", 'data-track': dataTrack }: SelectProps) => {
  const { t } = useTranslation()
  const isEmpty = React.Children.count(children) === 0
  const resolvedEmptyText = emptyText ?? t('common.select.empty')
  return (
    <SelectRoot value={value} defaultValue={defaultValue} onValueChange={onChange} disabled={disabled || isEmpty}>
      <SelectTrigger className={className} triggerSize={size} data-track={dataTrack}>
        <SelectValue placeholder={isEmpty ? resolvedEmptyText : placeholder} />
      </SelectTrigger>
      {!isEmpty && (
        <SelectContent>
          {children}
        </SelectContent>
      )}
    </SelectRoot>
  )
}) as SelectComponent

Select.Option = SelectItem

export default Select

export {
  SelectRoot,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}

// Named re-export for backward-compat: `import { Select, ... } from '...'`
export { Select }
