/**
 * API Key 详情抽屉（PRD v1.0.3）
 * 段落：基础信息 / 用量与限额 / 安全护栏 / 最近调用 / 操作审计
 * 抽屉头治理动作：轮转(gate) · 停用/启用 · 删除（变更负责人在治理批次接入）。
 * 详情/审计接口（#383/#384）未交付时以列表项兜底 + 空态降级，不阻塞、不报错。
 */
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { SideSheet } from '@/components/ui/SideSheet'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { LuShieldCheck, LuArrowRight } from 'react-icons/lu'
import { formatDateTime } from '@/lib/format-date'
import { formatMoney } from '@/lib/utils'
import { getApiKeyAudit, getApiKeyDetail } from '@/services/api-keys'
import type { ApiKeyItem } from '@/types'
import {
  KEY_TYPE_LABEL,
  STATUS_LABEL,
  deriveKeyType,
  responsibleOf,
  maintainerOf,
  periodSpendOf,
  cap,
} from './derive'

const STATUS_MAP = {
  active: { label: STATUS_LABEL.active, variant: 'success' as const, dot: true },
  disabled: { label: STATUS_LABEL.disabled, variant: 'outline' as const },
  expired: { label: STATUS_LABEL.expired, variant: 'warning' as const },
  limit_reached: { label: STATUS_LABEL.limit_reached, variant: 'warning' as const },
  revoked: { label: STATUS_LABEL.revoked, variant: 'danger' as const },
}

function money(m?: { amount: string; currency: string }): string {
  return m?.amount ? `${m.currency} ${formatMoney(m.amount, '')}` : '—'
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-mg-text-3">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-xs text-mg-text-3">{label}</span>
      <span className="text-xs font-semibold text-mg-text-1 text-right">{value}</span>
    </div>
  )
}

interface Props {
  open: boolean
  onClose: () => void
  workspaceId: string
  item: ApiKeyItem | null
  canManage: boolean
  onToggleStatus: (item: ApiKeyItem) => void
  onRotate: (item: ApiKeyItem) => void
  onChangeOwner: (item: ApiKeyItem) => void
  onRevoke: (target: { id: string; name: string }) => void
}

