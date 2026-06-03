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
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className={cn(SIZE_MAP[size], className)}>
        {(title || description) && (
          <DialogHeader>
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        {!description && (
          <DialogDescription className="sr-only">
            {typeof title === "string" ? title : "对话框"}
          </DialogDescription>
        )}
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}

export default Modal
