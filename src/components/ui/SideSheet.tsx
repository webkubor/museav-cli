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
      {/* flex 列 + 内容区内部滚动：抽屉内容超高时不再被视口硬裁（需求方#84 ③ 底部文字截断） */}
      <SheetContent
        side={side}
        style={width ? { width: `${width}px`, maxWidth: `${width}px` } : undefined}
        className={cn("flex flex-col", className)}
      >
        <SheetHeader className={cn("shrink-0", !title && "sr-only")}>
          <SheetTitle>{accessibleTitle}</SheetTitle>
          <SheetDescription className={cn(!description && "sr-only")}>
            {description ?? accessibleTitle}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </SheetContent>
    </Sheet>
  )
}

export default SideSheet
