/** 调用日志详情与响应诊断；路由：/logs。 */
import { type ReactNode } from 'react'
import { MarkdownContent } from '@/components/ui/MarkdownContent'
import {
  LuClock3,
  LuDatabase,
  LuFileText,
  LuGauge,
  LuGitFork,
  LuReceiptText,
  LuShieldCheck,
  LuNetwork,
  LuArrowUpRight,
  LuDownload,
} from 'react-icons/lu'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { CodeBlock } from '@/components/ui/CodeBlock'
import { CopyButton } from '@/components/ui/CopyButton'
import { Money } from '@/components/ui/Money'
import { SideSheet } from '@/components/ui/SideSheet'
import { StatusBadge, type StatusConfig } from '@/components/ui/StatusBadge'
import { formatDateTimeWithSeconds, formatDuration } from '@/lib/format-date'
import { artifactGuideKey, artifactTone, taskTotalDuration } from './task-artifact'
import { cn, formatNumber } from '@/lib/utils'
import { listApiKeys } from '@/services/api-keys'
import { listTenantMembers } from '@/services/tenants'
import { getTask } from '@/services/tasks'
import { useAuthStore } from '@/store/auth'
import type { CallLogItem } from '@/types'
import {
  deriveLogStatus,
  guardrailAction,
  guardrailCategoryLabel,
  guardrailSourceLabel,
  isGuardrailHit,
  isModelNotStarted,
  isRedacted,
  modelCallState,
  REDACTION_PLACEHOLDER,
  type DerivedLogStatus,
} from './guardrail'
import { isAsyncCall } from './async-call'
import { cacheHitRateLabel, cacheTokenState, isCacheCardVisible } from './cache'
import type { SSEReassembled } from './reassemble-sse'

export type PayloadKind = 'request' | 'response'
export type PayloadView = 'parsed' | 'raw'

/** 派生三态 → StatusBadge 配置（详情头部与列表口径一致）。 */
function buildStatusMap(t: (key: string) => string): Record<DerivedLogStatus, StatusConfig> {
  return {
    success: { label: t('logs.status.success'), variant: 'success' },
    guarded: { label: t('logs.status.guarded'), variant: 'warning' },
    error: { label: t('logs.status.error'), variant: 'destructive' },
    canceled: { label: t('logs.status.canceled'), variant: 'secondary' },
  }
}

function formatMaybeDuration(ms: number | null | undefined) {
  if (!ms || ms <= 0) return '-'
  return formatDuration(ms)
}

function httpStatus(row: CallLogItem) {
  return row.http_status > 0 ? String(row.http_status) : '-'
}

function tokenFlow(row: CallLogItem) {
  return `${formatNumber(row.usage.input_tokens)} -> ${formatNumber(row.usage.output_tokens)}`
}

/**
 * 缓存卡 hint（需求方#885）：value 位让给命中率后，把原型 value 的「命中/未命中」
 * 语义降级到 hint，后半段保留 PRD 原型 getLogDiagnosticMetrics 的读/写/未读取三态。
 */
function cacheHintText(row: CallLogItem, t: (key: string, opts?: Record<string, unknown>) => string) {
  const { key, count } = cacheTokenState(row)
  const state = t(key === 'read' ? 'logs.detail.diagnostics.cacheHit' : 'logs.detail.diagnostics.cacheMiss')
  const tokens = key === 'none'
    ? t('logs.detail.diagnostics.cacheNone')
    : t(`logs.detail.diagnostics.cache${key === 'read' ? 'Read' : 'Write'}`, { count: formatNumber(count) })
  return `${state} · ${tokens}`
}

/** TPM：后端无独立字段，按总 Token / 时长换算（Token/min），与 TPS 同理。 */
function tpmLabel(row: CallLogItem) {
  if (row.duration_ms <= 0 || row.usage.total_tokens <= 0) return ''
  const tpm = Math.round(row.usage.total_tokens / (row.duration_ms / 60000))
  return `${formatNumber(tpm)} Token/min`
}

