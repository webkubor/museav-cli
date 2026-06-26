import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CodeBlockProps {
  children: ReactNode
  /** 追加/覆盖样式，如 max-h-72、w-full 等 */
  className?: string
}

/**
 * 通用代码 / payload 展示块。
 * 颜色走 --mg-code-bg / --mg-code-text 双主题 token，浅色深色自动适配。
 */
export function CodeBlock({ children, className }: CodeBlockProps) {
  return (
    <pre
      className={cn(
        'mg-text-code text-mg-code-text bg-mg-code-bg',
        'mg-panel rounded-md border border-mg-border overflow-x-auto select-all',
        className,
      )}
    >
      {children}
    </pre>
  )
}
