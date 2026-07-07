/**
 * 可观测性页面共享展示组件
 * 路由：/observability；空间详情「日志与转发」页签复用
 * API：无直接请求，仅承接可观测性页面展示结构
 */
import type { ReactNode } from 'react'
import type { PlatformItem } from '@/types'

/** 平台图标展示，后端暂无 logo 时用首字母占位。 */
export function PlatformLogo({ platform }: { platform: PlatformItem }) {
  if (platform.logo_url) {
    return (
      <img
        src={platform.logo_url}
        alt={platform.display_name}
        className="h-8 w-8 shrink-0 rounded-md border border-mg-border/60 bg-mg-bg-0 object-contain p-1"
      />
    )
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-mg-border/60 bg-brand-base/10 text-xs font-bold text-brand-base">
      {platform.display_name.charAt(0)}
    </span>
  )
}

/** 面板标题栏，统一设置区与目标区的密度和边界。 */
export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-mg-border/70 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h3 className="text-sm font-bold text-mg-text-1">{title}</h3>
        {description && <p className="mt-1 text-xs leading-5 text-mg-text-3">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
