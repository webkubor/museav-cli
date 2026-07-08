import { Link } from 'react-router-dom'
import { LuShieldCheck, LuSmartphone } from 'react-icons/lu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { VerificationCodeButton } from '@/components/auth/VerificationCodeButton'

interface RequiredPhoneBindingDialogProps {
  open: boolean
  phone: string
  code: string
  loading?: boolean
  logoutLoading?: boolean
  onPhoneChange: (value: string) => void
  onCodeChange: (value: string) => void
  onSendCode: () => Promise<number | void>
  onSubmit: () => void
  onLogout: () => void
}

const PHONE_RE = /^1[3-9]\d{9}$/
const CODE_RE = /^\d{6}$/

export function RequiredPhoneBindingDialog({
  open,
  phone,
  code,
  loading = false,
  logoutLoading = false,
  onPhoneChange,
  onCodeChange,
  onSendCode,
  onSubmit,
  onLogout,
}: RequiredPhoneBindingDialogProps) {
  const phoneValid = PHONE_RE.test(phone)
  const codeValid = CODE_RE.test(code)

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        closeButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="sm:max-w-[460px] modal-glow-flow"
      >
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-brand-soft text-brand-base">
            <LuSmartphone size={22} />
          </div>
          <DialogTitle>绑定手机号后继续使用</DialogTitle>
          <DialogDescription>
            快捷登录账号需要补充手机号，用于国内服务验证、账号安全和后续通知。该步骤不能跳过。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-mg-text-2">手机号</span>
            <Input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(event) => onPhoneChange(event.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="请输入中国大陆手机号"
              prefix={<LuSmartphone size={15} />}
              suffix={<VerificationCodeButton onSend={onSendCode} disabled={!phoneValid} />}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-mg-text-2">短信验证码</span>
            <Input
              inputMode="numeric"
              value={code}
              onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="请输入 6 位验证码"
            />
          </label>

          <div className="flex items-start gap-2 rounded-md border border-mg-border bg-mg-fill-0 px-3 py-2.5 text-xs leading-relaxed text-mg-text-3">
            <LuShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-mg-success" />
            <span>手机号只用于账号安全验证和国内服务能力，不会公开展示。</span>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-col sm:space-x-0 gap-2 sm:gap-2">
          <Button
            className="w-full"
            loading={loading}
            disabled={!phoneValid || !codeValid || logoutLoading}
            onClick={onSubmit}
          >
            完成绑定并进入控制台
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            loading={logoutLoading}
            disabled={loading}
            onClick={onLogout}
          >
            暂不绑定，退出登录
          </Button>
        </DialogFooter>

        <p className="mt-3 text-center text-xs leading-relaxed text-mg-text-3">
          绑定即代表同意{' '}
          <Link to="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-brand-base hover:text-brand-deep">服务条款</Link>
          {' '}与{' '}
          <Link to="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-base hover:text-brand-deep">隐私政策</Link>
        </p>
      </DialogContent>
    </Dialog>
  )
}