export function LogDetailSheet({
  requestPayloadText,
  responsePayloadText,
  responseSSE,
  payloadView,
  onPayloadViewChange,
  payloadLoading,
  onDownload,
  onClose,
  open,
  row,
  workspaceName,
  onOpenLogSettings,
  onOpenTask,
}: {
  requestPayloadText: string
  responsePayloadText: string
  responseSSE?: SSEReassembled | null
  payloadView: PayloadView
  onPayloadViewChange: (view: PayloadView) => void
  payloadLoading: boolean
  onDownload: () => void
  onClose: () => void
  open: boolean
  row: CallLogItem | null
  workspaceName?: string
  onOpenLogSettings?: (workspaceId: string) => void
  /** 跳转「任务产物」记录类型并打开该任务详情（需求方#954） */
  onOpenTask?: (requestId: string) => void
}) {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()
  // 查看请求/响应原文需 logs.payload:view（#479）：无权限不展示原文区,只给占位,绝不泄露 Prompt/Response
  const canViewPayload = hasPermission(PERMS.LOGS_PAYLOAD_VIEW)
  const statusMap = buildStatusMap(t)
  // 归属名称解析（#47）：model-logs 只回 id（api_key.name / account.display_name 实为 id），
  // 这里查成员/Key 列表映射成可读名称，取不到显示「—」，不再裸露 id。
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''
  const wsId = row?.workspace_id
  const { data: memberPage } = useQuery({
    queryKey: ['tenant-members', tenantId],
    queryFn: () => listTenantMembers(tenantId),
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
  })
  const { data: keyPage } = useQuery({
    queryKey: ['api-keys', wsId],
    queryFn: () => listApiKeys(wsId!),
    enabled: !!wsId,
    staleTime: 60_000,
  })
  // 任务产物探测（需求方#954）：多模态异步任务的提交日志与任务共用 request_id，
  // 打开详情时对 GET /async-tasks/{id} 打一枪，命中才渲染「任务产物」模块；
  // 纯同步调用后端回 404 → query error → 模块不出现，无需前端硬编码 call_type 名单。
  // meta.silentError：404 是探测的常态结果而非故障，禁止全局 toast 弹「请求失败」
  //（否则每次打开同步日志详情都会闪一条错误提示）。
  //
  // qa#719 起**优先用后端明确给的 async_task_id**，缺失才回落到 request_id 探测
  // （历史日志没有该字段）。两者都拿不到就不发请求，不伪造任务数据。
  const taskId = row?.async_task_id || row?.request_id
  const { data: asyncTask } = useQuery({
    queryKey: ['log-async-task', taskId],
    queryFn: () => getTask(taskId!),
    enabled: open && !!taskId,
    retry: false,
    staleTime: 60_000,
    meta: { silentError: true },
  })
  // `items` 由 getPage 在请求边界保证是数组（需求方#635 生产事故的根治点）；
  // 这里的 `?.` 只处理 react-query 加载中的 undefined。
  const member = row ? memberPage?.items.find((m) => m.account.account_id === row.account.account_id)?.account : undefined
  // API Key 名称（需求方#132）：空间 Key 列表命中优先 → 行内 name → masked → 「—」。
  // 全为空时是后端 model-logs 未回 api_key.name（现被填为 id/空，见 services/logs.ts #50），归后端。
  const apiKeyName = row
    ? keyPage?.items.find((k) => k.api_key_id === row.api_key.api_key_id)?.name
        || row.api_key.name || row.api_key.masked || '—'
    : '—'
  const memberName = member?.display_name || member?.email || '—'
  return (
    <SideSheet
      open={open}
      onClose={onClose}
      title={null}
      ariaTitle={t('logs.detail.title')}
      className="overflow-y-auto"
    >
      {row && (
        <div className="space-y-6">
          <header className="border-b border-mg-border pb-4">
            <h2 className="mg-text-title-sm font-bold text-mg-text-1">{t('logs.detail.title')}</h2>
            {/* 顶部 chips 只留 模型 + 状态（对齐原型 log-detail-chips）：
                调用类型(sync)/HTTP 状态码(403) 是技术细节，不当醒目标签甩给用户——
                HTTP 状态作为下方「请求链路」的字段行保留即可（需求方反馈）。 */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="max-w-full truncate">{row.model.display_name}</Badge>
              <StatusBadge status={deriveLogStatus(row)} statusMap={statusMap} />
            </div>
          </header>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {isModelNotStarted(row) && !isAsyncCall(row) ? (
              <>
                {/* 模型请求未发起（如预算拦截）：无耗时/Token/费用 → 两张定制诊断卡。
                    脱敏后继续的护栏命中不走这里，仍展示完整指标卡。 */}
                <DiagnosticCard icon={<LuShieldCheck />} label={t('logs.guardrail.requestStatus')} value={t(`logs.guardrail.action.${guardrailAction(row)}`)} hint={t('logs.guardrail.blockedHint')} tone="warning" />
                <DiagnosticCard icon={<LuNetwork />} label={t('logs.guardrail.modelRequest')} value={t('logs.guardrail.modelState.not_started')} hint={t('logs.guardrail.notStartedHint')} tone="brand" />
              </>
            ) : (
              <>
                <DiagnosticCard icon={<LuClock3 />} label={t('logs.detail.diagnostics.totalDuration')} value={formatMaybeDuration(row.duration_ms)} hint={isAsyncCall(row) ? t('logs.metrics.asyncNotCounted') : t('logs.detail.diagnostics.firstTokenHint', { value: formatMaybeDuration(row.speed.first_token_ms) })} tone={row.status === 'failed' ? 'danger' : 'brand'} />
                <DiagnosticCard icon={<LuReceiptText />} label={t('logs.detail.diagnostics.cost')} value={<Money amount={Number(row.cost.amount) > 0 ? row.cost.amount : null} currency={row.cost.currency} />} hint={row.billing_status ? row.billing_status.charAt(0).toUpperCase() + row.billing_status.slice(1) : t('logs.detail.diagnostics.billingStatusMissing')} tone="warning" />
                <DiagnosticCard icon={<LuDatabase />} label="Tokens" value={isAsyncCall(row) && !(row.usage?.total_tokens > 0) ? '—' : tokenFlow(row)} hint={t(isAsyncCall(row) && !(row.usage?.total_tokens > 0) ? 'logs.metrics.asyncNotCounted' : 'logs.detail.diagnostics.tokenFlowHint')} tone="success" />
                <DiagnosticCard icon={<LuGitFork />} label="Fallback" value={t('logs.detail.diagnostics.fallbackCount', { count: row.fallback_count })} hint={row.fallback_count > 0 ? t('logs.detail.diagnostics.fallbackTriggered') : t('logs.detail.diagnostics.fallbackNotTriggered')} tone={row.fallback_count > 0 ? 'warning' : 'brand'} />
                {/* 缓存卡只在 cache_supported === true 时渲染（需求方#885）：false 或字段缺失
                    一律隐藏，出图/语音/TTS 不再显「未命中 · 0 tokens」。展示时 5 张卡在 2 列下
                    第 5 张会孤行留半空——让「缓存」占满整行；隐藏时恰好 2×2。 */}
                {isCacheCardVisible(row) && (
                  <DiagnosticCard className="sm:col-span-2" icon={<LuGauge />} label={t('logs.detail.diagnostics.cache')} value={cacheHitRateLabel(row)} hint={cacheHintText(row, t)} tone={row.usage.cache_read_tokens > 0 ? 'success' : 'brand'} />
                )}
              </>
            )}
          </section>

          <DetailSection title={t('logs.detail.sections.overview')}>
            <DetailGrid compact>
              <DetailRow label={t('logs.detail.model')} value={row.model.display_name} />
              {/* 空间名取不到显「—」，不拿 workspace_id 顶替——口径同下方 Member/API Key（需求方#447）。 */}
              <DetailRow label={t('logs.detail.workspace')} value={workspaceName || '—'} />
              <DetailRow label={t('logs.detail.apiKeyName')} value={apiKeyName} />
              <DetailRow label={t('logs.detail.member')} value={memberName} />
            </DetailGrid>
          </DetailSection>

          {isGuardrailHit(row) && (
            <DetailSection title={t('logs.guardrail.sectionTitle')}>
              <DetailGrid compact>
                {/* 命中规则显示命中「类别」(如 Key 预算)，取后端语义 category(#461)；缺失显「—」，不兜底假标签。规则实例名在下方「规则来源」展示。 */}
                <DetailRow label={t('logs.guardrail.hitRule')} value={guardrailCategoryLabel(row, t) || '—'} />
                <DetailRow label={t('logs.guardrail.result')} value={t(`logs.guardrail.action.${guardrailAction(row)}`)} />
                {/* 规则来源 = 作用域前缀（全局/Key/成员护栏）+ · + 规则展示名（后端契约 #450） */}
                <DetailRow label={t('logs.guardrail.ruleSource')} value={guardrailSourceLabel(row, t)} />
                <DetailRow label={t('logs.guardrail.modelCall')} value={t(`logs.guardrail.modelState.${modelCallState(row)}`)} />
              </DetailGrid>
            </DetailSection>
          )}

          <DetailSection title={t('logs.detail.sections.request')}>
            {/* 字段顺序对齐 PRD 原型 LogDetailDrawer 「请求」区：Request ID → Trace ID → 调用时间
                → HTTP 状态 → 计费状态 →（billable 时）调用类型 → TPOT → TPM。单列布局（非 compact）。 */}
            <DetailGrid>
              <DetailRow label="Request ID" value={row.request_id} mono />
              <DetailRow label="Trace ID" value={row.trace_id} mono />
              <DetailRow label={t('logs.detail.time')} value={formatDateTimeWithSeconds(row.started_at)} />
              <DetailRow label={t('logs.detail.httpStatus')} value={httpStatus(row)} mono />
              <DetailRow label={t('logs.detail.billingStatus')} value={row.billing_status} />
              {!isModelNotStarted(row) && <DetailRow label={t('logs.detail.callType')} value={row.call_type} />}
              {!isAsyncCall(row) && <DetailRow label="TPOT" value={row.tpot_ms > 0 ? `${row.tpot_ms}ms` : ''} mono />}
              {!isAsyncCall(row) && <DetailRow label="TPM" value={tpmLabel(row)} mono />}
            </DetailGrid>
          </DetailSection>

          {asyncTask?.task && (
            <DetailSection title={t('logs.detail.taskArtifact.title')}>
              <p className={cn('mg-text-caption', artifactTone(asyncTask.task.artifact_state))}>
                {t(`logs.detail.taskArtifact.guide.${artifactGuideKey(asyncTask.task.artifact_state)}`)}
              </p>
              <DetailGrid compact>
                <DetailRow label={t('logs.detail.taskArtifact.taskStatus')} value={t(`status.${asyncTask.task.status}`, { defaultValue: asyncTask.task.status })} />
                <DetailRow label={t('logs.detail.taskArtifact.artifactState')} value={asyncTask.task.artifact_state ? t(`artifactState.${asyncTask.task.artifact_state}`, { defaultValue: asyncTask.task.artifact_state }) : '—'} />
                {(() => {
                  const ms = taskTotalDuration(asyncTask.task)
                  return ms === null ? null : (
                    <DetailRow
                      label={t('logs.detail.taskArtifact.totalDuration')}
                      value={<span title={t('logs.detail.taskArtifact.totalDurationHint')}>{formatDuration(ms)}</span>}
                      mono
                    />
                  )
                })()}
              </DetailGrid>
              {/* 跳转用与探测同一个 taskId：若这里退回 request_id，探到的任务和跳过去的
                  可能不是同一个（后端 async_task_id 与 request_id 不保证相等，见 qa#719）。 */}
              {onOpenTask && (
                <Button variant="outline" size="sm" onClick={() => onOpenTask(taskId!)}>
                  {t('logs.detail.taskArtifact.viewTask')}
                  <LuArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              )}
            </DetailSection>
          )}

          <DetailSection title={t('logs.detail.sections.responseTiming')}>
            <ResponseTiming row={row} />
          </DetailSection>

          {/* 原型 LogDetailDrawer 无「异常报错信息」红框——护栏命中/500 故障都不飘红、不 dump raw error
              （含 guardrail ULID/IP/stack 的内部技术文案不对终端用户展示，需求方#73）。错误/护栏信息由
              状态 pill + 诊断卡 tone + 「响应未生成」中性提示表达，与原型一致，此块整体移除。 */}

          {/* 无 logs.payload:view 权限：整块不渲染（不给占位/提示，后台没勾即 UI 不存在，需求方#101） */}
          {canViewPayload && (
            <TranscriptSection
              row={row}
              requestPayloadText={requestPayloadText}
              responsePayloadText={responsePayloadText}
              responseSSE={responseSSE}
              payloadView={payloadView}
              onPayloadViewChange={onPayloadViewChange}
              payloadLoading={payloadLoading}
              onDownload={onDownload}
              onOpenLogSettings={onOpenLogSettings}
            />
          )}

          {/* 需求方#143：复制 Trace 的入口已就近放在头部 Trace ID 旁（小图标按钮），
              不再于底部放独立「复制 Trace」按钮，避免复制入口远离 Trace ID。 */}
        </div>
      )}
    </SideSheet>
  )
}

type DiagnosticTone = 'brand' | 'success' | 'warning' | 'danger'
const DIAGNOSTIC_TONE: Record<DiagnosticTone, string> = {
  brand: 'bg-brand-base/10 text-brand-base',
  success: 'bg-mg-success/10 text-mg-success',
  warning: 'bg-mg-warning/10 text-mg-warning',
  danger: 'bg-mg-danger/10 text-mg-danger',
}

function DiagnosticCard({ hint, icon, label, value, tone = 'brand', className }: { hint: string; icon: ReactNode; label: string; value: ReactNode; tone?: DiagnosticTone; className?: string }) {
  return (
    <article className={cn('min-w-0 rounded-md border border-mg-border bg-mg-bg-0 p-[var(--mg-panel-padding-md)]', className)}>
      <span className="flex items-center gap-2 mg-text-label text-mg-text-3">
        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5', DIAGNOSTIC_TONE[tone])}>{icon}</span>
        {label}
      </span>
      <strong className="mt-2 block truncate mg-text-value font-bold text-mg-text-1">{value}</strong>
      <small className="mt-1 block truncate mg-text-caption text-mg-text-3">{hint}</small>
    </article>
  )
}

function DetailSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="space-y-3">
      <h3 className="mg-text-label text-mg-text-3">{title}</h3>
      {children}
    </section>
  )
}

