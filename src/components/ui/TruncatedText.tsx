import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * 单行截断文本（全站数据表长文本统一治理）：
 * 表格里渲染用户自由文本（姓名 / 邮箱 / 名称 / 描述 / 标题等可能超长的字符串）时统一用它，
 * 超出 maxWidth 省略号截断 + hover 原生 title 显全文，避免长文本撑破列宽 / 换行浪费空间。
 *
 * 只用于「可超长的自由文本」；数字 / 金额 / 日期 / 状态 Badge / 枚举 Tag / 操作按钮不要用。
 * 空值显占位「—」（降一档灰），不留空。
 */
export function TruncatedText({
  text,
  maxWidth = 160,
  className,
  placeholder = '—',
}: {
  text?: string | null
  /** 最大宽度（px），超出截断。按列内容合理取值 */
  maxWidth?: number
  className?: string
  /** 空值占位，默认「—」 */
  placeholder?: ReactNode
}) {
  if (!text) {
    return <span className="font-normal text-mg-text-3">{placeholder}</span>
  }
  return (
    <span
      className={cn('block truncate', className)}
      style={{ maxWidth }}
      title={text}
    >
      {text}
    </span>
  )
}
