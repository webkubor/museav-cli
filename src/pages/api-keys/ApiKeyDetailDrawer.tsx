/**
 * API Key 详情抽屉（PRD v1.0.3）
 * 段落：基础信息 / 用量 / 安全护栏 / 最近调用 / 操作审计
 * 抽屉头治理动作：轮转(gate) · 停用/启用 · 删除（PRD 无编辑/变更负责人，负责人为静态展示）。
 * 详情/审计接口（#383/#384）未交付时以列表项兜底 + 空态降级，不阻塞、不报错。
 */
import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SideSheet } from '@/components/ui/SideSheet'
import { Button } from '@/components/ui/Button'
import { InfoTip } from '@/components/ui/InfoTip'
import { CopyButton } from '@/components/ui/CopyButton'
import { LuArrowRight, LuTriangleAlert, LuRefreshCw, LuCopy, LuLoaderCircle } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { formatDateTimeYMD } from '@/lib/format-date'
import { formatMoney } from '@/lib/utils'
import { appToast } from '@/lib/app-toast'
import { trackEvent } from '@/lib/track'
import { errorCodeOf } from '@/lib/request-error-message'
import { getApiKeyAudit, getApiKeyDetail, getEffectiveGuardrails, revealApiKey } from '@/services/api-keys'
import { listGuardrails } from '@/services/guardrails'
import type { ApiKeyDetail, ApiKeyItem, ApiKeyType } from '@/types'
import { useCopy } from '@/hooks/use-copy'
import {
  deriveKeyType,
  keyTypeLabel,
  responsibleOf,
  periodSpendOf,
  isExpiredKey,
  cap,
  type ApiKeyAction,
} from './derive'
import {
  resolveKeyPromptInjection,
  activeGlobalGuardrail,
  activeMemberBudgetGuardrail,
  PROMPT_INJECTION_LABEL,
} from '../guardrails/derive'

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

/** 生效层槽位：PRD 原型「生效规则预览」为三层 全局 / 个人 / Key（modelgo_prd App.tsx preview.layers）；
 *  修正 #147 旧决策的两槽——个人护栏确实作用于 Key（预算闸门也展示个人预算），需求方#234/#241 判两槽为缺失。 */
const LAYER_SLOTS: Array<{ key: string; labelKey: string }> = [
  { key: 'global_default', labelKey: 'apiKeys.guardrail.global' },
  { key: 'member', labelKey: 'apiKeys.guardrail.member' },
  { key: 'key', labelKey: 'apiKeys.guardrail.key' },
]
const GATE_LABEL_KEY: Record<string, string> = {
  guardrail_total: 'apiKeys.budget.workspaceTotal',
  per_member: 'apiKeys.budget.member',
  per_api_key: 'apiKeys.budget.key',
}

const PERIOD_UNIT_LABEL_KEY: Record<string, string> = {
  hour: 'apiKeys.limit.unit.hour',
  day: 'apiKeys.limit.unit.day',
  week: 'apiKeys.limit.unit.week',
  month: 'apiKeys.limit.unit.month',
}

/** 生效预算周期文案：保留后端 period_length，避免「每 5 小时」被错误显示为「每小时」。 */
const periodLabel = (t: ReturnType<typeof useTranslation>['t'], unit: string, length: number) => {
  const normalizedLength = Number.isInteger(length) && length > 0 ? length : 1
  const label = PERIOD_UNIT_LABEL_KEY[unit] ? t(PERIOD_UNIT_LABEL_KEY[unit]) : unit
  return normalizedLength === 1 ? t('apiKeys.limit.every', { unit: label }) : t('apiKeys.limit.everyCount', { count: normalizedLength, unit: label })
}

const AUDIT_ACTION_LABEL_KEY: Record<string, string> = {
  'api_key.issued': 'apiKeys.auditAction.issued',
  'api_key.updated': 'apiKeys.auditAction.updated',
  'api_key.enabled': 'apiKeys.auditAction.enabled',
  'api_key.disabled': 'apiKeys.auditAction.disabled',
  'api_key.rotated': 'apiKeys.auditAction.rotated',
  'api_key.revoked': 'apiKeys.auditAction.revoked',
  'api_key.revealed': 'apiKeys.auditAction.revealed',
}

