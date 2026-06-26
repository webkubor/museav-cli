import * as React from "react"
import { cn } from "@/lib/utils"

export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  colSpan?: number
}

export function EmptyState({ icon, title, description, action, className, colSpan }: EmptyStateProps) {
  const content = (
    <div className={cn("py-16 flex flex-col items-center justify-center text-center", className)}>
      {icon && (
        <div className="mb-3 text-mg-text-3 [&>svg]:w-[var(--mg-icon-empty-size)] [&>svg]:h-[var(--mg-icon-empty-size)]">
          {icon}
        </div>
      )}
      <p className="mg-text-body font-medium text-mg-text-2">{title}</p>
      {description && (
        <p className="mt-1 mg-text-caption text-mg-text-3">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )

  if (colSpan !== undefined) {
    return (
      <tr>
        <td colSpan={colSpan}>{content}</td>
      </tr>
    )
  }

  return content
}
