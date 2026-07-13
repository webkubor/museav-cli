/**
 * API Key 详情抽屉（PRD v1.0.3）
 * 段落：基础信息 / 用量与限额 / 安全护栏 / 最近调用 / 操作审计
 * 抽屉头治理动作：轮转(gate) · 停用/启用 · 删除（变更负责人在治理批次接入）。
 * 详情/审计接口（#383/#384）未交付时以列表项兜底 + 空态降级，不阻塞、不报错。
 */
import { useState, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SideSheet } from '@/components/ui/SideSheet'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Select, { SelectItem } from '@/components/ui/Select'
import { CopyButton } from '@/components/ui/CopyButton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { LuShieldCheck, LuArrowRight, LuTriangleAlert, LuRefreshCw } from 'react-icons/lu'
import { formatDateTime } from '@/lib/format-date'
import { formatMoney } from '@/lib/utils'
import { appToast } from '@/lib/app-toast'
import { trackEvent } from '@/lib/track'
import { useCurrency } from '@/hooks/use-platform-config'
import { getApiKeyAudit, getApiKeyDetail, getEffectiveGuardrails, updateApiKey } from '@/services/api-keys'
import type { ApiKeyItem } from '@/types'
import { LIMIT_PERIOD_OPTIONS, type LimitPeriod } from './constants'
import {
  KEY_TYPE_LABEL,
  STATUS_LABEL,
  deriveKeyType,
  responsibleOf,
  periodSpendOf,
  cap,
  formatLimit,
  currentLimitPeriod,
  buildSpendingLimit,
} from './derive'

const STATUS_MAP = {
  active: { label: STATUS_LABEL.active, variant: 'success' as const, dot: true },
  rotation_required: { label: STATUS_LABEL.rotation_required, variant: 'info' as const },
  limited: { label: STATUS_LABEL.limited, variant: 'warning' as const },
  expired: { label: STATUS_LABEL.expired, variant: 'warning' as const },
  disabled: { label: STATUS_LABEL.disabled, variant: 'outline' as const },
  revoked: { label: STATUS_LABEL.revoked, variant: 'danger' as const },
}

