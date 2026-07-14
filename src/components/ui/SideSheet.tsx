/**
 * 侧边抽屉容器与无障碍标题兜底
 * 路由：全局复用
 * API：无
 */

import * as React from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/Sheet"
import { cn } from "@/lib/utils"

interface SideSheetProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  ariaTitle?: string
  description?: React.ReactNode
  children?: React.ReactNode
  side?: "left" | "right"
  width?: number
  className?: string
}

export function SideSheet({
  open,
  onClose,
  title,
  ariaTitle,
  description,
  children,
  side = "right",
  width,
  className,
}: SideSheetProps) {
  const accessibleTitle = title ?? ariaTitle ?? "详情"

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        side={side}
        style={width ? { width: `${width}px`, maxWidth: `${width}px` } : undefined}
        className={className}
      >
        <SheetHeader className={cn(!title && "sr-only")}>
          <SheetTitle>{accessibleTitle}</SheetTitle>
          <SheetDescription className={cn(!description && "sr-only")}>
            {description ?? accessibleTitle}
          </SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  )
}

export default SideSheet
