/**
 * 服务端错误诊断弹窗
 * 路由：全局挂载，无独立路由
 * API 来源：src/lib/error-diagnostics 聚合 5xx 请求诊断信息
 */
import { LuMail, LuTriangleAlert } from 'react-icons/lu'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CopyButton } from '@/components/ui/CopyButton'
import { useServerErrorStore } from '@/store/use-server-error-store'
import { formatDiagnosticsForCopy } from '@/lib/error-diagnostics'

const SUPPORT_EMAIL = 'feedback@modelgo.com'

function Row({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div className="flex items-center gap-2 border-b border-mg-border px-3 py-2 last:border-b-0">
      <span className="w-16 flex-shrink-0 text-xs text-mg-text-3">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-mg-text-1" title={value}>
        {value}
      </span>
      {copyable && <CopyButton value={value} aria-label={`复制${label}`} toast={false} />}
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

  if (!current) return null

  const versionLine = `v${current.version}${current.build ? ` (${current.build})` : ''} · ${current.time}`
  const diagnosticsText = formatDiagnosticsForCopy(current)
  const subject = `ModelGo 控制台服务异常${current.requestId ? ` - ${current.requestId}` : ''}`
  const emailBody = `我在使用 ModelGo 控制台时遇到了服务异常，请帮忙排查。\n\n${diagnosticsText}`
  const mailHref = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`
  const sendEmail = () => {
    window.location.href = mailHref
    dismiss()
  }

  return (
    <Modal
      open
      onClose={dismiss}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <LuTriangleAlert size={18} className="text-mg-danger" />
          服务暂时异常，请稍后再试
        </span>
      }
      description="如果问题持续出现，请将以下信息提供给我们排查。"
      footer={
        <>
          <Button variant="outline" onClick={dismiss}>
            关闭
          </Button>
          <CopyButton
            variant="labeled"
            value={diagnosticsText}
            label="一键复制"
            copiedLabel="已复制全部"
          />
          <Button variant="default" icon={<LuMail size={14} />} onClick={sendEmail}>
            发 Email
          </Button>
        </>
      }
    >
      <div className="overflow-hidden rounded-lg border border-mg-border">
        {current.requestId && <Row label="请求 ID" value={current.requestId} copyable />}
        {current.traceId && <Row label="Trace ID" value={current.traceId} copyable />}
        {current.path && <Row label="接口路径" value={current.path} copyable />}
        {current.tenantId && <Row label="租户 ID" value={current.tenantId} copyable />}
        <Row label="版本" value={versionLine} />
      </div>
    </Modal>
  )
}

export default ServerErrorDialog
