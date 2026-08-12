import * as React from 'react'
import { cn } from '@/lib/utils'

export type PageHeaderProps = {
  title: React.ReactNode
  description?: string
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 mb-[var(--mg-layout-panel-gap)]', className)}>
      <div>
        <h1 className="mg-text-page-title font-bold tracking-tight text-mg-text-1">
          {title}
        </h1>
        {description && (
          <p className="mt-1 mg-text-body text-mg-text-3 font-medium">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
