import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { IoClose } from "react-icons/io5"
import { cn } from "@/lib/utils"

/**
 * 现代高颜值 Sheet 侧抽屉组件
 * 职责：替代原有的 SideSheet，支持左、右、上、下四个维度的抽屉划出交互
 */

const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[var(--mg-z-overlay)] bg-[var(--mg-overlay-bg)] backdrop-blur-[var(--mg-overlay-blur)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-300",
      className
    )}
    {...props}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  // 表面统一走 mg-float；下面各 side 的 border-b/t/l/r 只是保留「靠哪边」的语义，
  // 宽度与颜色都由 mg-float 的 1px 描边给（贴视口的三条边本来就看不见）
  "fixed z-[var(--mg-z-sheet)] gap-[var(--mg-dialog-gap)] mg-float mg-panel-roomy transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-300 focus:outline-none",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        // 宽度走 design-tokens 的抽屉规范（--mg-sheet-*），不再用 Tailwind 的 max-w-md：
        // 规范宽 560px（原 448px），窄屏用 min(560px,100vw) 收，小屏仍保底 w-3/4。
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:w-[var(--mg-sheet-width)] sm:min-w-[var(--mg-sheet-min-width)] sm:max-w-[var(--mg-sheet-max-width)]",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:w-[var(--mg-sheet-width)] sm:min-w-[var(--mg-sheet-min-width)] sm:max-w-[var(--mg-sheet-max-width)]",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      {...props}
    >
      {children}
      <SheetPrimitive.Close className="absolute right-4 top-4 rounded-[var(--mg-radius-xs)] opacity-50 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus-visible:shadow-[var(--mg-focus-ring)] disabled:pointer-events-none data-[state=open]:bg-mg-fill-0 text-mg-text-3 p-[var(--mg-space-1)]">
        <IoClose className="h-5 w-5" />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      // 标题区行距走抽屉规范 --mg-sheet-header-gap（= --mg-space-2 8px，与原 space-y-2 同值）
      "flex flex-col gap-[var(--mg-sheet-header-gap)] text-center sm:text-left",
      className
    )}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("mg-text-title-sm font-bold text-mg-text-1", className)}
    {...props}
  />
))
SheetTitle.displayName = "SheetTitle"

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("mg-text-body text-mg-text-3", className)}
    {...props}
  />
))
SheetDescription.displayName = "SheetDescription"

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
