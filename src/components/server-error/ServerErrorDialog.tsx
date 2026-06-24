import { LuCheck, LuCopy, LuTriangleAlert } from 'react-icons/lu'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useCopy } from '@/hooks/use-copy'
import { useServerErrorStore } from '@/store/use-server-error-store'
import { formatDiagnosticsForCopy } from '@/lib/error-diagnostics'

function CopyIconButton({ value, label }: { value: string; label: string }) {
  const { copy, copied } = useCopy()
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => copy(value)}
      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-mg-border text-mg-text-2 transition-colors hover:text-mg-text-0"
    >
      {copied ? <LuCheck size={13} className="text-mg-success" /> : <LuCopy size={13} />}
    </button>
  )
}

function Row({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div className="flex items-center gap-2 border-b border-mg-border px-3 py-2 last:border-b-0">
      <span className="w-16 flex-shrink-0 text-xs text-mg-text-2">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-mg-text-0" title={value}>
        {value}
      </span>
      {copyable && <CopyIconButton value={value} label={`复制${label}`} />}
    </div>
  )
}

/**
 * 服务端 5xx 错误诊断弹窗（全局单例，挂在 App 根部）。
 * 文案对用户兜底，但把排查必需的 request_id / trace_id / 前端版本露出来并支持复制。
 */
export function ServerErrorDialog() {
  const current = useServerErrorStore((s) => s.current)
  const dismiss = useServerErrorStore((s) => s.dismiss)
  const { copy, copied } = useCopy()

  if (!current) return null

  const versionLine = `v${current.version}${current.build ? ` (${current.build})` : ''} · ${current.time}`

  return (
    <Modal
      open
      onClose={dismiss}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <LuTriangleAlert size={18} className="text-mg-danger" />
          服务暂时不可用，请稍后再试
        </span>
      }
      description="如多次出现，请把下方信息提供给客服以便排查"
      footer={
        <>
          <Button variant="outline" onClick={dismiss}>
            关闭
          </Button>
          <Button variant="secondary" onClick={() => copy(formatDiagnosticsForCopy(current))}>
            {copied ? <LuCheck size={14} /> : <LuCopy size={14} />}
            {copied ? '已复制' : '复制全部'}
          </Button>
        </>
      }
    >
      <div className="overflow-hidden rounded-lg border border-mg-border">
        {current.requestId && <Row label="请求 ID" value={current.requestId} copyable />}
        {current.traceId && <Row label="Trace ID" value={current.traceId} copyable />}
        {current.tenantId && <Row label="租户 ID" value={current.tenantId} copyable />}
        <Row label="版本" value={versionLine} />
      </div>
    </Modal>
  )
}

export default ServerErrorDialog