function DetailGrid({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return <div className={cn('rounded-md border border-mg-border', compact && 'grid sm:grid-cols-2')}>{children}</div>
}

function DetailRow({ label, mono = false, value }: { label: string; mono?: boolean; value: ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-center justify-between gap-4 border-b border-mg-border/60 px-[var(--mg-table-cell-px)] py-[var(--mg-table-cell-py)] last:border-b-0">
      <span className="shrink-0 mg-text-caption font-bold text-mg-text-3">{label}</span>
      <strong className={cn('min-w-0 break-all text-right mg-text-caption font-semibold text-mg-text-1', mono && 'font-mono')}>
        {value}
      </strong>
    </div>
  )
}

function ResponseTiming({ row }: { row: CallLogItem }) {
  const { t } = useTranslation()
  if (isAsyncCall(row)) {
    return <p className="mg-text-caption text-mg-text-3">{t('logs.metrics.asyncNotCounted')}</p>
  }
  if (isModelNotStarted(row)) {
    return (
      <div className="rounded-md border border-mg-border bg-mg-fill-0/30 p-[var(--mg-panel-padding-md)]">
        <strong className="block mg-text-caption text-mg-text-1">{t('logs.guardrail.modelState.not_started')}</strong>
        <span className="block mg-text-caption text-mg-text-3">{t('logs.guardrail.notStartedHint')}</span>
      </div>
    )
  }
  const total = row.duration_ms
  const ftt = row.speed.first_token_ms
  const streaming = ftt > 0 && total > ftt
  return (
    <div className="space-y-3 rounded-md border border-mg-border bg-mg-bg-0 p-[var(--mg-panel-padding-md)]">
      {streaming ? (
        <>
          {/* 流式耗时按时间轴瀑布展示（需求方#144）：首 Token 从 0 起；
              响应生成段从首 Token 结束处起（offsetMs=ftt）靠右延伸，而非从左侧铺满。 */}
          <TimingBar label={t('logs.detail.timing.firstToken')} durationMs={ftt} totalMs={total} tone="success" />
          <TimingBar label={t('logs.detail.timing.generation')} durationMs={total - ftt} offsetMs={ftt} totalMs={total} tone="brand" />
        </>
      ) : (
        <TimingBar label={t('logs.detail.timing.totalResponse')} durationMs={total} totalMs={total} tone={row.status === 'failed' ? 'danger' : 'brand'} />
      )}
      {row.usage.total_tokens > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-mg-border/60 pt-3">
          <span className="inline-flex items-center rounded-full bg-mg-success/10 px-2.5 py-0.5 mg-text-caption font-semibold text-mg-success">
            {t('logs.detail.timing.inputTokens', { count: formatNumber(row.usage.input_tokens) })}
          </span>
          <span className="inline-flex items-center rounded-full bg-brand-base/10 px-2.5 py-0.5 mg-text-caption font-semibold text-brand-base">
            {t('logs.detail.timing.outputTokens', { count: formatNumber(row.usage.output_tokens) })}
          </span>
        </div>
      )}
    </div>
  )
}