function auditActionLabel(t: ReturnType<typeof useTranslation>['t'], action: string): string {
  return AUDIT_ACTION_LABEL_KEY[action] ? t(AUDIT_ACTION_LABEL_KEY[action]) : action.replaceAll('_', ' ')
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
  onCompleteRotation: (item: ApiKeyItem) => void
  onRevoke: (target: { id: string; name: string }) => void
  /** 埋点 row_scope（workspace_all|self）——limit_save/jump_logs 带上 */
  rowScope?: string
  rotationTransition?: { keyId: string; oldMasked: string; newMasked: string; graceUntil?: string }
  /** 启用无二次确认、直达 mutation：抽屉按钮需 loading 反馈（停用走确认弹窗，弹窗自带 loading，此处无需重复） */
  enablePending?: boolean
  /** 轮转无二次确认、直达 mutation：抽屉按钮需 loading 反馈，防重复点击 */
  rotatePending?: boolean
}

export function ApiKeyDetailDrawer({ open, onClose, workspaceId, item, canAction, canReveal, onToggleStatus, onRotate, onCompleteRotation, onRevoke, rowScope, rotationTransition, enablePending, rotatePending }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const keyId = item?.api_key_id
  // 个人租户没有「成员」概念，个人护栏/个人预算两槽不适用（V1.0.7 小需求#9），与 use-guardrails-page.tsx 的 showMember 同一口径
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const tenants = useAuthStore((s) => s.tenants)
  const isPersonalTenant = tenants.find((tt) => tt.tenant_id === activeTenantId)?.type === 'personal'
  const visibleLayerSlots = isPersonalTenant ? LAYER_SLOTS.filter((slot) => slot.key !== 'member') : LAYER_SLOTS
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
      appToast.success(t('apiKeys.toast.copyFullKeySuccess'))
      trackEvent('api_keys:reveal', commonTrack, { source: 'detail_drawer', result: 'success' })
    } catch (err) {
      appToast.requestError(err, t('apiKeys.toast.copyFullKeyError'))
      trackEvent('api_keys:reveal', commonTrack, { source: 'detail_drawer', result: 'fail', error_code: errorCodeOf(err) })
    } finally {
      setRevealCopying(false)
    }
  }

  // 复制轮转后新 Token 完整值
  const [newRevealCopying, setNewRevealCopying] = useState(false)
  async function copyNewKey(current: ApiKeyItem) {
    if (newRevealCopying) return
    setNewRevealCopying(true)
    try {
      const res = await revealApiKey(workspaceId, current.api_key_id)
      await copy(res.key)
      appToast.success(t('apiKeys.toast.copyNewTokenSuccess'))
    } catch (err) {
      appToast.requestError(err, t('apiKeys.toast.copyNewTokenError'))
    } finally {
      setNewRevealCopying(false)
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
  // 护栏列表（用于解析提示词注入来源 + 个人护栏信息）
  const { data: guardrails } = useQuery({
    queryKey: ['guardrails', workspaceId],
    queryFn: () => listGuardrails(workspaceId).then((res) => res.items ?? []),
    enabled: open && !!workspaceId,
    retry: false,
  })

  if (!item) return <SideSheet open={open} onClose={onClose} ariaTitle={t('apiKeys.detail.title')} />

  // prd#102 空信封：后端把「无权限 / 已删除 / 不存在」统一收敛成 {"code":0,"data":{}}（防 key id 归属枚举，prd#649）。
  // `{}` 是真值但无字段——不能当详情用，否则 responsibleOf 取到 undefined、下面解引用直接抛 TypeError 崩抽屉（prd#664）。
  const filledDetail = detail?.api_key_id ? (detail as ApiKeyDetail) : undefined
  const detailInvisible = !!detail && !filledDetail
  const view = filledDetail ?? item
  const keyType = deriveKeyType(view)
  const responsible = responsibleOf(view)
  const usage = filledDetail?.usage
  const auditRows = audit?.items ?? filledDetail?.recent_audit ?? []
  // 生效护栏同样可能是空信封：守卫判的是「layers 有内容」，不是「对象非真值」——`{}` 会通过后者（prd#664）。
  // 归一化只做一次，下面的预览/预算/规则三段统一读它，避免每处各写一遍 `?.`。
  const effectiveLayers = effective?.layers
  const effectiveView = effectiveLayers && {
    layers: effectiveLayers,
    budgets: effective?.effective?.budgets ?? [],
    ipWhitelist: effective?.effective?.ip_whitelist ?? [],
    modelBlacklist: effective?.effective?.model_blacklist ?? [],
  }
  const rotationAudit = auditRows.find((row) => row.action === 'api_key.rotated')
  const rotationTokenChange = rotationAudit?.changes?.find((change) => change.field.toLowerCase() === 'token')
  const auditRotation = view.status === 'rotation_required' && view.previous_masked
    ? { keyId: view.api_key_id, oldMasked: view.previous_masked, newMasked: view.masked }
    : view.status === 'rotation_required' && rotationTokenChange?.before && rotationTokenChange.after
      ? { keyId: view.api_key_id, oldMasked: rotationTokenChange.before, newMasked: rotationTokenChange.after }
      : undefined
  const displayedRotation = rotationTransition ?? auditRotation
  const isDisabled = view.status === 'disabled'
  const canToggle = isDisabled ? cap(view.capabilities?.can_enable, canAction(keyType, 'disable')) : cap(view.capabilities?.can_disable, canAction(keyType, 'disable'))
  // 按后端 capability 正常渲染；rotate 路由未就绪（40401）时点击走 requestError → 「服务暂不可用」，不做死按钮/硬隐藏（qa#384/#385）
  // 已过期 Key 无轮转需求，不显示轮转按钮（需求方#485）
  const rotateEnabled = !isExpiredKey(view) && canAction(keyType, 'rotate') && view.capabilities?.can_rotate === true
  // 完成轮转（「已轮转」→ 立即销毁旧 token）与「开始轮转」同权限：否则只要能打开抽屉就能替他人 finalize，属审计缺口
  const canCompleteRotation = canAction(keyType, 'rotate')
  // 删除对所有状态开放（需求方#554：已撤销的也要能从列表清掉，后端软删）
  const canDelete = cap(view.capabilities?.can_delete, canAction(keyType, 'revoke'))

  return (
    <SideSheet open={open} onClose={onClose} title={item.name}>
      {/* 头部与标题间距由 SheetContent 的 gap-4 统一给出，勿再加 mt-* 造成双倍留白（需求方#182） */}
      <div className="space-y-6 pb-8">
        {/* 治理动作 */}
        <div className="flex flex-wrap items-center gap-2">
          {displayedRotation?.keyId === view.api_key_id ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className="rounded-sm bg-brand-base/10 px-1.5 py-0.5 text-[10px] font-bold text-brand-base">{t('apiKeys.rotate.new')}</span>
              <span className="truncate font-mono text-xs text-mg-text-2">{displayedRotation.newMasked}</span>
              <CopyButton value={displayedRotation.newMasked} aria-label={t('apiKeys.rotate.copyNewMaskedAria')} toast={t('apiKeys.toast.copyNewMaskedSuccess')} size="sm" />
              <span className="rounded-sm bg-mg-fill-1 px-1.5 py-0.5 text-[10px] font-bold text-mg-text-3">{t('apiKeys.rotate.old')}</span>
              <span className="truncate font-mono text-xs text-mg-text-3">{displayedRotation.oldMasked}</span>
            </div>
          ) : (
            <>
              <span className="font-mono text-xs text-mg-text-3">{view.masked}</span>
              {canReveal && view.revealable && view.status === 'active' ? (
                <button
                  type="button"
                  onClick={() => copyFullKey(view)}
                  aria-label={t('apiKeys.table.copyFullKey')}
                  title={t('apiKeys.table.copyFullKey')}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-mg-text-3 transition-colors hover:bg-mg-fill-0 hover:text-mg-text-1"
                >
                  {revealCopying ? <LuLoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <LuCopy className="h-3.5 w-3.5" />}
                </button>
              ) : (
                <CopyButton value={view.masked} aria-label={t('apiKeys.table.copyMaskedKey')} toast={t('apiKeys.toast.copyMaskedSuccess')} size="sm" />
              )}
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {view.status === 'rotation_required' ? (
              canCompleteRotation ? (
                <Button variant="outline" size="sm" onClick={() => onCompleteRotation(view)}>{t('apiKeys.table.rotated')}</Button>
              ) : null
            ) : rotateEnabled ? (
              <Button variant="outline" size="sm" loading={rotatePending} onClick={() => onRotate(view)}>{t('apiKeys.table.rotate')}</Button>
            ) : null}
            {view.status !== 'revoked' && canToggle && (
              <Button variant="outline" size="sm" loading={isDisabled && enablePending} onClick={() => onToggleStatus(view)}>
                {isDisabled ? t('apiKeys.table.enable') : t('apiKeys.table.disable')}
              </Button>
            )}
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                className="text-mg-danger border-mg-danger/30 hover:bg-mg-danger/5"
                onClick={() => onRevoke({ id: view.api_key_id, name: view.name })}
              >
                {t('apiKeys.table.delete')}
              </Button>
            )}
          </div>
        </div>

        {view.status === 'rotation_required' && (
          <div className="flex items-start gap-2.5 rounded-md border border-mg-warning/30 bg-mg-warning/10 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-mg-warning">{t('apiKeys.rotate.noticeTitle')}</div>
              <p className="mt-1 text-xs leading-5 text-mg-text-2">{t('apiKeys.rotate.noticeDesc')}</p>
              {canReveal && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  disabled={newRevealCopying}
                  onClick={() => copyNewKey(view)}
                >
                  {newRevealCopying ? <LuLoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" /> : <LuCopy className="mr-1 h-3.5 w-3.5" />}
                  {t('apiKeys.rotate.copyNewToken')}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* 详情不可见（prd#664）：空信封 = 无权限或已删除，后端刻意不区分两者。重试不会有结果，
            所以给的是「刷新列表」而非重试；下方字段仍以列表项兜底展示。 */}
        {detailInvisible && (
          <div className="flex items-start gap-2.5 rounded-md border border-mg-warning/30 bg-mg-warning/10 px-3 py-2.5">
            <LuTriangleAlert className="mt-0.5 w-4 h-4 shrink-0 text-mg-warning" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-mg-warning">{t('apiKeys.detailInvisible.title')}</div>
              <p className="mt-0.5 text-xs text-mg-text-3">{t('apiKeys.detailInvisible.desc')}</p>
            </div>
          </div>
        )}

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
        <Section title={t('apiKeys.detail.basic')}>
          <div className="grid grid-cols-3 gap-2.5">
            <Cell label={t('apiKeys.table.type')} value={keyTypeLabel(t, keyType)} />
            <Cell label={t('apiKeys.table.owner')} value={responsible.display_name || responsible.email || '—'} />
            <Cell label={t('apiKeys.table.expiresAt')} value={view.expires_at ? formatDateTimeYMD(view.expires_at) : t('apiKeys.table.neverExpires')} />
          </div>
        </Section>

        {/* 用量（原型 api-key-usage-grid 三格：本期消费/请求数/Tokens）。
            Key 级消费限额已按需求方定案移除（限额统一走安全护栏预算，见下方「安全护栏」预算闸门），
            故此段不再含「限额」与「调整限额」入口（需求方#122 / #84 ④作废）。 */}
        <Section title={t('apiKeys.detail.usage')}>
          <div className="grid grid-cols-3 gap-2.5">
            <Cell label={t('apiKeys.table.periodSpend')} value={money(usage?.period_spend ?? periodSpendOf(view))} />
            <Cell label={t('apiKeys.table.requests')} value={usage?.request_count != null ? usage.request_count.toLocaleString() : '—'} />
            <Cell label="Tokens" value={usage?.token_count != null ? usage.token_count.toLocaleString() : '—'} />
          </div>
        </Section>

        {/* 安全护栏（原型 EffectiveApiKeyGuardrailPreviewPanel，需求方#84） */}
        <Section title={t('apiKeys.detail.securityGuardrails')}>
          {effectiveView ? (
            <div className="space-y-3">
              {/* 生效规则预览：PRD 原型三层 全局 / 个人 / Key（modelgo_prd App.tsx preview.layers） */}
              <div>
                <div className="mb-1.5 flex items-center gap-1 text-xs font-bold text-mg-text-2">
                  {t('apiKeys.effectivePreview')}
                  <InfoTip text={t('apiKeys.budget.runtimeCheckTip')} />
                </div>
                <div className={`grid gap-2.5 ${visibleLayerSlots.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {visibleLayerSlots.map((slot) => {
                    // 个人护栏（member）：PRD 语义——服务 Key「个人预算不适用」；否则责任人绑定的 active 个人护栏(提额优先)，无则「全局默认个人预算」
                    if (slot.key === 'member') {
                      const isServiceKey = deriveKeyType(view) === 'service'
                      const memberGuardrail = isServiceKey || !guardrails ? null : activeMemberBudgetGuardrail(guardrails, responsibleOf(view).account_id)
                      const memberLabel = isServiceKey ? t('apiKeys.guardrail.memberBudgetNotApplicable') : memberGuardrail?.name ?? t('apiKeys.guardrail.globalDefaultMemberBudget')
                      const memberClass = isServiceKey ? 'font-normal text-mg-text-3' : memberGuardrail ? 'font-bold text-mg-text-1' : 'font-normal text-mg-text-2'
                      return (
                        <div key={slot.key} className="min-w-0 rounded-lg border border-mg-border/60 bg-mg-fill-0/30 px-3 py-2.5">
                          <div className="text-xs text-mg-text-3">{t(slot.labelKey)}</div>
                          <div className={`mt-1 truncate text-sm ${memberClass}`}>{memberLabel}</div>
                        </div>
                      )
                    }
                    // Key 层最多 1 常规 + 1 提额（PRD：一把 Key 最多 1 有效常规 Key 护栏 + 1 有效 Key 提额）——列出该层全部
                    const layers = effectiveView.layers.filter((l) => l.layer === slot.key)
                    return (
                      <div
                        key={slot.key}
                        className="min-w-0 rounded-lg border border-mg-border/60 bg-mg-fill-0/30 px-3 py-2.5"
                      >
                        <div className="text-xs text-mg-text-3">{t(slot.labelKey)}</div>
                        {layers.length > 0 ? (
                          <div className="mt-1 space-y-0.5">
                            {layers.map((l) => (
                              <div key={l.guardrail_id} className="flex items-center gap-1 truncate text-sm font-bold text-mg-text-1">
                                <span className="truncate">{l.guardrail_name || '—'}</span>
                                {l.is_default && <span className="shrink-0 text-xs font-normal text-mg-text-3">{t('apiKeys.guardrail.defaultBadge')}</span>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          // PRD 空值文案：全局→「未配置」，Key→「不使用Key护栏」
                          <div className="mt-1 text-sm font-normal text-mg-text-2">{slot.key === 'key' ? t('apiKeys.guardrail.none') : t('apiKeys.common.notConfigured')}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 预算闸门：按聚合口径逐档 + 来源护栏 */}
              {effectiveView.budgets.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1 text-xs font-bold text-mg-text-2">
                    {t('apiKeys.budget.gate')}
                    <InfoTip text={t('apiKeys.budget.stopTip')} />
                  </div>
                  <div className="space-y-2">
                    {effectiveView.budgets.map((b, i) => {
                      const source = effectiveView.layers.find((l) => l.guardrail_id === b.source_guardrail_id)?.guardrail_name
                      return (
                        <div key={i} className="rounded-lg border border-mg-border/60 bg-mg-fill-0/30 px-3 py-2.5">
                          <div className="text-xs text-mg-text-3">{GATE_LABEL_KEY[b.aggregation_scope] ? t(GATE_LABEL_KEY[b.aggregation_scope]) : b.aggregation_scope}</div>
                          <div className="mt-1 text-sm font-bold text-mg-text-1">
                            {money({ amount: b.spend_limit_amount, currency: b.currency })} / {periodLabel(t, b.period_unit, b.period_length)}
                          </div>
                          {source && <div className="mt-0.5 truncate text-xs text-mg-text-3">{source}</div>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 规则清单：模型黑名单 / IP白名单 / 提示词注入 三卡恒显示，各带「规则来源」
                  （PRD 原型 api-key-preview-rule-list；#241 原诉求「缺少规则来源字段」）
                  值空→「不限制」；来源=贡献该规则的护栏层名，空→「未配置规则」 */}
              <div className="grid grid-cols-3 gap-2.5">
                {(() => {
                  const items = effectiveView.modelBlacklist
                  const sources = effectiveView.layers.filter((l) => l.model_blacklist.length > 0).map((l) => l.guardrail_name)
                  return (
                    <div className="min-w-0 rounded-lg border border-mg-border/60 bg-mg-fill-0/30 px-3 py-2.5">
                      <div className="text-xs text-mg-text-3">{t('apiKeys.rule.modelBlacklist')}</div>
                      <div className="mt-1 break-all text-xs font-semibold leading-relaxed text-mg-text-1">{items.length ? items.join(' / ') : t('apiKeys.rule.unrestricted')}</div>
                      <div className="mt-1 text-xs text-mg-text-3">{t('apiKeys.rule.source', { source: sources.length ? sources.join(' / ') : t('apiKeys.rule.notConfigured') })}</div>
                    </div>
                  )
                })()}
                {(() => {
                  const items = effectiveView.ipWhitelist
                  const sources = effectiveView.layers.filter((l) => l.ip_whitelist.length > 0).map((l) => l.guardrail_name)
                  return (
                    <div className="min-w-0 rounded-lg border border-mg-border/60 bg-mg-fill-0/30 px-3 py-2.5">
                      <div className="text-xs text-mg-text-3">{t('apiKeys.rule.ipWhitelist')}</div>
                      <div className="mt-1 break-all font-mono text-xs font-semibold leading-relaxed text-mg-text-1">{items.length ? items.join(', ') : t('apiKeys.rule.unrestricted')}</div>
                      <div className="mt-1 text-xs text-mg-text-3">{t('apiKeys.rule.source', { source: sources.length ? sources.join(' / ') : t('apiKeys.rule.notConfigured') })}</div>
                    </div>
                  )
                })()}
                {(() => {
                  const pi = resolveKeyPromptInjection(guardrails ?? [], activeGlobalGuardrail(guardrails ?? []), t('apiKeys.rule.noGlobalGuardrail'))
                  return (
                    <div className="min-w-0 rounded-lg border border-mg-border/60 bg-mg-fill-0/30 px-3 py-2.5">
                      <div className="text-xs text-mg-text-3">{t('apiKeys.rule.promptInjection')}</div>
                      <div className="mt-1 text-sm font-bold text-mg-text-1">{t(`guardrails.promptInjection.mode.${pi.mode}`, { defaultValue: PROMPT_INJECTION_LABEL[pi.mode] })}</div>
                      <div className="mt-1 text-xs text-mg-text-3">{t('apiKeys.rule.source', { source: pi.sourceLabel })}</div>
                    </div>
                  )
                })()}
              </div>
              {/* enforcement_note 后端目前是开发向说明，不面向终端用户，暂不渲染（已在联调单反馈） */}
            </div>
          ) : (view.guardrails ?? []).length > 0 ? (
            <p className="text-xs text-mg-text-3">
              {t('apiKeys.guardrail.boundPreviewUnavailable', { names: (view.guardrails ?? []).map((g) => g.name).join('、') })}
            </p>
          ) : (
            <p className="text-xs text-mg-text-3">{t('apiKeys.guardrail.unbound')}</p>
          )}
        </Section>

        {/* 最近调用（原型 api-key-call-row 单卡摘要，需求方#84） */}
        <Section
          title={t('apiKeys.detail.lastCall')}
          action={
            <button
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-base hover:text-brand-deep"
              onClick={() => jumpLogs(`/logs?api_key=${view.api_key_id}`)}
            >
              {t('apiKeys.detail.jumpLogs')} <LuArrowRight size={12} />
            </button>
          }
        >
          {view.last_used_at ? (
            <div className="rounded-lg border border-mg-border/60 bg-mg-fill-0/30 px-3 py-2.5">
              <div className="text-sm font-bold text-mg-text-1">{formatDateTimeYMD(view.last_used_at)}</div>
              <div className="mt-0.5 text-xs text-mg-text-3">
                {usage?.request_count != null ? t('apiKeys.detail.requestCountValue', { count: usage.request_count.toLocaleString() }) : '—'}
                {' · '}
                {money(usage?.period_spend ?? periodSpendOf(view))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-mg-border/60 bg-mg-fill-0/30 px-3 py-2.5">
              <div className="text-sm font-semibold text-mg-text-1">{t('apiKeys.table.notCalled')}</div>
            </div>
          )}
        </Section>

        {/* 操作审计 */}
        <Section title={t('apiKeys.detail.audit')}>
          {auditRows.length > 0 ? (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {auditRows.slice(0, 50).map((a) => (
                <div key={a.id} className="border-l-2 border-brand-base/35 pl-4">
                  <div className="text-sm font-bold text-mg-text-1">{auditActionLabel(t, a.action)}</div>
                  <div className="mt-1 text-xs text-mg-text-2">
                    {formatDateTimeYMD(a.created_at)} · {a.actor_display || a.actor_account_id || '—'}
                  </div>
                  {a.target_label && <p className="mt-1 text-sm leading-relaxed text-mg-text-2">{a.target_label}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-mg-text-3">{t('apiKeys.detail.noAudit')}</p>
          )}
        </Section>
      </div>
    </SideSheet>
  )
}
