/**
 * 智能助手的品牌标识与状态点（PRD §7.2）。
 *
 * PRD 要的是「右下角 ModelGo 圆形入口 + 在线状态点」，所以这里用站点自己的
 * icon（`useSiteIcon()` 随 `data-market` 在国内靛紫 / 海外翠绿两套资产间路由），
 * 不再用装饰性光球 —— DESIGN.md 的 Don'ts 把「装饰性光球 orbs」点名为 AI slop，
 * ui-guard 也有对应 WARN。状态由标识右下角一颗语义色点表达，不靠整体发光。
 */

import { cn } from '@/lib/utils'
import { useSiteIcon } from '@/config/brand-assets'
import type { ConnectionStatus } from '../use-cs-chat'

/** 状态点 → 语义色。三态与 §8 的降级口径对齐：在线 / 连接中 / 异常 */
const DOT_CLASS: Record<ConnectionStatus, string> = {
  online: 'bg-mg-success',
  connecting: 'bg-mg-warning',
  offline: 'bg-mg-danger',
}

export function SupportMark({
  size = 28,
  status,
  className,
}: {
  size?: number
  /** 不传就不画状态点（面板内标题旁已有文字状态，无需重复） */
  status?: ConnectionStatus
  className?: string
}) {
  const iconSrc = useSiteIcon()
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', className)}>
      <img alt="ModelGo" className="object-contain" height={size} src={iconSrc} width={size} />
      {status ? (
        <span
          aria-hidden="true"
          className={cn(
            'absolute -bottom-px -right-px size-2 rounded-full border border-mg-bg-2',
            DOT_CLASS[status],
          )}
        />
      ) : null}
    </span>
  )
}
