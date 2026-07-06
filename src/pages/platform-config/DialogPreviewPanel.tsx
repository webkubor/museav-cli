import { useState } from 'react'
import type { ReactNode } from 'react'
import { LuBug, LuEye, LuSmartphone } from 'react-icons/lu'
import { ModelGoApiError } from '@/lib/request'
import { appToast } from '@/lib/app-toast'
import { Button } from '@/components/ui/Button'
import { RequiredPhoneBindingDialog } from '@/components/auth/RequiredPhoneBindingDialog'

interface PreviewCardProps {
  icon: ReactNode
  title: string
  desc: string
  action: string
  onClick: () => void
}

function PreviewCard({ icon, title, desc, action, onClick }: PreviewCardProps) {
  return (
    <div className="rounded-md border border-mg-border bg-card-bg p-4 shadow-sm shadow-black/2">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-base">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-mg-text-1">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-mg-text-3">{desc}</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={onClick} icon={<LuEye size={14} />}>
            {action}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function DialogPreviewPanel() {
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false)
  const [phone, setPhone] = useState('13800138000')
  const [code, setCode] = useState('123456')
  const [binding, setBinding] = useState(false)

  const previewServerError = () => {
    const error = new ModelGoApiError({
      code: 50001,
      msg: 'panic: preview server error (dev only)',
      request_id: '7F97E139-B2BF-5512-8B5E-A64CDEDFDF83',
      trace_id: '7cdc2d717eb9c5d8a26c322b9349edeb',
      data: null,
    })
    error.path = 'POST /api/v1/workspaces'
    appToast.requestError(error)
  }

  const completePreviewBinding = () => {
    setBinding(true)
    window.setTimeout(() => {
      setBinding(false)
      setPhoneDialogOpen(false)
      appToast.success('预览：手机号绑定完成')
    }, 600)
  }

  return (
    <div className="space-y-4 pt-2">
      <div>
        <h2 className="text-base font-bold text-mg-text-1">弹窗预览</h2>
        <p className="mt-1 text-xs text-mg-text-3">
          直接预览关键全局弹窗，不依赖真实接口错误或账号状态触发。
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <PreviewCard
          icon={<LuSmartphone size={18} />}
          title="强制绑定手机号"
          desc="快捷登录账号缺少手机号时的阻塞弹窗。预览态也禁用 Esc、遮罩关闭和右上角关闭按钮。"
          action="预览绑定弹窗"
          onClick={() => setPhoneDialogOpen(true)}
        />
        <PreviewCard
          icon={<LuBug size={18} />}
          title="服务端错误诊断"
          desc="模拟 5xx 错误弹窗，查看 request_id、trace_id、接口路径、复制信息和邮件反馈入口。"
          action="预览报错弹窗"
          onClick={previewServerError}
        />
      </div>

      <RequiredPhoneBindingDialog
        open={phoneDialogOpen}
        phone={phone}
        code={code}
        loading={binding}
        onPhoneChange={setPhone}
        onCodeChange={setCode}
        onSendCode={async () => 60}
        onSubmit={completePreviewBinding}
      />
    </div>
  )
}