function money(m?: { amount: string; currency: string }): string {
  return m?.amount ? `${m.currency} ${formatMoney(m.amount, '')}` : '—'
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-mg-text-3">{title}</h3>
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

// 键必须对齐后端 aggregation_scope 枚举（guardrail_total/per_member/per_api_key）——
// 曾误写成 workspace/member/api_key，导致 scopeLabel 全部 fallback 到原始枚举、UI 裸露「guardrail_total预算」。
const SCOPE_LABEL: Record<string, string> = {
  guardrail_total: '工作空间',
  per_member: '个人',
  per_api_key: 'API Key',
}
const PERIOD_UNIT_LABEL: Record<string, string> = {
  hour: '小时',
  day: '天',
  week: '周',
  month: '月',
}
const scopeLabel = (s: string) => SCOPE_LABEL[s] ?? s
const periodLabel = (len: number, unit: string) => `${len}${PERIOD_UNIT_LABEL[unit] ?? unit}`

interface Props {
  open: boolean
  onClose: () => void
  workspaceId: string
  item: ApiKeyItem | null
  canEdit: boolean
  canRevoke: boolean
  onToggleStatus: (item: ApiKeyItem) => void
  onRotate: (item: ApiKeyItem) => void
  onChangeOwner: (item: ApiKeyItem) => void
  onEdit: (item: ApiKeyItem) => void
  onRevoke: (target: { id: string; name: string }) => void
  /** 埋点 row_scope（workspace_all|self）——limit_save/jump_logs 带上 */
  rowScope?: string
}

export function ApiKeyDetailDrawer({ open, onClose, workspaceId, item, canEdit, canRevoke, onToggleStatus, onRotate, onChangeOwner, onEdit, onRevoke, rowScope }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { currency, symbol } = useCurrency()
  const keyId = item?.api_key_id

  // 内联「调整限额」（PRD §9.2）——抽屉内直接改限额金额+周期，不走整表单。
  // 用「正在编辑的 keyId」而非布尔：切换 Key 时编辑器自动收起，无需 effect。
  const [editingForKeyId, setEditingForKeyId] = useState<string | null>(null)
  const editingLimit = !!keyId && editingForKeyId === keyId
  const [limitPeriod, setLimitPeriod] = useState<LimitPeriod>('none')
  const [limitAmount, setLimitAmount] = useState('')
  const commonTrack = { prd_version: 'api_keys_v0_1', ...(rowScope ? { row_scope: rowScope } : {}) }

  const limitMutation = useMutation({
    mutationFn: () => {
      const value = buildSpendingLimit(limitPeriod, limitAmount, currency)
      return updateApiKey(workspaceId, keyId!, {
        spending_limit: { set: true, value: value ?? null },
      })
    },
    onSuccess: () => {
      appToast.success('限额已更新')
      setEditingForKeyId(null)
      queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['api-key-detail', workspaceId, keyId] })
      trackEvent('api_keys:limit_save', { ...commonTrack, new_limit_period: limitPeriod }, { result: 'success' })
    },
    onError: (err: unknown) => {
      appToast.requestError(err, '限额更新失败')
      trackEvent('api_keys:limit_save', { ...commonTrack, new_limit_period: limitPeriod }, { result: 'fail' })
    },
  })

  function openLimitEditor(current: ApiKeyItem) {
    setLimitPeriod(currentLimitPeriod(current))
    setLimitAmount(current.limit?.amount && Number(current.limit.amount) > 0 ? current.limit.amount : '')
    setEditingForKeyId(current.api_key_id)
  }

  function jumpLogs(path: string) {
    trackEvent('api_keys:jump_logs', commonTrack)
    navigate(path)
  }

  // 详情接口失败不静默降级：抽屉内显式错误块 + 重试（#444）。meta.silentError 抑制全局 toast，
  // 由下方错误块承接；不影响护栏/审计段的独立静默降级。
  const {
    data: detail,
    isError: detailError,
    isFetching: detailFetching,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['api-key-detail', workspaceId, keyId],
    queryFn: () => getApiKeyDetail(workspaceId, keyId!),
    enabled: open && !!keyId,
    retry: false,
    meta: { silentError: true },
  })
  const { data: audit } = useQuery({
    queryKey: ['api-key-audit', workspaceId, keyId],
    queryFn: () => getApiKeyAudit(workspaceId, keyId!).catch(() => undefined),
    enabled: open && !!keyId,
    retry: false,
  })
  // 三层生效护栏预览（qa#379）：resolver 合并组织/空间默认/Key 绑定后的最终规则；未交付时静默降级
  const { data: effective } = useQuery({
    queryKey: ['api-key-effective-guardrails', workspaceId, keyId],
    queryFn: () => getEffectiveGuardrails(workspaceId, keyId!).catch(() => undefined),
    enabled: open && !!keyId,
    retry: false,
  })

  if (!item) return <SideSheet open={open} onClose={onClose} width={520} />

  const view = detail ?? item
  const keyType = deriveKeyType(view)
  const responsible = responsibleOf(view)
  const creatorDiffers = view.owner?.account_id && responsible.account_id && view.owner.account_id !== responsible.account_id
  const usage = detail?.usage
  const recentCalls = detail?.recent_calls ?? []
  const auditRows = audit?.items ?? detail?.recent_audit ?? []
  const isDisabled = view.status === 'disabled'
  const canToggle = isDisabled ? cap(view.capabilities?.can_enable, canEdit) : cap(view.capabilities?.can_disable, canEdit)
  // 按后端 capability 正常渲染；rotate 路由未就绪（40401）时点击走 requestError → 「服务暂不可用」，不做死按钮/硬隐藏（qa#384/#385）
  const canRotate = canEdit && view.capabilities?.can_rotate === true
  const canDelete = cap(view.capabilities?.can_delete, canRevoke) && view.status !== 'revoked'

  return (
    <SideSheet open={open} onClose={onClose} title={item.name} width={520}>
      <div className="mt-4 space-y-6 overflow-y-auto pb-8">
        {/* 治理动作 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-mg-text-3">{view.masked}</span>
          <CopyButton value={view.masked} aria-label="复制掩码 Key" toast="掩码 Key 已复制" size="sm" />
          <div className="ml-auto flex flex-wrap gap-2">
            {canRotate && (
              <Button variant="outline" size="sm" onClick={() => onRotate(view)}>轮转</Button>
            )}
            {view.status !== 'revoked' && canToggle && (
              <Button variant="outline" size="sm" onClick={() => onToggleStatus(view)}>
                {isDisabled ? '启用' : '停用'}
              </Button>
            )}
            {view.status !== 'revoked' && canEdit && (
              <Button variant="outline" size="sm" onClick={() => onChangeOwner(view)}>变更负责人</Button>
            )}
            {view.status !== 'revoked' && canEdit && (
              <Button variant="outline" size="sm" onClick={() => onEdit(view)}>编辑</Button>
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

        {/* 详情加载失败：显式错误块 + 重试（#444）。仍以列表项兜底展示下方字段，不阻塞其它段。 */}
        {detailError && (
          <div className="flex items-start gap-2.5 rounded-md border border-mg-danger/25 bg-mg-danger/5 px-3 py-2.5">
            <LuTriangleAlert className="mt-0.5 w-4 h-4 shrink-0 text-mg-danger" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-mg-danger">{t('apiKeys.detailError.title')}</div>
              <p className="mt-0.5 text-xs text-mg-text-3">{t('apiKeys.detailError.desc')}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              loading={detailFetching}
              onClick={() => refetchDetail()}
            >
              <LuRefreshCw className="w-3.5 h-3.5 mr-1" />
              {t('apiKeys.detailError.retry')}
            </Button>
          </div>
        )}

        {/* 基础信息 */}
        <Section title="基础信息">
          <div className="rounded-md border border-mg-border bg-mg-fill-0/40 px-3 divide-y divide-mg-border/50">
            <Field label="类型" value={KEY_TYPE_LABEL[keyType]} />
            <Field label="负责人" value={responsible.display_name || responsible.email || '—'} />
            {creatorDiffers && (
              <Field label="创建人" value={view.owner.display_name || view.owner.email || '—'} />
            )}
            <Field label="状态" value={<StatusBadge status={view.status} statusMap={STATUS_MAP} fallback={view.status} />} />
            <Field label="到期时间" value={view.expires_at ? formatDateTime(view.expires_at) : '永不过期'} />
            <Field label="创建时间" value={view.created_at ? formatDateTime(view.created_at) : '—'} />
            <Field label="最近调用时间" value={view.last_used_at ? formatDateTime(view.last_used_at) : '尚未调用'} />
          </div>
        </Section>

        {/* 用量与限额 */}
        <Section
          title="用量与限额"
          action={
            !editingLimit && cap(view.capabilities?.can_update_limit, canEdit) && view.status !== 'revoked' ? (
              <button
                className="text-xs font-semibold text-brand-base hover:text-brand-deep transition-colors"
                onClick={() => openLimitEditor(view)}
              >
                调整限额
              </button>
            ) : undefined
          }
        >
          <div className="rounded-md border border-mg-border bg-mg-fill-0/40 px-3 divide-y divide-mg-border/50">
            <Field label="本期消费" value={money(usage?.period_spend ?? periodSpendOf(view))} />
            <Field label="请求数" value={usage?.request_count != null ? usage.request_count.toLocaleString() : '—'} />
            <Field label="Tokens" value={usage?.token_count != null ? usage.token_count.toLocaleString() : '—'} />
            <Field label="限额" value={formatLimit(view)} />
          </div>

          {/* 内联调整限额 */}
          {editingLimit && (
            <div className="mt-2 rounded-md border border-mg-border bg-mg-fill-0/40 p-3 space-y-2.5">
              <div className="flex gap-2.5">
                <Input
                  type="number" min="0" step="0.01"
                  value={limitAmount}
                  onChange={(e) => setLimitAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={limitPeriod === 'none'}
                  prefix={<span className="text-xs text-mg-text-3 font-mono select-none">{symbol}</span>}
                  className="flex-1"
                />
                <Select value={limitPeriod} onChange={(v) => setLimitPeriod(v as LimitPeriod)} className="w-24">
                  {LIMIT_PERIOD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingForKeyId(null)}>取消</Button>
                <Button variant="brand" size="sm" loading={limitMutation.isPending} onClick={() => limitMutation.mutate()}>
                  保存限额
                </Button>
              </div>
            </div>
          )}
        </Section>

        {/* 安全护栏 */}
        <Section title="安全护栏">
          {(view.guardrails ?? []).length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {(view.guardrails ?? []).map((g) => (
                <span key={g.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-500/10 border border-green-500/25 text-green-600">
                  <LuShieldCheck className="w-3 h-3" />
                  {g.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-mg-text-3">未绑定 Key 护栏</p>
          )}

          {/* 三层生效护栏预览（qa#379）：resolver 合并后的最终生效规则 */}
          {effective && (
            <div className="mt-2 rounded-md border border-mg-border bg-mg-fill-0/40 p-3 space-y-2">
              <div className="text-xs font-bold text-mg-text-2">生效预览</div>
              {effective.effective.budgets.length > 0 && (
                <div className="space-y-1">
                  {effective.effective.budgets.map((b, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-mg-text-3">{scopeLabel(b.aggregation_scope)}预算</span>
                      <span className="font-semibold text-mg-text-1">
                        {money({ amount: b.spend_limit_amount, currency: b.currency })} / {periodLabel(b.period_length, b.period_unit)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {effective.effective.model_blacklist.length > 0 && (
                <div className="text-xs">
                  <span className="text-mg-text-3">模型黑名单：</span>
                  <span className="text-mg-text-1">{effective.effective.model_blacklist.join('、')}</span>
                </div>
              )}
              {effective.effective.ip_whitelist.length > 0 && (
                <div className="text-xs">
                  <span className="text-mg-text-3">IP 白名单：</span>
                  <span className="font-mono text-mg-text-1">{effective.effective.ip_whitelist.join(', ')}</span>
                </div>
              )}
              {effective.effective.budgets.length === 0 &&
                effective.effective.model_blacklist.length === 0 &&
                effective.effective.ip_whitelist.length === 0 && (
                  <p className="text-xs text-mg-text-3">无生效限制</p>
                )}
              {/* enforcement_note 后端目前返回的是开发向说明（提及 CheckGuardrail/global_default/aggregation_scope 等内部实现），
                  不面向终端用户，暂不渲染；待后端改为用户可读文案后再放开（已在联调单反馈）。 */}
            </div>
          )}
        </Section>

        {/* 最近调用 */}
        <Section
          title="最近调用"
          action={
            <button
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-base hover:text-brand-deep"
              onClick={() => jumpLogs(`/workspace/${workspaceId}/logs`)}
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
                  onClick={() => jumpLogs(`/workspace/${workspaceId}/logs?log_id=${c.log_id}`)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-mg-border bg-mg-fill-0/40 px-3 py-2 text-left transition-colors hover:border-brand-base/35"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-mg-text-2">{c.model}</span>
                  <span className="text-xs text-mg-text-3">{formatDateTime(c.created_at)}</span>
                  <span className="font-mono text-xs text-mg-text-1">{money(c.cost)}</span>
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
                    <span className="text-xs text-mg-text-3">{formatDateTime(a.created_at)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-mg-text-3">
                    {a.actor_display || a.actor_account_id}
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
