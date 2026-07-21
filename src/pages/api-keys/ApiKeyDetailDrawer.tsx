/**
 * API Key 详情抽屉（PRD v1.0.3）
 * 段落：基础信息 / 用量 / 安全护栏 / 最近调用 / 操作审计
 * 抽屉头治理动作：轮转(gate) · 停用/启用 · 删除（变更负责人在治理批次接入）。
 * 详情/审计接口（#383/#384）未交付时以列表项兜底 + 空态降级，不阻塞、不报错。
 */
import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SideSheet } from '@/components/ui/SideSheet'
import { Button } from '@/components/ui/Button'
import { CopyButton } from '@/components/ui/CopyButton'
import { LuArrowRight, LuTriangleAlert, LuRefreshCw, LuCopy, LuLoaderCircle } from 'react-icons/lu'
import { formatDateTime } from '@/lib/format-date'
import { formatMoney } from '@/lib/utils'
import { appToast } from '@/lib/app-toast'
import { trackEvent } from '@/lib/track'
import { getApiKeyAudit, getApiKeyDetail, getEffectiveGuardrails, revealApiKey } from '@/services/api-keys'
import type { ApiKeyItem, ApiKeyType } from '@/types'
import { useCopy } from '@/hooks/use-copy'
import {
  KEY_TYPE_LABEL,
  deriveKeyType,
  responsibleOf,
  periodSpendOf,
  cap,
  type ApiKeyAction,
} from './derive'

function money(m?: { amount: string; currency: string }): string {
  return m?.amount ? `${m.currency} ${formatMoney(m.amount, '')}` : '—'
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-mg-text-1">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

/** 原型式信息格：label 在上、值加粗在下（api-key-basic-grid / usage-grid，需求方#84） */
function Cell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-mg-border/60 bg-mg-fill-0/30 px-3 py-2.5">
      <div className="text-xs text-mg-text-3">{label}</div>
      <div className="mt-1 truncate text-sm font-bold text-mg-text-1">{value}</div>
    </div>
  )
}

/** 生效层槽位（PRD 安全护栏产品模型：个人护栏是「人」的策略，不参与 Key 生效——Key 详情只看全局 + Key，需求方#147） */
const LAYER_SLOTS: Array<{ key: string; label: string }> = [
  { key: 'global_default', label: '全局护栏' },
  { key: 'key', label: 'Key 护栏' },
]
const GATE_LABEL: Record<string, string> = {
  guardrail_total: '工作空间总预算',
  per_member: '个人预算',
  per_api_key: 'Key 预算',
}

const PERIOD_UNIT_LABEL: Record<string, string> = {
  hour: '小时',
  day: '天',
  week: '周',
  month: '月',
}
// 周期文案对齐护栏预算展示（formatBudget 的「/ 月」口径）：period_length 恒为 1，只取单位，
// 避免出现「1月」这类既像日期又冗余的文案（需求方#146）。
const periodLabel = (unit: string) => PERIOD_UNIT_LABEL[unit] ?? unit

const AUDIT_ACTION_LABEL: Record<string, string> = {
  'api_key.issued': '创建 API Key',
  'api_key.updated': '更新 API Key',
  'api_key.enabled': '启用 API Key',
  'api_key.disabled': '停用 API Key',
  'api_key.rotated': '轮转 API Key',
  'api_key.revoked': '删除 API Key',
  'api_key.revealed': '查看完整 Key',
}

function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action.replaceAll('_', ' ')
}

interface Props {
  open: boolean
  onClose: () => void
  workspaceId: string
  item: ApiKeyItem | null
  /** 行级动作权限（需求方#68）：按该行 Key 类型 × 动作取权限码 */
  canAction: (type: ApiKeyType, action: ApiKeyAction) => boolean
  /** 查看明文权限（api_keys:reveal）：控制「复制完整 Key」入口 */
  canReveal: boolean
  onToggleStatus: (item: ApiKeyItem) => void
  onRotate: (item: ApiKeyItem) => void
  onChangeOwner: (item: ApiKeyItem) => void
  onEdit: (item: ApiKeyItem) => void
  onRevoke: (target: { id: string; name: string }) => void
  /** 埋点 row_scope（workspace_all|self）——limit_save/jump_logs 带上 */
  rowScope?: string
}

