import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { IoClose } from "react-icons/io5"
import { cn } from "@/lib/utils"

/**
 * 现代高颜值 Dialog 组件 (基于 Radix UI Dialog Primitive)
 * 职责：替代原有的 Modal，提供极其柔和的磨砂遮罩、中心滑入微动效、及标准的对话框骨架
 */

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[var(--mg-z-overlay)] bg-[var(--mg-overlay-bg)] backdrop-blur-[var(--mg-overlay-blur)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 transition-all duration-300",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { closeButton?: boolean; modal?: boolean }
>(({ className, children, closeButton = true, modal = true, ...props }, ref) => (
  <DialogPortal>
    {/* Radix 的 Overlay 在 modal={false} 时不渲染，背后页面就能继续点（需求方#594）；
        非 modal 场景用普通 div 补一层同样式遮罩挡住下方交互（第三方验证码浮层 z 更高不受影响） */}
    {modal ? (
      <DialogOverlay />
    ) : (
      <div
        aria-hidden
        className="fixed inset-0 z-[var(--mg-z-overlay)] bg-[var(--mg-overlay-bg)] backdrop-blur-[var(--mg-overlay-blur)]"
      />
    )}
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // max-h-[90dvh] + overflow-y-auto：内容超高时弹窗封顶到视口内并内部滚动，避免超出浏览器范围（#458）
        // padding 走 --mg-dialog-pad（= --mg-space-6 24px，与原 mg-panel-roomy 同值），min-width 走规范下限 360px。
        // ⚠️ max-w-lg(512) 与 max-h-[90dvh] 暂不换成 --mg-dialog-max-width(720) / --mg-dialog-max-height：
        //   · 库给的是区间上限而非目标值，而这里有 w-full，换成 720 会让**所有**弹窗一律撑到 720，
        //     小确认框和大表单一样宽 —— 库里缺"默认宽度"这一档，需要设计给分档（如 sm/md/lg）才能接
        //   · max-height 换成 min(720px, 100dvh-128px) 会让高弹窗从约 970px 压到 720px，
        //     属于会影响 #458 已验收行为的可见变化，同样等设计确认
        "fixed left-[50%] top-[50%] z-[var(--mg-z-modal)] grid w-full min-w-[var(--mg-dialog-min-width)] max-w-lg max-h-[90dvh] overflow-y-auto translate-x-[-50%] translate-y-[-50%] gap-[var(--mg-dialog-gap)] border border-mg-border bg-mg-bg-3 p-[var(--mg-dialog-pad)] shadow-xl shadow-black/10 rounded-[var(--mg-dialog-radius)] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-1/2 data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-1/2 focus:outline-none",
        className
      )}
      {...props}
    >
      {children}
      {closeButton && (
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-[var(--mg-radius-xs)] opacity-50 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus-visible:shadow-[var(--mg-focus-ring)] disabled:pointer-events-none data-[state=open]:bg-mg-fill-0 text-mg-text-3 p-[var(--mg-space-1)]">
          <IoClose className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col gap-[var(--mg-dialog-header-gap)] text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end gap-[var(--mg-dialog-footer-gap)]",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "mg-text-title-sm font-bold tracking-tight text-mg-text-1",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("mg-text-body text-mg-text-3", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
