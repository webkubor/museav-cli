import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/Dialog"
import { cn } from "@/lib/utils"

const SIZE_MAP = {
  sm: "sm:max-w-[360px]",
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
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      {/* 三段式：标题/底栏固定，仅内容区内部滚动——长表单的主操作按钮恒在首屏可见（需求方#83）。
          flex 覆盖基类 grid；!overflow-hidden 压掉基类的整体 overflow-y-auto（那会把 footer 一起滚出视口） */}
      <DialogContent closeButton={closeButton} className={cn(SIZE_MAP[size], "flex flex-col !overflow-hidden", className)}>
        {(title || description) && (
          <DialogHeader className="shrink-0">
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        {!description && (
          <DialogDescription className="sr-only">
            {typeof title === "string" ? title : "对话框"}
          </DialogDescription>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <DialogFooter className="shrink-0">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}

export default Modal