export function ApiKeyDetailDrawer({ open, onClose, workspaceId, item, canManage, onToggleStatus, onRotate, onChangeOwner, onRevoke }: Props) {
  const navigate = useNavigate()
  const keyId = item?.api_key_id

  // 详情/审计接口未交付时静默降级（catch→兜底值，避免全局错误 toast）
  const { data: detail } = useQuery({
    queryKey: ['api-key-detail', workspaceId, keyId],
    queryFn: () => getApiKeyDetail(workspaceId, keyId!).catch(() => undefined),
    enabled: open && !!keyId,
    retry: false,
  })
  const { data: audit } = useQuery({
    queryKey: ['api-key-audit', workspaceId, keyId],
    queryFn: () => getApiKeyAudit(workspaceId, keyId!).catch(() => []),
    enabled: open && !!keyId,
    retry: false,
  })

  if (!item) return <SideSheet open={open} onClose={onClose} width={520} />

  const view = detail ?? item
  const keyType = deriveKeyType(view)
  const responsible = responsibleOf(view)
  const maintainer = maintainerOf(view)
  const recentCalls = detail?.recent_calls ?? []
  const auditRows = audit ?? []
  const isDisabled = view.status === 'disabled'
  const canToggle = isDisabled ? cap(view.can_enable, canManage) : cap(view.can_disable, canManage)
  const canRotate = view.can_rotate === true // 端点未交付前严格隐藏
  const canDelete = cap(view.can_delete, canManage) && view.status !== 'revoked'

  return (
    <SideSheet open={open} onClose={onClose} title={item.name} width={520}>
      <div className="mt-4 space-y-6 overflow-y-auto pb-8">
        {/* 治理动作 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-mg-text-3">{view.masked}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {canRotate && (
              <Button variant="outline" size="sm" onClick={() => onRotate(view)}>轮转</Button>
            )}
            {view.status !== 'revoked' && canToggle && (
              <Button variant="outline" size="sm" onClick={() => onToggleStatus(view)}>
                {isDisabled ? '启用' : '停用'}
              </Button>
            )}
            {view.status !== 'revoked' && canManage && (
              <Button variant="outline" size="sm" onClick={() => onChangeOwner(view)}>变更负责人</Button>
            )}
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                className="text-mg-danger border-mg-danger/30 hover:bg-mg-danger/5"
                onClick={() => onRevoke({ id: view.api_key_id, name: view.name })}
              >
                删除
              </Button>
            )}
          </div>
        </div>

        {/* 基础信息 */}
        <Section title="基础信息">
          <div className="rounded-md border border-mg-border bg-mg-fill-0/40 px-3 divide-y divide-mg-border/50">
            <Field label="类型" value={KEY_TYPE_LABEL[keyType]} />
            <Field label="负责人" value={responsible.display_name || responsible.email || '—'} />
            <Field label="维护人" value={maintainer.display_name || maintainer.email || '—'} />
            <Field label="状态" value={<StatusBadge status={view.status} statusMap={STATUS_MAP} fallback={view.status} />} />
            <Field label="到期时间" value={view.expires_at ? formatDateTime(view.expires_at) : '永不过期'} />
          </div>
        </Section>

        {/* 用量与限额 */}
        <Section title="用量与限额">
          <div className="rounded-md border border-mg-border bg-mg-fill-0/40 px-3 divide-y divide-mg-border/50">
            <Field label="本期消费" value={money(periodSpendOf(view))} />
            <Field label="请求数" value={view.request_count != null ? view.request_count.toLocaleString() : '—'} />
            <Field label="Tokens" value={detail?.token_count != null ? detail.token_count.toLocaleString() : '—'} />
          </div>
        </Section>

        {/* 安全护栏 */}
        <Section title="安全护栏">
          {(view.guardrails ?? []).length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {(view.guardrails ?? []).map((g) => (
                <span key={g.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-500/10 border border-green-500/25 text-green-600">
                  <LuShieldCheck className="w-3 h-3" />
                  {g.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-mg-text-3">未绑定 Key 护栏</p>
          )}
        </Section>

        {/* 最近调用 */}
        <Section
          title="最近调用"
          action={
            <button
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-base hover:text-brand-deep"
              onClick={() => navigate(`/workspace/${workspaceId}/logs`)}
            >
              跳转日志 <LuArrowRight size={12} />
            </button>
          }
        >
          {recentCalls.length > 0 ? (
            <div className="space-y-1.5">
              {recentCalls.slice(0, 5).map((c) => (
                <button
                  key={c.log_id}
                  onClick={() => navigate(`/workspace/${workspaceId}/logs?log_id=${c.log_id}`)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-mg-border bg-mg-fill-0/40 px-3 py-2 text-left transition-colors hover:border-brand-base/35"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-mg-text-2">{c.model}</span>
                  <span className="text-[11px] text-mg-text-3">{formatDateTime(c.created_at)}</span>
                  <span className="font-mono text-[11px] text-mg-text-1">{money(c.cost)}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-mg-text-3">{view.last_used_at ? '暂无明细（详情接口待上线）' : '尚未调用'}</p>
          )}
        </Section>

        {/* 操作审计 */}
        <Section title="操作审计">
          {auditRows.length > 0 ? (
            <div className="space-y-2">
              {auditRows.slice(0, 8).map((a) => (
                <div key={a.id} className="rounded-md border border-mg-border bg-mg-fill-0/40 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-mg-text-1">{a.action}</span>
                    <span className="text-[11px] text-mg-text-3">{formatDateTime(a.created_at)}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-mg-text-3">
                    {a.actor?.display_name || a.actor?.email}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-mg-text-3">暂无审计记录（审计接口待上线）</p>
          )}
        </Section>
      </div>
    </SideSheet>
  )
}
