import * as React from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/Sheet"

interface SideSheetProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  children?: React.ReactNode
  side?: "left" | "right"
  width?: number
  className?: string
}

export function SideSheet({
  open,
  onClose,
  title,
  children,
  side = "right",
  width,
  className,
}: SideSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        side={side}
        style={width ? { width: `${width}px`, maxWidth: `${width}px` } : undefined}
        className={className}
      >
        {title && (
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
        )}
        {children}
      </SheetContent>
    </Sheet>
  )
}

export default SideSheet
