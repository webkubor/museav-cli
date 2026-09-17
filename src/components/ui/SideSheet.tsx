/**
 * 侧边抽屉容器与无障碍标题兜底
 * 路由：全局复用
 * API：无
 */

import * as React from "react"
import { useTranslation } from "react-i18next"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/Sheet"
import { cn } from "@/lib/utils"

const SIDE_SHEET_WIDTH = 680

interface SideSheetProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  ariaTitle?: string
  description?: React.ReactNode
  children?: React.ReactNode
  /**
   * 底部操作栏。放在滚动区**外面**，靠 flex 自然贴住抽屉底部。
   * 不要把操作栏写进 children 里再挂 sticky bottom-0 —— sticky 只在内容溢出、
   * 真的产生滚动时才贴底；内容短的抽屉不滚动，那条操作栏就停在内容结束处，
   * 底下留一大片空白（2026-09-17 owner 在 API Key 创建抽屉上看到的就是这个）。
   */
  footer?: React.ReactNode
  side?: "left" | "right"
  className?: string
}

export function SideSheet({
  open,
  onClose,
  title,
  ariaTitle,
  description,
  children,
  footer,
  side = "right",
  className,
}: SideSheetProps) {
  const { t } = useTranslation()
  const accessibleTitle = title ?? ariaTitle ?? t('common.sideSheet.defaultTitle')

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      {/* flex 列 + 内容区内部滚动：抽屉内容超高时不再被视口硬裁（需求方#84 ③ 底部文字截断） */}
      <SheetContent
        side={side}
        style={{
          width: `${SIDE_SHEET_WIDTH}px`,
          maxWidth: "calc(100vw - 2rem)",
        }}
        className={cn("flex flex-col", className)}
      >
        <SheetHeader className={cn("shrink-0", !title && "sr-only")}>
          <SheetTitle>{accessibleTitle}</SheetTitle>
          <SheetDescription className={cn(!description && "sr-only")}>
            {description ?? accessibleTitle}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? <div className="shrink-0">{footer}</div> : null}
      </SheetContent>
    </Sheet>
  )
}

export default SideSheet
