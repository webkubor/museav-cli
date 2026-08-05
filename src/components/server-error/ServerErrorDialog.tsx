/**
 * 服务端错误诊断弹窗
 * 路由：全局挂载，无独立路由
 * API 来源：src/lib/error-diagnostics 聚合 5xx 请求诊断信息
 */
import { LuMail, LuTriangleAlert } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CopyButton } from '@/components/ui/CopyButton'
import { useServerErrorStore } from '@/store/use-server-error-store'
import { formatDiagnosticsForCopy } from '@/lib/error-diagnostics'

const SUPPORT_EMAIL = 'feedback@modelgo.com'

function Row({ label, value, copyable, copyLabel }: { label: string; value: string; copyable?: boolean; copyLabel: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-mg-border px-3 py-2 last:border-b-0">
      <span className="w-16 flex-shrink-0 text-xs text-mg-text-3">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-mg-text-1" title={value}>
        {value}
      </span>
      {copyable && <CopyButton value={value} aria-label={copyLabel} toast={false} />}
    </div>
  )
}

/**
 * 服务端 5xx 错误诊断弹窗（全局单例，挂在 App 根部）。
 * 文案对用户兜底，但把排查必需的 request_id / trace_id / 前端版本露出来并支持复制。
 */
export function ServerErrorDialog() {
  const { t } = useTranslation()
  const current = useServerErrorStore((s) => s.current)
  const dismiss = useServerErrorStore((s) => s.dismiss)

  if (!current) return null

  const versionLine = `v${current.version}${current.build ? ` (${current.build})` : ''} · ${current.time}`
  const diagnosticsText = formatDiagnosticsForCopy(current)
  const subject = t('common.serverError.emailSubject', { suffix: current.requestId ? ` - ${current.requestId}` : '' })
  const emailBody = t('common.serverError.emailBody', { diagnostics: diagnosticsText })
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
          {t('common.serverError.title')}
        </span>
      }
      description={t('common.serverError.desc')}
      footer={
        <>
          <Button variant="outline" onClick={dismiss}>
            {t('common.close')}
          </Button>
          <CopyButton
            variant="labeled"
            value={diagnosticsText}
            label={t('common.serverError.copyAll')}
            copiedLabel={t('common.serverError.copiedAll')}
          />
          <Button variant="default" icon={<LuMail size={14} />} onClick={sendEmail}>
            {t('common.serverError.sendEmail')}
          </Button>
        </>
      }
    >
      <div className="overflow-hidden rounded-lg border border-mg-border">
        {current.requestId && <Row label={t('common.serverError.requestId')} value={current.requestId} copyable copyLabel={t('common.serverError.copyLabel', { label: t('common.serverError.requestId') })} />}
        {current.traceId && <Row label={t('common.serverError.traceId')} value={current.traceId} copyable copyLabel={t('common.serverError.copyLabel', { label: t('common.serverError.traceId') })} />}
        {current.path && <Row label={t('common.serverError.path')} value={current.path} copyable copyLabel={t('common.serverError.copyLabel', { label: t('common.serverError.path') })} />}
        {current.tenantId && <Row label={t('common.serverError.tenantId')} value={current.tenantId} copyable copyLabel={t('common.serverError.copyLabel', { label: t('common.serverError.tenantId') })} />}
        <Row label={t('common.serverError.version')} value={versionLine} copyLabel={t('common.serverError.copyLabel', { label: t('common.serverError.version') })} />
      </div>
    </Modal>
  )
}

export default ServerErrorDialog
