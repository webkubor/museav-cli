import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * 现代高颜值 Table 组件
 * 职责：提供高度统一、响应式优秀且美观的数据展示表格
 */

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom mg-text-body", className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b [&_tr]:border-mg-border/70 bg-mg-fill-0/55", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t border-mg-border bg-mg-fill-0 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-mg-border/50 transition-colors duration-150 hover:bg-mg-fill-0/70 data-[state=selected]:bg-mg-fill-1",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

/** 列水平对齐。默认 center（整列居中，表头+单元格一致）；金额/操作等列显式传 align="right" 覆盖。 */
type CellAlign = "left" | "center" | "right"
const ALIGN_CLASS: Record<CellAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
}

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & { align?: CellAlign }
>(({ className, align = "center", ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-[var(--mg-table-head-h)] px-[var(--mg-table-cell-px)] align-middle mg-text-label text-mg-text-3 whitespace-nowrap [&:has([role=checkbox])]:pr-0 select-none",
      ALIGN_CLASS[align],
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & { align?: CellAlign }
>(({ className, align = "center", ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      // 数据表单元格默认单行不换行：短值(金额/日期/枚举/计数)保持自然宽度不被挤到换行，
      // 列宽超出容器时由 Table 外层 overflow-auto 横向滚动，而非压缩列宽致内容换行。
      // 长自由文本用 TruncatedText 单行截断；需要多行的单元格自行传 whitespace-normal 覆盖。
      "px-[var(--mg-table-cell-px)] py-[var(--mg-table-cell-py)] align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 mg-text-body text-mg-text-2",
      ALIGN_CLASS[align],
      className
    )}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 mg-text-body text-mg-text-3", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
}
