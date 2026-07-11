import { Fragment, type ReactNode } from 'react'
import {
  LuClock3,
  LuDatabase,
  LuFileText,
  LuGauge,
  LuGitFork,
  LuReceiptText,
  LuShieldCheck,
  LuNetwork,
  LuMonitor,
  LuServer,
  LuCheck,
  LuArrowRight,
  LuArrowUpRight,
  LuDownload,
} from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { CodeBlock } from '@/components/ui/CodeBlock'
import { CopyButton } from '@/components/ui/CopyButton'
import { Money } from '@/components/ui/Money'
import { SideSheet } from '@/components/ui/SideSheet'
import { StatusBadge, type StatusConfig } from '@/components/ui/StatusBadge'
import { formatDateTimeWithSeconds, formatDuration } from '@/lib/format-date'
import { cn, formatNumber } from '@/lib/utils'
import type { CallLogItem } from '@/types'
import {
  deriveLogStatus,
  guardrailAction,
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

function isLogSucceeded(row: CallLogItem) {
  if (row.http_status > 0) return row.http_status < 400
  return row.status === 'succeeded' || row.status === 'accepted'
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
  onViewTraceLogs,
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
  onViewTraceLogs?: (traceId: string) => void
}) {
  const { t } = useTranslation()
  const statusMap = buildStatusMap(t)
  return (
    <SideSheet open={open} onClose={onClose} title={null} width={680} className="overflow-y-auto">
      {row && (
        <div className="space-y-6">
          <header className="border-b border-mg-border pb-4">
            <h2 className="mg-text-title-sm font-bold text-mg-text-1">调用日志详情</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="max-w-full truncate">{row.model.display_name}</Badge>
              <StatusBadge status={deriveLogStatus(row)} statusMap={statusMap} />
              {row.call_type && <Badge variant="secondary">{row.call_type}</Badge>}
              <Badge variant={isLogSucceeded(row) ? 'success' : 'danger'}>{httpStatus(row)}</Badge>
            </div>
            {row.trace_id && (
              <div className="mt-3 flex items-center gap-2">
                <span className="shrink-0 mg-text-caption font-bold text-mg-text-3">Trace ID</span>
                <span className="min-w-0 flex-1 truncate font-mono mg-text-caption text-mg-text-2">{row.trace_id}</span>
                <CopyButton value={row.trace_id} variant="icon" aria-label="复制 Trace ID" toast={false} />
              </div>
            )}
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
                <DiagnosticCard icon={<LuGauge />} label="缓存" value={row.usage.cache_read_tokens > 0 ? '命中' : '未命中'} hint={`读 ${formatNumber(row.usage.cache_read_tokens)} Token`} tone={row.usage.cache_read_tokens > 0 ? 'success' : 'brand'} />
              </>
            )}
          </section>

          <DetailSection title="概览">
            <DetailGrid compact>
              <DetailRow label="模型" value={row.model.display_name} />
              <DetailRow label="工作空间" value={workspaceName || row.workspace_id} />
              <DetailRow label="API Key 名称" value={row.api_key.name} />
              <DetailRow label="成员" value={row.account.display_name} />
              <DetailRow label="调用时间" value={formatDateTimeWithSeconds(row.started_at)} />
              <DetailRow label="计费状态" value={row.billing_status} />
            </DetailGrid>
          </DetailSection>

          {isGuardrailHit(row) && (
            <DetailSection title={t('logs.guardrail.sectionTitle')}>
              <DetailGrid compact>
                <DetailRow label={t('logs.guardrail.hitRule')} value={row.guardrail_decision?.rule_name || t('logs.guardrail.unknownRule')} />
                <DetailRow label={t('logs.guardrail.result')} value={t(`logs.guardrail.action.${guardrailAction(row)}`)} />
                <DetailRow label={t('logs.guardrail.ruleSource')} value={row.guardrail_decision?.rule_source || t('logs.guardrail.unknownSource')} />
                <DetailRow label={t('logs.guardrail.modelCall')} value={t(`logs.guardrail.modelState.${modelCallState(row)}`)} />
              </DetailGrid>
            </DetailSection>
          )}

          <DetailSection title="请求链路">
            <div className="grid gap-3 lg:grid-cols-2">
              <DetailGrid>
                <DetailRow label="Request ID" value={row.request_id} mono />
                <DetailRow label="HTTP 状态" value={httpStatus(row)} mono />
                <DetailRow label="调用类型" value={row.call_type} />
                <DetailRow label="TPOT" value={row.tpot_ms > 0 ? `${row.tpot_ms}ms` : ''} mono />
                <DetailRow label="TPM" value={tpmLabel(row)} mono />
              </DetailGrid>
              <RequestChain row={row} />
            </div>
          </DetailSection>

          <DetailSection title="响应耗时">
            <ResponseTiming row={row} />
          </DetailSection>

          {row.error && (
            <section className="rounded-md border border-mg-danger/20 bg-mg-danger/5 p-[var(--mg-panel-padding-md)]">
              <div className="mb-2 flex items-center gap-2 mg-text-label text-mg-danger">
                <LuFileText className="h-4 w-4" />
                异常报错信息
              </div>
              <pre className="whitespace-pre-wrap break-all mg-text-code text-mg-danger">{row.error}</pre>
            </section>
          )}

          <TranscriptSection
            row={row}
            requestPayloadText={requestPayloadText}
            responsePayloadText={responsePayloadText}
            payloadView={payloadView}
            onPayloadViewChange={onPayloadViewChange}
            payloadLoading={payloadLoading}
            onDownload={onDownload}
          />

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-mg-border pt-4">
            <CopyButton value={row.trace_id} variant="labeled" label="复制 Trace" toast={false} />
            {row.trace_id && onViewTraceLogs && (
              <Button
                variant="brand"
                size="sm"
                onClick={() => onViewTraceLogs(row.trace_id)}
              >
                查看同链路日志
                <LuArrowUpRight className="ml-1.5 h-4 w-4" />
              </Button>
            )}
          </footer>
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

function DiagnosticCard({ hint, icon, label, value, tone = 'brand' }: { hint: string; icon: ReactNode; label: string; value: ReactNode; tone?: DiagnosticTone }) {
  return (
    <article className="min-w-0 rounded-md border border-mg-border bg-mg-bg-0 p-[var(--mg-panel-padding-md)]">
      <span className="flex items-center gap-2 mg-text-label text-mg-text-3">
        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5', DIAGNOSTIC_TONE[tone])}>{icon}</span>
        {label}
      </span>
      <strong className="mt-2 block truncate mg-text-value font-bold text-mg-text-1">{value}</strong>
      <small className="mt-1 block truncate mg-text-caption text-mg-text-3">{hint}</small>
    </article>
  )
}

type NodeState = 'ok' | 'warn' | 'error' | 'skipped'
const NODE_TONE: Record<NodeState, string> = {
  ok: 'bg-mg-success/10 text-mg-success',
  warn: 'bg-mg-warning/10 text-mg-warning',
  error: 'bg-mg-danger/10 text-mg-danger',
  skipped: 'bg-mg-fill-1 text-mg-text-4',
}

function ChainNode({ icon, state, sub, title }: { icon: ReactNode; state: NodeState; sub: string; title: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
      <span className={cn('relative flex h-10 w-10 items-center justify-center rounded-lg [&_svg]:size-5', NODE_TONE[state])}>
        {icon}
        <span className={cn(
          'absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-mg-bg-0',
          state === 'ok' ? 'bg-mg-success text-white' : state === 'warn' ? 'bg-mg-warning text-white' : state === 'error' ? 'bg-mg-danger text-white' : 'bg-mg-fill-2 text-mg-text-4'
        )}>
          {state === 'error' ? <LuNetwork className="h-2.5 w-2.5" /> : state === 'skipped' ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : <LuCheck className="h-2.5 w-2.5" />}
        </span>
      </span>
      <div className="min-w-0">
        <div className="mg-text-caption font-bold text-mg-text-1">{title}</div>
        <div className="truncate mg-text-caption text-mg-text-3">{sub}</div>
      </div>
    </div>
  )
}

/** 请求链路可视化：Client → Gateway → Provider 三节点 + 链路状态摘要（数据由 status/http_status 推导）。 */
function RequestChain({ row }: { row: CallLogItem }) {
  // 已拦截（护栏命中且模型未发起）→ Provider 跳过；脱敏后继续按正常链路（请求已下发到 Provider）。
  const blocked = isGuardrailHit(row) && isModelNotStarted(row)
  const failed = deriveLogStatus(row) === 'error'
  const providerState: NodeState = blocked ? 'skipped' : failed ? 'error' : 'ok'
  const nodes: { icon: ReactNode; title: string; sub: string; state: NodeState }[] = [
    { icon: <LuMonitor />, title: 'Client', sub: '用户客户端', state: 'ok' },
    { icon: <LuServer />, title: 'Gateway', sub: 'API 网关', state: blocked ? 'warn' : 'ok' },
    { icon: <LuDatabase />, title: 'Provider', sub: row.provider.name || row.model.display_name, state: providerState },
  ]
  const summary = blocked
    ? { tone: 'text-mg-warning', text: '护栏拦截 · 请求未下发到 Provider' }
    : failed
      ? { tone: 'text-mg-danger', text: 'Provider 响应失败' }
      : { tone: 'text-mg-success', text: '链路正常 · 全部节点请求成功' }
  return (
    <article className="rounded-md border border-mg-border bg-mg-bg-0 p-[var(--mg-panel-padding-md)]">
      <div className="flex items-center justify-between">
        {nodes.map((node, i) => (
          <Fragment key={node.title}>
            <ChainNode icon={node.icon} title={node.title} sub={node.sub} state={node.state} />
            {i < nodes.length - 1 && <LuArrowRight className="mx-1 h-4 w-4 shrink-0 self-start mt-2.5 text-mg-text-4" />}
          </Fragment>
        ))}
      </div>
      <div className={cn('mt-3 flex items-center justify-center gap-1.5 border-t border-mg-border/60 pt-2.5 mg-text-caption font-semibold', summary.tone)}>
        <LuCheck className="h-3.5 w-3.5" />
        {summary.text}
      </div>
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
          <TimingBar label="首 Token 耗时" durationMs={ftt} totalMs={total} tone="success" />
          <TimingBar label="响应生成耗时" durationMs={total - ftt} totalMs={total} tone="brand" />
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

function TimingBar({ durationMs, label, tone, totalMs }: { durationMs: number; label: string; tone: 'success' | 'brand' | 'danger'; totalMs: number }) {
  const pct = totalMs > 0 ? Math.max(6, Math.min(100, (durationMs / totalMs) * 100)) : 100
  const barColor = tone === 'success' ? 'bg-mg-success' : tone === 'danger' ? 'bg-mg-danger' : 'bg-brand-base'
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 mg-text-caption text-mg-text-2">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-mg-fill-1">
        <span className={cn('block h-2 rounded-full', barColor)} style={{ width: `${pct}%` }} />
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
        <div className="space-y-2">
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

function TranscriptSection({ onDownload, onPayloadViewChange, payloadLoading, payloadView, requestPayloadText, responsePayloadText, row }: {
  onDownload: () => void
  onPayloadViewChange: (view: PayloadView) => void
  payloadLoading: boolean
  payloadView: PayloadView
  requestPayloadText: string
  responsePayloadText: string
  row: CallLogItem
}) {
  const { t } = useTranslation()
  // 脱敏后继续：Request 只展示替换后的占位符，绝不展示原文（同时用于复制）。
  const redacted = isRedacted(row)
  const requestText = redacted ? REDACTION_PLACEHOLDER : requestPayloadText
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
          <p className="mg-text-caption">该工作空间未开启输入 / 输出日志。调用日志仅保留元数据、Token、费用、延迟、路由和错误摘要；需查看完整 Prompt 与 Response，请到空间管理的「日志与转发」中开启。</p>
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
      {responsePayloadText && (
        <TranscriptCard title={`Response (${formatNumber(row.usage.output_tokens)} tokens)`} text={responsePayloadText} pretty={pretty} />
      )}
      <p className="flex items-center gap-1.5 mg-text-caption text-mg-text-4">
        <LuShieldCheck className="h-3.5 w-3.5" />
        密钥与敏感字段已脱敏
      </p>
    </section>
  )
}
