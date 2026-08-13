import * as React from "react"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/Dialog"
import { cn } from "@/lib/utils"

// 尺寸标准：sm=纯确认框(短提示+按钮)｜md=默认,内容型表单/公告｜lg=复杂多区
const SIZE_MAP = {
  sm: "sm:max-w-[400px]",
  md: "sm:max-w-[520px]",
  lg: "sm:max-w-[720px]",
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  footer?: React.ReactNode
  children?: React.ReactNode
  size?: "sm" | "md" | "lg"
  className?: string
  /** 是否显示右上角关闭按钮，默认显示；强制类弹窗（如新版本强制更新）传 false 隐藏 */
  closeButton?: boolean
  /** 关掉 Radix 的 modal 行为（body 不锁 pointer-events/焦点陷阱）：第三方 SDK
   *  的浮层（如短信验证码人机验证）portal 在 Dialog DOM 之外时需要，否则点不动。
   *  遮罩仍渲染、强制门禁效果不受影响，见 RequiredPhoneBindingDialog。默认 true。 */
  modal?: boolean
  /** 阻止 ESC/点击遮罩/外部交互关闭——强制类弹窗（手机号绑定等）用，配合 closeButton={false} */
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  onPointerDownOutside?: (event: Event) => void
  onInteractOutside?: (event: Event) => void
}

export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  size = "md",
  className,
  closeButton = true,
  modal = true,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
}: ModalProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }} modal={modal}>
      {/* 三段式：标题/底栏固定，仅内容区内部滚动——长表单的主操作按钮恒在首屏可见（需求方#83）。
          flex 覆盖基类 grid；!overflow-hidden 压掉基类的整体 overflow-y-auto（那会把 footer 一起滚出视口） */}
      <DialogContent
        closeButton={closeButton}
        modal={modal}
        onEscapeKeyDown={onEscapeKeyDown}
        onPointerDownOutside={onPointerDownOutside}
        onInteractOutside={onInteractOutside}
        className={cn(SIZE_MAP[size], "flex flex-col !overflow-hidden", className)}
      >
        {(title || description) && (
          <DialogHeader className="shrink-0">
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        {!description && (
          <DialogDescription className="sr-only">
            {typeof title === "string" ? title : t('common.dialog')}
          </DialogDescription>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <DialogFooter className="shrink-0">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}

export default Modal