function TimingBar({ durationMs, label, tone, totalMs, offsetMs = 0 }: { durationMs: number; label: string; tone: 'success' | 'brand' | 'danger'; totalMs: number; offsetMs?: number }) {
  const rawPct = totalMs > 0 ? (durationMs / totalMs) * 100 : 100
  const offsetPct = totalMs > 0 ? Math.max(0, Math.min(100, (offsetMs / totalMs) * 100)) : 0
  // 段宽不超过剩余轨道（offset+width ≤ 100），保底 6% 让极短段仍可见。
  const pct = Math.max(6, Math.min(100 - offsetPct, rawPct))
  const barColor = tone === 'success' ? 'bg-mg-success' : tone === 'danger' ? 'bg-mg-danger' : 'bg-brand-base'
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 mg-text-caption text-mg-text-2">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-mg-fill-1">
        <span className={cn('block h-2 rounded-full', barColor)} style={{ width: `${pct}%`, marginLeft: `${offsetPct}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right font-mono mg-text-caption font-bold text-mg-text-1">{formatMaybeDuration(durationMs)}</span>
    </div>
  )
}

const ROLE_TONE: Record<string, { key: string; cls: string }> = {
  system: { key: 'system', cls: 'text-brand-base' },
  user: { key: 'user', cls: 'text-mg-warning' },
  assistant: { key: 'assistant', cls: 'text-mg-success' },
  tool: { key: 'tool', cls: 'text-mg-text-3' },
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((p) => (typeof p === 'string' ? p : (p as { text?: string })?.text ?? JSON.stringify(p))).join('\n')
  if (content == null) return ''
  return JSON.stringify(content, null, 2)
}

/** 把 OpenAI 风格 payload 解析成消息列表：请求取 messages[]，响应取 choices[].message；解析不了返回 null（回退原文）。 */
function parseMessages(text: string): { role: string; content: string }[] | null {
  if (!text) return null
  try {
    const obj = JSON.parse(text) as { messages?: unknown[]; choices?: unknown[] }
    if (Array.isArray(obj?.messages)) {
      return obj.messages.map((m) => {
        const msg = m as { role?: string; content?: unknown }
        return { role: String(msg.role || 'user'), content: contentToText(msg.content) }
      })
    }
    if (Array.isArray(obj?.choices)) {
      return obj.choices.map((c) => {
        const msg = (c as { message?: { role?: string; content?: unknown } }).message
        return { role: String(msg?.role || 'assistant'), content: contentToText(msg?.content) }
      })
    }
    return null
  } catch {
    return null
  }
}

function MessageBubble({ content, role }: { content: string; role: string }) {
  const { t } = useTranslation()
  const tone = ROLE_TONE[role.toLowerCase()]
  const label = tone ? t(`logs.detail.payload.role.${tone.key}`) : role
  return (
    <div className="rounded-md border border-mg-border/60 bg-mg-fill-0/30 p-3">
      <div className={cn('mb-1 mg-text-caption font-bold', tone?.cls ?? 'text-mg-text-3')}>{label}</div>
      <p className="whitespace-pre-wrap break-words mg-text-caption text-mg-text-1">{content || t('logs.detail.payload.emptyContent')}</p>
    </div>
  )
}

/** 还原出的助手回答用 Markdown 渲染（标题/列表/代码块等），复用平台助手聊天 / 模型体验同款 cs-markdown 样式。 */
function MarkdownBubble({ label, content, tone }: { label: string; content: string; tone: 'success' | 'brand' }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-md border border-mg-border/60 bg-mg-fill-0/30 p-3">
      <div className={cn('mb-1 mg-text-caption font-bold', tone === 'success' ? 'text-mg-success' : 'text-brand-base')}>{label}</div>
      {content ? (
        <MarkdownContent className="text-mg-text-1">{content}</MarkdownContent>
      ) : (
        <p className="mg-text-caption text-mg-text-1">{t('logs.detail.payload.emptyContent')}</p>
      )}
    </div>
  )
}

/** SSE 合并信息（chunk 数 / finish_reason / usage）改走 pill 徽标，别再拼进纯文本里跟正文糊一块。 */
function SSEMetaBadges({ sse }: { sse: SSEReassembled }) {
  const { t } = useTranslation()
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-mg-border/60 pt-3">
      <span className="inline-flex items-center rounded-full bg-mg-fill-1 px-2.5 py-0.5 mg-text-caption font-semibold text-mg-text-2">
        {t('logs.detail.payload.mergedChunks', { count: sse.chunkCount })}
      </span>
      {sse.finishReason && (
        <span className="inline-flex items-center rounded-full bg-mg-fill-1 px-2.5 py-0.5 mg-text-caption font-semibold text-mg-text-2">
          finish_reason: {sse.finishReason}
        </span>
      )}
      {sse.usage != null && (
        <span className="inline-flex items-center rounded-full bg-mg-fill-1 px-2.5 py-0.5 mg-text-caption font-mono text-mg-text-3">
          usage: {JSON.stringify(sse.usage)}
        </span>
      )}
    </div>
  )
}

function TranscriptCard({ pretty, text, title, sse }: { pretty: boolean; text: string; title: string; sse?: SSEReassembled | null }) {
  const { t } = useTranslation()
  const messages = pretty ? parseMessages(text) : null
  // 流式回答还原出的 Pretty 视图：内容多为 Markdown（标题/列表/代码），走小卡片 + Markdown 渲染，
  // 而不是把合并信息拼成一段纯文本丢进 CodeBlock（此前唯一路径，parseMessages 认不出这段合并摘要）。
  if (pretty && sse) {
    return (
      <div className="rounded-md border border-mg-border bg-mg-bg-0 p-[var(--mg-panel-padding-md)]">
        <div className="mb-2 mg-text-caption font-bold text-mg-text-2">{title}</div>
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {sse.reasoning && <MarkdownBubble label={t('logs.detail.payload.reasoning')} content={sse.reasoning} tone="brand" />}
          <MarkdownBubble label={t('logs.detail.payload.answer')} content={sse.content} tone="success" />
        </div>
        <SSEMetaBadges sse={sse} />
      </div>
    )
  }
  return (
    <div className="rounded-md border border-mg-border bg-mg-bg-0 p-[var(--mg-panel-padding-md)]">
      <div className="mb-2 mg-text-caption font-bold text-mg-text-2">{title}</div>
      {messages && messages.length > 0 ? (
        // 限高 + 滚动：长对话（多条/长内容）不再把抽屉整体顶得无限长，与 JSON 原文的 max-h-80 一致
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {messages.map((m, i) => <MessageBubble key={`${m.role}-${i}`} role={m.role} content={m.content} />)}
        </div>
      ) : (
        <CodeBlock className="max-h-80">{text || t('logs.detail.payload.noContent')}</CodeBlock>
      )}
    </div>
  )
}

function ViewToggle({ onChange, value }: { onChange: (view: PayloadView) => void; value: PayloadView }) {
  const { t } = useTranslation()
  return (
    <div className="inline-flex rounded-md border border-mg-border p-0.5">
      {(['parsed', 'raw'] as PayloadView[]).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn('rounded-sm px-2 py-0.5 mg-text-caption font-bold', value === v ? 'bg-brand-selected-bg text-brand-base' : 'text-mg-text-3 hover:text-mg-text-1')}
        >
          {v === 'parsed' ? t('logs.detail.payload.parsedView') : t('logs.detail.payload.rawView')}
        </button>
      ))}
    </div>
  )
}

function TranscriptSection({ onDownload, onPayloadViewChange, payloadLoading, payloadView, requestPayloadText, responsePayloadText, responseSSE, row, onOpenLogSettings }: {
  onDownload: () => void
  onPayloadViewChange: (view: PayloadView) => void
  payloadLoading: boolean
  payloadView: PayloadView
  requestPayloadText: string
  responsePayloadText: string
  responseSSE?: SSEReassembled | null
  row: CallLogItem
  onOpenLogSettings?: (workspaceId: string) => void
  /** 跳转「任务产物」记录类型并打开该任务详情（需求方#954） */
  onOpenTask?: (requestId: string) => void
}) {
  const { t } = useTranslation()
  // 脱敏后继续：Request 只展示替换后的占位符，绝不展示原文（同时用于复制）。
  const redacted = isRedacted(row)
  const requestText = redacted ? REDACTION_PLACEHOLDER : requestPayloadText
  // 响应是否产出：模型未发起（护栏拦截/rejected）或无输出即视为未生成，对齐 PRD 的响应态分支。
  const responseGenerated = !isModelNotStarted(row) && (responsePayloadText.length > 0 || row.usage.output_tokens > 0)
  // 响应未生成的原因：中性人话文案，不 dump raw row.error（技术文案含 ULID/IP，需求方#73 对齐原型）。
  // 护栏拦截 → 护栏提示；其余（含 5xx 故障）→ 中性「模型未返回响应内容」。
  const responseMissingReason = isModelNotStarted(row)
    ? t('logs.guardrail.notStartedHint')
    : t('logs.detail.payload.responseMissingFallback')
  if (payloadLoading) {
    return (
      <section className="space-y-3">
        <h3 className="mg-text-label text-mg-text-3">{t('logs.detail.payload.sectionTitle')}</h3>
        <CodeBlock className="max-h-40">{t('logs.detail.payload.loading')}</CodeBlock>
      </section>
    )
  }
  if (!redacted && !requestPayloadText && !responsePayloadText) {
    return (
      <section className="space-y-3">
        <h3 className="mg-text-label text-mg-text-3">{t('logs.detail.payload.sectionTitle')}</h3>
        <div className="flex gap-2 rounded-md border border-mg-border bg-mg-fill-0/30 p-[var(--mg-panel-padding-md)] text-mg-text-3">
          <LuFileText className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 space-y-2">
            <strong className="block mg-text-caption font-bold text-mg-text-1">{t('logs.detail.payload.captureDisabledTitle')}</strong>
            <p className="mg-text-caption">{t('logs.detail.payload.captureDisabledDesc')}</p>
            {onOpenLogSettings && (
              <Button size="xs" variant="outline" onClick={() => onOpenLogSettings(row.workspace_id)}>
                {t('logs.detail.payload.openSettings')}
                <LuArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </section>
    )
  }
  const pretty = payloadView === 'parsed'
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="mg-text-label text-mg-text-3">{t('logs.detail.payload.sectionTitle')}</h3>
          <p className="mt-1 mg-text-caption text-mg-text-3">{t('logs.detail.payload.captureEnabled')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle value={payloadView} onChange={onPayloadViewChange} />
          <CopyButton
            value={[
              requestText && `// Request\n${requestText}`,
              responsePayloadText && `// Response\n${responsePayloadText}`,
            ].filter(Boolean).join('\n\n')}
            variant="labeled"
            label={t('logs.detail.payload.copyAll')}
            toast={t('logs.detail.payload.copyToast')}
            data-track="logs:detail_copy"
          />
          <Button size="xs" variant="outline" onClick={onDownload}>
            <LuDownload className="mr-1 h-3 w-3" />
            {t('logs.detail.payload.downloadJson')}
          </Button>
        </div>
      </div>
      {redacted && (
        <p className="flex items-start gap-1.5 rounded-md border border-mg-warning/20 bg-mg-warning/5 p-[var(--mg-panel-padding-sm)] mg-text-caption text-mg-text-2">
          <LuShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mg-warning" />
          {t('logs.guardrail.redactedHint')}
        </p>
      )}
      <TranscriptCard title={t('logs.detail.payload.requestTitle', { count: formatNumber(row.usage.input_tokens) })} text={requestText} pretty={redacted ? false : pretty} />
      {/* 输出侧对齐 PRD：模型产出响应→展示 Response 转写；未产出（护栏拦截/调用失败）→「响应未生成 + 原因」，
          而不是像原先那样 responsePayloadText 为空就整段消失（只做了输入没做输出）。 */}
      {responseGenerated ? (
        <TranscriptCard title={t('logs.detail.payload.responseTitle', { count: formatNumber(row.usage.output_tokens) })} text={responsePayloadText} pretty={pretty} sse={responseSSE} />
      ) : (
        <div className="flex gap-2 rounded-md border border-mg-warning/20 bg-mg-warning/5 p-[var(--mg-panel-padding-md)]">
          <LuShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-mg-warning" />
          <div>
            <strong className="block mg-text-caption font-bold text-mg-text-1">{t('logs.detail.payload.responseMissingTitle')}</strong>
            <span className="block mg-text-caption text-mg-text-3">{responseMissingReason}</span>
          </div>
        </div>
      )}
    </section>
  )
}
