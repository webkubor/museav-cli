/**
 * 面板顶部（PRD §7.1 顶部状态列 + §7.3 + §7.8 操作位互斥）。
 *
 * 结构固定三段：左侧标识或返回键、中段身份与服务状态、右侧唯一操作位。
 * 右侧那**一个**位置由 `MODE_SPEC[mode].headerAction` 决定，PRD §7.8 的原话是
 * 「服务记录入口与人工服务操作共用同一个位置并互斥展示」——所以这里刻意只有一个槽位，
 * 从结构上就不可能同时出现「历史图标」和「结束服务」。
 *
 * 未读表现按 §6.11 分三层，这里负责中间那层：**面板打开且普通问答时只显示蓝点、
 * 不显示数字**；关闭态的数字角标在入口按钮上，人工服务进行中则整个入口都不出现。
 */

import { LuArrowLeft, LuHistory } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { MODE_SPEC, type SupportMode } from '../machine'
import { SupportMark } from './SupportMark'
import type { ConnectionStatus } from '../use-cs-chat'

export interface PanelHeaderProps {
  mode: SupportMode
  connectionStatus: ConnectionStatus
  hasUnread: boolean
  /** 排队位次，queueing 模式下显示「排队中 · 前方 N 人」 */
  queuePosition?: number
  /** 客服姓名与工号，live 模式下显示 */
  agentLabel?: string | null
  /** ticket 模式下的工单编号与状态标签（§7.10：编号与状态统一在标题旁） */
  ticketId?: string
  ticketStatusLabel?: string
  onOpenRecords: () => void
  onBack: () => void
  onCancelQueue: () => void
  onCancelConnect: () => void
  onEndLive: () => void
  busy?: boolean
}

export function PanelHeader(props: PanelHeaderProps) {
  const { t } = useTranslation()
  const spec = MODE_SPEC[props.mode]
  const showBack = spec.headerAction === 'back'

  return (
    <header className="flex items-center gap-2.5 border-b border-mg-fill-0 bg-mg-bg-1 px-4 py-3">
      {showBack ? (
        <Button
          aria-label={props.mode === 'ticket'
            ? t('common.customerService.records.backToList')
            : t('common.customerService.records.backToChat')}
          icon={<LuArrowLeft size={16} />}
          onClick={props.onBack}
          size="small"
          variant="ghost"
        />
      ) : (
        <SupportMark size={26} status={spec.showsOnlineStatus ? props.connectionStatus : undefined} />
      )}

      <div className="min-w-0 flex-1">
        <p className="m-0 truncate mg-text-body font-semibold text-mg-text-1">{headerTitle(props, t)}</p>
        <div className="mt-px flex min-w-0 items-center gap-1.5 mg-text-meta text-mg-text-2">
          {headerSubtitle(props, t)}
        </div>
      </div>

      <HeaderAction {...props} />
    </header>
  )
}

type Translate = (key: string, options?: Record<string, unknown>) => string

function headerTitle(props: PanelHeaderProps, t: Translate) {
  if (props.mode === 'records') return t('common.customerService.records.title')
  if (props.mode === 'ticket') return t('common.customerService.ticket.title')
  if (props.mode === 'feedback') return t('common.customerService.feedback.title')
  return t('common.customerService.assistant')
}

function headerSubtitle(props: PanelHeaderProps, t: Translate) {
  if (props.mode === 'records') return <span>{t('common.customerService.records.subtitle')}</span>
  if (props.mode === 'ticket') {
    return (
      <>
        <span className="truncate font-mono">{props.ticketId}</span>
        {props.ticketStatusLabel ? (
          <Badge size="xs" variant="secondary">{props.ticketStatusLabel}</Badge>
        ) : null}
      </>
    )
  }
  if (props.mode === 'queueing') {
    return (
      <span aria-live="polite">
        {props.queuePosition === undefined
          ? t('common.customerService.handoff.queueing')
          : t('common.customerService.handoff.queueingWithPosition', { count: props.queuePosition })}
      </span>
    )
  }
  if (props.mode === 'connecting') {
    return <span aria-live="polite">{t('common.customerService.handoff.connecting')}</span>
  }
  if (props.mode === 'live') {
    return <span aria-live="polite">{props.agentLabel ?? t('common.customerService.handoff.connected')}</span>
  }
  // chat / feedback：ModelGo 标识 + 「智能助手」+ 绿色「在线」（§7.3）
  return (
    <>
      <StatusDot status={props.connectionStatus} />
      <span>{t(`common.customerService.${props.connectionStatus}`)}</span>
    </>
  )
}

function HeaderAction(props: PanelHeaderProps) {
  const { t } = useTranslation()
  const action = MODE_SPEC[props.mode].headerAction

  if (action === 'records') {
    return (
      <button
        aria-label={t('common.customerService.records.open')}
        className={cn(
          'relative inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-mg-text-2 transition-colors',
          'hover:bg-mg-fill-0 hover:text-mg-text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-glow',
        )}
        onClick={props.onOpenRecords}
        type="button"
      >
        <LuHistory aria-hidden="true" size={16} />
        {/* §7.8：存在未读时图标右上角显示蓝色圆点，不显示未读数字 */}
        {props.hasUnread ? (
          <span
            aria-label={t('common.customerService.records.unreadDot')}
            className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-brand-base"
            role="status"
          />
        ) : null}
      </button>
    )
  }

  if (action === 'cancel-queue' || action === 'cancel-connect') {
    return (
      <Button
        disabled={props.busy}
        onClick={action === 'cancel-queue' ? props.onCancelQueue : props.onCancelConnect}
        size="small"
        variant="ghost"
      >
        {action === 'cancel-queue'
          ? t('common.customerService.handoff.cancelQueue')
          : t('common.customerService.handoff.cancelConnect')}
      </Button>
    )
  }

  if (action === 'end-live') {
    return (
      <Button disabled={props.busy} onClick={props.onEndLive} size="small" variant="ghost">
        {t('common.customerService.handoff.end')}
      </Button>
    )
  }

  // back：返回键已在左侧，右侧留空占位，保持三段布局稳定
  return <span className="size-7 shrink-0" />
}

function StatusDot({ status }: { status: ConnectionStatus }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-1.5 shrink-0 rounded-full',
        status === 'online' ? 'bg-mg-success' : status === 'connecting' ? 'bg-mg-warning' : 'bg-mg-danger',
      )}
    />
  )
}
