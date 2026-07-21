import { type ReactNode } from 'react'
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
import { cn, formatNumber } from '@/lib/utils'
import { listApiKeys } from '@/services/api-keys'
import { listTenantMembers } from '@/services/tenants'
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

export type PayloadKind = 'request' | 'response'
export type PayloadView = 'parsed' | 'raw'

/** 派生三态 → StatusBadge 配置（详情头部与列表口径一致）。 */
function buildStatusMap(t: (key: string) => string): Record<DerivedLogStatus, StatusConfig> {
  return {
    success: { label: t('logs.status.success'), variant: 'success' },
    guarded: { label: t('logs.status.guarded'), variant: 'warning' },
    error: { label: t('logs.status.error'), variant: 'destructive' },
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

/** TPM：后端无独立字段，按总 Token / 时长换算（Token/min），与 TPS 同理。 */
function tpmLabel(row: CallLogItem) {
  if (row.duration_ms <= 0 || row.usage.total_tokens <= 0) return ''
  const tpm = Math.round(row.usage.total_tokens / (row.duration_ms / 60000))
  return `${formatNumber(tpm)} Token/min`
}

export function LogDetailSheet({
  requestPayloadText,
  responsePayloadText,
  payloadView,
  onPayloadViewChange,
  payloadLoading,
  onDownload,
  onClose,
  open,
  row,
  workspaceName,
  onOpenLogSettings,
}: {
  requestPayloadText: string
  responsePayloadText: string
  payloadView: PayloadView
  onPayloadViewChange: (view: PayloadView) => void
  payloadLoading: boolean
  onDownload: () => void
  onClose: () => void
  open: boolean
  row: CallLogItem | null
  workspaceName?: string
  onOpenLogSettings?: (workspaceId: string) => void
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
      ariaTitle="调用日志详情"
      width={680}
      className="overflow-y-auto"
    >
      {row && (
        <div className="space-y-6">
          <header className="border-b border-mg-border pb-4">
            <h2 className="mg-text-title-sm font-bold text-mg-text-1">调用日志详情</h2>
            {/* 顶部 chips 只留 模型 + 状态（对齐原型 log-detail-chips）：
                调用类型(sync)/HTTP 状态码(403) 是技术细节，不当醒目标签甩给用户——
                HTTP 状态作为下方「请求链路」的字段行保留即可（需求方反馈）。 */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="max-w-full truncate">{row.model.display_name}</Badge>
              <StatusBadge status={deriveLogStatus(row)} statusMap={statusMap} />
            </div>
          </header>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {isModelNotStarted(row) ? (
              <>
                {/* 模型请求未发起（如预算拦截）：无耗时/Token/费用 → 两张定制诊断卡。
                    脱敏后继续的护栏命中不走这里，仍展示完整指标卡。 */}
                <DiagnosticCard icon={<LuShieldCheck />} label={t('logs.guardrail.requestStatus')} value={t(`logs.guardrail.action.${guardrailAction(row)}`)} hint={t('logs.guardrail.blockedHint')} tone="warning" />
                <DiagnosticCard icon={<LuNetwork />} label={t('logs.guardrail.modelRequest')} value={t('logs.guardrail.modelState.not_started')} hint={t('logs.guardrail.notStartedHint')} tone="brand" />
              </>
            ) : (
              <>
                <DiagnosticCard icon={<LuClock3 />} label="总耗时" value={formatMaybeDuration(row.duration_ms)} hint={`首 Token ${formatMaybeDuration(row.speed.first_token_ms)}`} tone={row.status === 'failed' ? 'danger' : 'brand'} />
                <DiagnosticCard icon={<LuReceiptText />} label="费用" value={<Money amount={Number(row.cost.amount) > 0 ? row.cost.amount : null} currency={row.cost.currency} />} hint={row.billing_status || '计费状态未返回'} tone="warning" />
                <DiagnosticCard icon={<LuDatabase />} label="Token" value={tokenFlow(row)} hint="输入 token -> 输出 token" tone="success" />
                <DiagnosticCard icon={<LuGitFork />} label="Fallback" value={`${row.fallback_count} 次`} hint={row.fallback_count > 0 ? '已触发回退' : '未触发'} tone={row.fallback_count > 0 ? 'warning' : 'brand'} />
                {/* 5 张卡在 2 列下第 5 张会孤行留半空——让「缓存」占满整行，分布均匀 */}
                <DiagnosticCard className="sm:col-span-2" icon={<LuGauge />} label="缓存" value={row.usage.cache_read_tokens > 0 ? '命中' : '未命中'} hint={`读 ${formatNumber(row.usage.cache_read_tokens)} Token`} tone={row.usage.cache_read_tokens > 0 ? 'success' : 'brand'} />
              </>
            )}
          </section>

          <DetailSection title="概览">
            <DetailGrid compact>
              <DetailRow label="模型" value={row.model.display_name} />
              <DetailRow label="工作空间" value={workspaceName || row.workspace_id} />
              <DetailRow label="API Key 名称" value={apiKeyName} />
              <DetailRow label="成员" value={memberName} />
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

          <DetailSection title="请求">
            {/* 字段顺序对齐 PRD 原型 LogDetailDrawer 「请求」区：Request ID → Trace ID → 调用时间
                → HTTP 状态 → 计费状态 →（billable 时）调用类型 → TPOT → TPM。单列布局（非 compact）。 */}
            <DetailGrid>
              <DetailRow label="Request ID" value={row.request_id} mono />
              <DetailRow label="Trace ID" value={row.trace_id} mono />
              <DetailRow label="调用时间" value={formatDateTimeWithSeconds(row.started_at)} />
              <DetailRow label="HTTP 状态" value={httpStatus(row)} mono />
              <DetailRow label="计费状态" value={row.billing_status} />
              {!isModelNotStarted(row) && <DetailRow label="调用类型" value={row.call_type} />}
              <DetailRow label="TPOT" value={row.tpot_ms > 0 ? `${row.tpot_ms}ms` : ''} mono />
              <DetailRow label="TPM" value={tpmLabel(row)} mono />
            </DetailGrid>
          </DetailSection>

          <DetailSection title="响应耗时">
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
          <TimingBar label="首 Token 耗时" durationMs={ftt} totalMs={total} tone="success" />
          <TimingBar label="响应生成耗时" durationMs={total - ftt} offsetMs={ftt} totalMs={total} tone="brand" />
        </>
      ) : (
        <TimingBar label="总响应耗时" durationMs={total} totalMs={total} tone={row.status === 'failed' ? 'danger' : 'brand'} />
      )}
      {row.usage.total_tokens > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-mg-border/60 pt-3">
          <span className="inline-flex items-center rounded-full bg-mg-success/10 px-2.5 py-0.5 mg-text-caption font-semibold text-mg-success">
            输入 {formatNumber(row.usage.input_tokens)}
          </span>
          <span className="inline-flex items-center rounded-full bg-brand-base/10 px-2.5 py-0.5 mg-text-caption font-semibold text-brand-base">
            输出 {formatNumber(row.usage.output_tokens)} tokens
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

const ROLE_TONE: Record<string, { label: string; cls: string }> = {
  system: { label: 'System', cls: 'text-brand-base' },
  user: { label: 'User', cls: 'text-mg-warning' },
  assistant: { label: 'Assistant', cls: 'text-mg-success' },
  tool: { label: 'Tool', cls: 'text-mg-text-3' },
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
  const tone = ROLE_TONE[role.toLowerCase()] ?? { label: role, cls: 'text-mg-text-3' }
  return (
    <div className="rounded-md border border-mg-border/60 bg-mg-fill-0/30 p-3">
      <div className={cn('mb-1 mg-text-caption font-bold', tone.cls)}>{tone.label}</div>
      <p className="whitespace-pre-wrap break-words mg-text-caption text-mg-text-1">{content || '（空）'}</p>
    </div>
  )
}

function TranscriptCard({ pretty, text, title }: { pretty: boolean; text: string; title: string }) {
  const messages = pretty ? parseMessages(text) : null
  return (
    <div className="rounded-md border border-mg-border bg-mg-bg-0 p-[var(--mg-panel-padding-md)]">
      <div className="mb-2 mg-text-caption font-bold text-mg-text-2">{title}</div>
      {messages && messages.length > 0 ? (
        // 限高 + 滚动：长对话（多条/长内容）不再把抽屉整体顶得无限长，与 JSON 原文的 max-h-80 一致
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {messages.map((m, i) => <MessageBubble key={`${m.role}-${i}`} role={m.role} content={m.content} />)}
        </div>
      ) : (
        <CodeBlock className="max-h-80">{text || '暂无内容'}</CodeBlock>
      )}
    </div>
  )
}

function ViewToggle({ onChange, value }: { onChange: (view: PayloadView) => void; value: PayloadView }) {
  return (
    <div className="inline-flex rounded-md border border-mg-border p-0.5">
      {(['parsed', 'raw'] as PayloadView[]).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn('rounded-sm px-2 py-0.5 mg-text-caption font-bold', value === v ? 'bg-brand-selected-bg text-brand-base' : 'text-mg-text-3 hover:text-mg-text-1')}
        >
          {v === 'parsed' ? 'Pretty' : 'JSON'}
        </button>
      ))}
    </div>
  )
}

function TranscriptSection({ onDownload, onPayloadViewChange, payloadLoading, payloadView, requestPayloadText, responsePayloadText, row, onOpenLogSettings }: {
  onDownload: () => void
  onPayloadViewChange: (view: PayloadView) => void
  payloadLoading: boolean
  payloadView: PayloadView
  requestPayloadText: string
  responsePayloadText: string
  row: CallLogItem
  onOpenLogSettings?: (workspaceId: string) => void
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
    : '模型未返回响应内容'
  if (payloadLoading) {
    return (
      <section className="space-y-3">
        <h3 className="mg-text-label text-mg-text-3">请求内容</h3>
        <CodeBlock className="max-h-40">正在加载请求 / 响应内容…</CodeBlock>
      </section>
    )
  }
  if (!redacted && !requestPayloadText && !responsePayloadText) {
    return (
      <section className="space-y-3">
        <h3 className="mg-text-label text-mg-text-3">请求内容</h3>
        <div className="flex gap-2 rounded-md border border-mg-border bg-mg-fill-0/30 p-[var(--mg-panel-padding-md)] text-mg-text-3">
          <LuFileText className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 space-y-2">
            <strong className="block mg-text-caption font-bold text-mg-text-1">该工作空间未开启输入/输出日志</strong>
            <p className="mg-text-caption">调用日志仅保留元数据、Token、费用、延迟、路由和错误/护栏摘要。需要查看完整 Prompt 与 Response，请到空间管理的日志与转发中开启输入 / 输出日志。</p>
            {onOpenLogSettings && (
              <Button size="xs" variant="outline" onClick={() => onOpenLogSettings(row.workspace_id)}>
                去开启日志与转发
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
          <h3 className="mg-text-label text-mg-text-3">请求内容</h3>
          <p className="mt-1 mg-text-caption text-mg-text-3">已开启输入 / 输出日志采集</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle value={payloadView} onChange={onPayloadViewChange} />
          <CopyButton
            value={[
              requestText && `// Request\n${requestText}`,
              responsePayloadText && `// Response\n${responsePayloadText}`,
            ].filter(Boolean).join('\n\n')}
            variant="labeled"
            label="复制全部"
            toast="请求 / 响应内容已复制"
            data-track="logs:detail_copy"
          />
          <Button size="xs" variant="outline" onClick={onDownload}>
            <LuDownload className="mr-1 h-3 w-3" />
            下载 JSON
          </Button>
        </div>
      </div>
      {redacted && (
        <p className="flex items-start gap-1.5 rounded-md border border-mg-warning/20 bg-mg-warning/5 p-[var(--mg-panel-padding-sm)] mg-text-caption text-mg-text-2">
          <LuShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mg-warning" />
          {t('logs.guardrail.redactedHint')}
        </p>
      )}
      <TranscriptCard title={`Request (${formatNumber(row.usage.input_tokens)} tokens)`} text={requestText} pretty={redacted ? false : pretty} />
      {/* 输出侧对齐 PRD：模型产出响应→展示 Response 转写；未产出（护栏拦截/调用失败）→「响应未生成 + 原因」，
          而不是像原先那样 responsePayloadText 为空就整段消失（只做了输入没做输出）。 */}
      {responseGenerated ? (
        <TranscriptCard title={`Response (${formatNumber(row.usage.output_tokens)} tokens)`} text={responsePayloadText} pretty={pretty} />
      ) : (
        <div className="flex gap-2 rounded-md border border-mg-warning/20 bg-mg-warning/5 p-[var(--mg-panel-padding-md)]">
          <LuShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-mg-warning" />
          <div>
            <strong className="block mg-text-caption font-bold text-mg-text-1">响应未生成</strong>
            <span className="block mg-text-caption text-mg-text-3">{responseMissingReason}</span>
          </div>
        </div>
      )}
    </section>
  )
}