export function ApiKeyDetailDrawer({ open, onClose, workspaceId, item, canAction, canReveal, onToggleStatus, onRotate, onChangeOwner, onEdit, onRevoke, rowScope }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const keyId = item?.api_key_id
  const { copy } = useCopy()
  // 复制完整 Key（需求方#84 ①）：reveal 取回明文再复制，掩码只是展示
  const [revealCopying, setRevealCopying] = useState(false)
  const commonTrack = { prd_version: 'api_keys_v0_1', ...(rowScope ? { row_scope: rowScope } : {}) }

  async function copyFullKey(current: ApiKeyItem) {
    if (revealCopying) return
    setRevealCopying(true)
    try {
      const res = await revealApiKey(workspaceId, current.api_key_id)
      await copy(res.key)
      appToast.success('完整 Key 已复制')
    } catch (err) {
      appToast.requestError(err, '复制完整 Key 失败')
    } finally {
      setRevealCopying(false)
    }
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

  if (!item) return <SideSheet open={open} onClose={onClose} ariaTitle="API Key 详情" width={520} />

  const view = detail ?? item
  const keyType = deriveKeyType(view)
  const responsible = responsibleOf(view)
  const creatorDiffers = view.owner?.account_id && responsible.account_id && view.owner.account_id !== responsible.account_id
  const usage = detail?.usage
  const auditRows = audit?.items ?? detail?.recent_audit ?? []
  const isDisabled = view.status === 'disabled'
  const canToggle = isDisabled ? cap(view.capabilities?.can_enable, canAction(keyType, 'disable')) : cap(view.capabilities?.can_disable, canAction(keyType, 'disable'))
  // 按后端 capability 正常渲染；rotate 路由未就绪（40401）时点击走 requestError → 「服务暂不可用」，不做死按钮/硬隐藏（qa#384/#385）
  const rotateEnabled = canAction(keyType, 'rotate') && view.capabilities?.can_rotate === true
  const canEdit = canAction(keyType, 'edit')
  const canDelete = cap(view.capabilities?.can_delete, canAction(keyType, 'revoke')) && view.status !== 'revoked'

  return (
    <SideSheet open={open} onClose={onClose} title={item.name} width={520}>
      {/* 头部与标题间距由 SheetContent 的 gap-4 统一给出，勿再加 mt-* 造成双倍留白（需求方#182） */}
      <div className="space-y-6 pb-8">
        {/* 治理动作 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-mg-text-3">{view.masked}</span>
          {canReveal && view.revealable && view.status === 'active' ? (
            <button
              type="button"
              onClick={() => copyFullKey(view)}
              aria-label="复制完整 Key"
              title="复制完整 Key"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-mg-text-3 transition-colors hover:bg-mg-fill-0 hover:text-mg-text-1"
            >
              {revealCopying ? <LuLoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <LuCopy className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <CopyButton value={view.masked} aria-label="复制掩码 Key" toast="掩码 Key 已复制" size="sm" />
          )}
          <div className="flex flex-wrap gap-2">
            {rotateEnabled && (
              <Button variant="outline" size="sm" onClick={() => onRotate(view)}>轮转</Button>
            )}
            {view.status !== 'revoked' && canToggle && (
              <Button variant="outline" size="sm" onClick={() => onToggleStatus(view)}>
                {isDisabled ? '启用' : '停用'}
              </Button>
            )}
            {view.status !== 'revoked' && canAction(keyType, 'change_owner') && (
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

        {/* 基础信息（原型 api-key-basic-grid：类型/负责人/到期时间 三格，需求方#84） */}
        <Section title="基础信息">
          <div className="grid grid-cols-3 gap-2.5">
            <Cell label="类型" value={KEY_TYPE_LABEL[keyType]} />
            <Cell label="负责人" value={responsible.display_name || responsible.email || '—'} />
            <Cell label="到期时间" value={view.expires_at ? formatDateTime(view.expires_at) : '永不过期'} />
            {creatorDiffers && (
              <Cell label="创建人" value={view.owner.display_name || view.owner.email || '—'} />
            )}
          </div>
        </Section>

        {/* 用量（原型 api-key-usage-grid 三格：本期消费/请求数/Tokens）。
            Key 级消费限额已按需求方定案移除（限额统一走安全护栏预算，见下方「安全护栏」预算闸门），
            故此段不再含「限额」与「调整限额」入口（需求方#122 / #84 ④作废）。 */}
        <Section title="用量">
          <div className="grid grid-cols-3 gap-2.5">
            <Cell label="本期消费" value={money(usage?.period_spend ?? periodSpendOf(view))} />
            <Cell label="请求数" value={usage?.request_count != null ? usage.request_count.toLocaleString() : '—'} />
            <Cell label="Tokens" value={usage?.token_count != null ? usage.token_count.toLocaleString() : '—'} />
          </div>
        </Section>

        {/* 安全护栏（原型 EffectiveApiKeyGuardrailPreviewPanel，需求方#84） */}
        <Section title="安全护栏">
          {effective ? (
            <div className="space-y-3">
              {/* 生效规则预览：全局 / Key 两槽（个人护栏不参与 Key 生效，PRD/需求方#147） */}
              <div>
                <div className="mb-1.5 text-xs font-bold text-mg-text-2">生效规则预览</div>
                <div className="grid grid-cols-2 gap-2.5">
                  {LAYER_SLOTS.map((slot) => {
                    // Key 层最多 1 常规 + 1 提额（PRD：一把 Key 最多 1 有效常规 Key 护栏 + 1 有效 Key 提额）——列出该层全部
                    const layers = effective.layers.filter((l) => l.layer === slot.key)
                    return (
                      <div
                        key={slot.key}
                        className="min-w-0 rounded-lg border border-mg-border/60 bg-mg-fill-0/30 px-3 py-2.5"
                      >
                        <div className="text-xs text-mg-text-3">{slot.label}</div>
                        {layers.length > 0 ? (
                          <div className="mt-1 space-y-0.5">
                            {layers.map((l) => (
                              <div key={l.guardrail_id} className="flex items-center gap-1 truncate text-sm font-bold text-mg-text-1">
                                <span className="truncate">{l.guardrail_name || '—'}</span>
                                {l.is_default && <span className="shrink-0 text-xs font-normal text-mg-text-3">(默认)</span>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-1 text-sm font-normal text-mg-text-3">—</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 预算闸门：按聚合口径逐档 + 来源护栏 */}
              {effective.effective.budgets.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-bold text-mg-text-2">预算闸门</div>
                  <div className="space-y-2">
                    {effective.effective.budgets.map((b, i) => {
                      const source = effective.layers.find((l) => l.guardrail_id === b.source_guardrail_id)?.guardrail_name
                      return (
                        <div key={i} className="rounded-lg border border-mg-border/60 bg-mg-fill-0/30 px-3 py-2.5">
                          <div className="text-xs text-mg-text-3">{GATE_LABEL[b.aggregation_scope] ?? b.aggregation_scope}</div>
                          <div className="mt-1 text-sm font-bold text-mg-text-1">
                            {money({ amount: b.spend_limit_amount, currency: b.currency })} / {periodLabel(b.period_unit)}
                          </div>
                          {source && <div className="mt-0.5 truncate text-xs text-mg-text-3">{source}</div>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 模型黑名单 / IP 白名单（有值才显示，含规则来源） */}
              {(effective.effective.model_blacklist.length > 0 || effective.effective.ip_whitelist.length > 0) && (
                <div className="grid grid-cols-2 gap-2.5">
                  {effective.effective.model_blacklist.length > 0 && (
                    <div className="min-w-0 rounded-lg border border-mg-border/60 bg-mg-fill-0/30 px-3 py-2.5">
                      <div className="text-xs text-mg-text-3">模型黑名单</div>
                      <div className="mt-1 break-all text-xs font-semibold leading-relaxed text-mg-text-1">
                        {effective.effective.model_blacklist.join(' / ')}
                      </div>
                    </div>
                  )}
                  {effective.effective.ip_whitelist.length > 0 && (
                    <div className="min-w-0 rounded-lg border border-mg-border/60 bg-mg-fill-0/30 px-3 py-2.5">
                      <div className="text-xs text-mg-text-3">IP 白名单</div>
                      <div className="mt-1 break-all font-mono text-xs font-semibold leading-relaxed text-mg-text-1">
                        {effective.effective.ip_whitelist.join(', ')}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {effective.effective.budgets.length === 0 &&
                effective.effective.model_blacklist.length === 0 &&
                effective.effective.ip_whitelist.length === 0 && (
                  <p className="text-xs text-mg-text-3">无生效限制</p>
                )}
              {/* enforcement_note 后端目前是开发向说明，不面向终端用户，暂不渲染（已在联调单反馈） */}
            </div>
          ) : (view.guardrails ?? []).length > 0 ? (
            <p className="text-xs text-mg-text-3">
              已绑定 {(view.guardrails ?? []).map((g) => g.name).join('、')}（生效预览接口暂不可用）
            </p>
          ) : (
            <p className="text-xs text-mg-text-3">未绑定 Key 护栏</p>
          )}
        </Section>

        {/* 最近调用（原型 api-key-call-row 单卡摘要，需求方#84） */}
        <Section
          title="最近调用"
          action={
            <button
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-base hover:text-brand-deep"
              onClick={() => jumpLogs(`/workspace/${workspaceId}/observability`)}
            >
              跳转日志 <LuArrowRight size={12} />
            </button>
          }
        >
          {view.last_used_at ? (
            <div className="rounded-lg border border-mg-border/60 bg-mg-fill-0/30 px-3 py-2.5">
              <div className="text-sm font-bold text-mg-text-1">{formatDateTime(view.last_used_at)}</div>
              <div className="mt-0.5 text-xs text-mg-text-3">
                {usage?.request_count != null ? `${usage.request_count.toLocaleString()} requests` : '—'}
                {' · '}
                {money(usage?.period_spend ?? periodSpendOf(view))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-mg-border/60 bg-mg-fill-0/30 px-3 py-2.5">
              <div className="text-sm font-semibold text-mg-text-1">尚未调用</div>
            </div>
          )}
        </Section>

        {/* 操作审计 */}
        <Section title="操作审计">
          {auditRows.length > 0 ? (
            <div className="space-y-3">
              {auditRows.slice(0, 8).map((a) => (
                <div key={a.id} className="border-l-2 border-brand-base/35 pl-4">
                  <div className="text-sm font-bold text-mg-text-1">{auditActionLabel(a.action)}</div>
                  <div className="mt-1 text-xs text-mg-text-2">
                    {formatDateTime(a.created_at)} · {a.actor_display || a.actor_account_id || '—'}
                  </div>
                  {a.target_label && <p className="mt-1 text-sm leading-relaxed text-mg-text-2">{a.target_label}</p>}
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
