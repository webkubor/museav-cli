import type { ReactNode } from 'react'
import {
  LuClock3,
  LuCopy,
  LuDatabase,
  LuFileText,
  LuGauge,
  LuGitFork,
  LuKeyRound,
  LuReceiptText,
  LuShieldCheck,
  LuNetwork,
} from 'react-icons/lu'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { CodeBlock } from '@/components/ui/CodeBlock'
import { Money } from '@/components/ui/Money'
import { SideSheet } from '@/components/ui/SideSheet'
import { StatusBadge, type StatusConfig } from '@/components/ui/StatusBadge'
import { formatDateTimeWithSeconds, formatDuration } from '@/lib/format-date'
import { cn, formatNumber } from '@/lib/utils'
import type { CallLogItem, LogPayload } from '@/types'

export type PayloadKind = 'request' | 'response'
export type PayloadView = 'parsed' | 'raw'

const STATUS_MAP: Record<string, StatusConfig> = {
  accepted: { label: '处理中', variant: 'secondary', dot: true },
  succeeded: { label: '成功', variant: 'success' },
  failed: { label: '异常', variant: 'destructive' },
  rejected: { label: '护栏命中', variant: 'warning' },
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
  copied,
  displayedPayload,
  onClose,
  onCopyPayload,
  onPayloadKindChange,
  onPayloadViewChange,
  open,
  payload,
  payloadKind,
  payloadLoading,
  payloadView,
  row,
  workspaceName,
  sseAvailable,
}: {
  copied: boolean
  displayedPayload: string
  onClose: () => void
  onCopyPayload: () => void
  onPayloadKindChange: (kind: PayloadKind) => void
  onPayloadViewChange: (view: PayloadView) => void
  open: boolean
  payload?: LogPayload
  payloadKind: PayloadKind
  payloadLoading: boolean
  payloadView: PayloadView
  row: CallLogItem | null
  workspaceName?: string
  sseAvailable: boolean
}) {
  return (
    <SideSheet open={open} onClose={onClose} title={null} width={680} className="overflow-y-auto">
      {row && (
        <div className="space-y-6">
          <header className="flex items-start justify-between gap-4 border-b border-mg-border pb-4">
            <div className="min-w-0">
              <h2 className="mg-text-title-sm font-bold text-mg-text-1">调用日志详情</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="max-w-full truncate">{row.model.display_name}</Badge>
                <StatusBadge status={row.status} statusMap={STATUS_MAP} />
              </div>
            </div>
            <Badge variant={isLogSucceeded(row) ? 'success' : 'danger'}>{httpStatus(row)}</Badge>
          </header>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {row.status === 'rejected' ? (
              <>
                {/* 护栏命中：模型请求未发起，无耗时/Token/费用可展示 → 换成两张定制诊断卡（对齐 PRD） */}
                <DiagnosticCard icon={<LuShieldCheck />} label="请求状态" value="已拦截" hint="安全护栏命中" tone="warning" />
                <DiagnosticCard icon={<LuNetwork />} label="模型请求" value="未发起" hint="未产生响应、Token、耗时或费用" tone="brand" />
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
            </DetailGrid>
          </DetailSection>

          <DetailSection title="请求">
            <DetailGrid>
              <DetailRow label="Request ID" value={row.request_id} mono />
              <DetailRow label="Trace ID" value={row.trace_id} mono />
              <DetailRow label="调用时间" value={formatDateTimeWithSeconds(row.started_at)} />
              <DetailRow label="HTTP 状态" value={httpStatus(row)} mono />
              <DetailRow label="计费状态" value={row.billing_status} />
              <DetailRow label="调用类型" value={row.call_type} />
              <DetailRow label="TPOT" value={row.tpot_ms > 0 ? `${row.tpot_ms}ms` : ''} mono />
              <DetailRow label="TPM" value={tpmLabel(row)} mono />
            </DetailGrid>
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

          <PayloadSection
            copied={copied}
            displayedPayload={displayedPayload}
            onCopyPayload={onCopyPayload}
            onPayloadKindChange={onPayloadKindChange}
            onPayloadViewChange={onPayloadViewChange}
            payload={payload}
            payloadKind={payloadKind}
            payloadLoading={payloadLoading}
            payloadView={payloadView}
            sseAvailable={sseAvailable}
          />
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
  if (row.status === 'rejected') {
    return <TimingRow label="请求状态" value="护栏命中" hint="模型请求未继续执行" />
  }
  if (row.status === 'failed') {
    return <TimingRow label="总响应耗时" value={httpStatus(row)} duration={formatMaybeDuration(row.duration_ms)} hint="最终响应失败" />
  }
  if (row.speed.first_token_ms > 0 && row.duration_ms > row.speed.first_token_ms) {
    return (
      <div className="space-y-2 rounded-md border border-mg-border p-[var(--mg-panel-padding-md)]">
        <TimingRow label="首 Token 耗时" value={httpStatus(row)} duration={formatMaybeDuration(row.speed.first_token_ms)} />
        <TimingRow label="响应生成耗时" value={`输出 ${formatNumber(row.usage.output_tokens)} tokens`} duration={formatMaybeDuration(row.duration_ms - row.speed.first_token_ms)} />
      </div>
    )
  }
  return <TimingRow label="总响应耗时" value={httpStatus(row)} duration={formatMaybeDuration(row.duration_ms)} hint={row.call_type || '未返回流式分段耗时'} />
}

function TimingRow({ duration, hint, label, value }: { duration?: string; hint?: string; label: string; value: string }) {
  return (
    <div className="grid gap-2 rounded-md border border-mg-border bg-mg-fill-0/30 p-[var(--mg-panel-padding-md)] sm:grid-cols-[150px_1fr_auto] sm:items-center">
      <div>
        <strong className="block mg-text-caption text-mg-text-1">{label}</strong>
        {hint && <span className="block mg-text-caption text-mg-text-3">{hint}</span>}
      </div>
      <div className="min-h-2 rounded-full bg-mg-fill-1">
        <span className="block h-2 w-2/3 rounded-full bg-brand-base" />
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline">{value}</Badge>
        {duration && <strong className="font-mono mg-text-caption text-mg-text-1">{duration}</strong>}
      </div>
    </div>
  )
}

function PayloadSection(props: {
  copied: boolean
  displayedPayload: string
  onCopyPayload: () => void
  onPayloadKindChange: (kind: PayloadKind) => void
  onPayloadViewChange: (view: PayloadView) => void
  payload?: LogPayload
  payloadKind: PayloadKind
  payloadLoading: boolean
  payloadView: PayloadView
  sseAvailable: boolean
}) {
  const payloadText = props.payloadLoading ? '正在加载原始 Payload...' : props.displayedPayload || '暂无原始 Payload'
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="mg-text-label text-mg-text-3">原始 Payload</h3>
          <p className="mt-1 mg-text-caption text-mg-text-3">
            {props.payload?.content_type || '-'} · {props.payload ? `${props.payload.size} bytes` : '-'}
            {props.payload?.truncated && <Badge className="ml-2" variant="warning">已截断</Badge>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['request', 'response'] as PayloadKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => props.onPayloadKindChange(kind)}
              className={cn(
                'rounded-md border px-3 py-1 mg-text-caption font-bold',
                props.payloadKind === kind
                  ? 'border-brand-base bg-brand-selected-bg text-brand-base'
                  : 'border-mg-border bg-mg-fill-0 text-mg-text-2 hover:text-mg-text-1'
              )}
            >
              {kind === 'request' ? '请求' : '响应'}
            </button>
          ))}
          {props.sseAvailable && (
            <button
              type="button"
              onClick={() => props.onPayloadViewChange(props.payloadView === 'parsed' ? 'raw' : 'parsed')}
              className="rounded-md border border-mg-border bg-mg-fill-0 px-3 py-1 mg-text-caption font-bold text-mg-text-2 hover:text-mg-text-1"
            >
              {props.payloadView === 'parsed' ? '原始 SSE' : '合并回答'}
            </button>
          )}
          <Button size="xs" variant="outline" disabled={!props.displayedPayload || props.payloadLoading} onClick={props.onCopyPayload}>
            <LuCopy className="mr-1 h-3 w-3" />
            {props.copied ? '已复制' : '复制'}
          </Button>
        </div>
      </div>
      <CodeBlock className="max-h-96">{payloadText}</CodeBlock>
      {!props.payloadLoading && !props.displayedPayload && (
        <div className="flex gap-2 rounded-md border border-mg-border bg-mg-fill-0/30 p-[var(--mg-panel-padding-md)] text-mg-text-3">
          <LuKeyRound className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="mg-text-caption">如果工作空间未开启输入 / 输出日志，后端只会返回元数据、Token、费用、延迟、路由和错误摘要。</p>
        </div>
      )}
    </section>
  )
}
