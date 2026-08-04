import { Link } from 'react-router-dom'
import { LuShieldCheck, LuSmartphone } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
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
import { LocaleNamespaces } from '@/components/i18n/LocaleNamespaces'

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

export function RequiredPhoneBindingDialog(props: RequiredPhoneBindingDialogProps) {
  const {
    open,
    phone,
    code,
    loading,
    logoutLoading,
    onPhoneChange,
    onCodeChange,
    onSendCode,
    onSubmit,
    onLogout,
  } = props
  return (
    <LocaleNamespaces namespaces={['account']} fallback={null}>
      <RequiredPhoneBindingDialogContent
        open={open}
        phone={phone}
        code={code}
        loading={loading}
        logoutLoading={logoutLoading}
        onPhoneChange={onPhoneChange}
        onCodeChange={onCodeChange}
        onSendCode={onSendCode}
        onSubmit={onSubmit}
        onLogout={onLogout}
      />
    </LocaleNamespaces>
  )
}

function RequiredPhoneBindingDialogContent({
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
  const { t } = useTranslation('account')
  const phoneValid = PHONE_RE.test(phone)
  const codeValid = CODE_RE.test(code)

  return (
    // modal={false}:发短信验证码走阿里云/alicaptcha 人机验证,SDK 把验证码弹窗 portal 到 document.body
    // (在本 Dialog DOM 之外)。Radix 默认 modal 会给 body 设 pointer-events:none + 焦点陷阱,导致该验证码
    // 浮层可见却点不动(需求方#215)。关掉 modal 解除 body 锁让验证码可交互;DialogOverlay(z-50 遮罩)仍渲染
    // 挡住背后页面、验证码(第三方 z 更高)在遮罩之上可点,强制门禁效果不变。
    <Dialog open={open} onOpenChange={() => {}} modal={false}>
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
          <DialogTitle>{t('account.auth.phoneBinding.title')}</DialogTitle>
          <DialogDescription>
            {t('account.auth.phoneBinding.desc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-mg-text-2">{t('account.auth.fields.phone')}</span>
            <Input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(event) => onPhoneChange(event.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder={t('account.auth.placeholders.mainlandPhone')}
              prefix={<LuSmartphone size={15} />}
              suffix={<VerificationCodeButton onSend={onSendCode} disabled={!phoneValid} />}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-mg-text-2">{t('account.auth.fields.smsCode')}</span>
            <Input
              inputMode="numeric"
              value={code}
              onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={t('account.auth.placeholders.enterCode6')}
            />
          </label>

          <div className="flex items-start gap-2 rounded-md border border-mg-border bg-mg-fill-0 px-3 py-2.5 text-xs leading-relaxed text-mg-text-3">
            <LuShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-mg-success" />
            <span>{t('account.auth.phoneBinding.securityHint')}</span>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-col sm:space-x-0 gap-2 sm:gap-2">
          <Button
            className="w-full"
            loading={loading}
            disabled={!phoneValid || !codeValid || logoutLoading}
            onClick={onSubmit}
          >
            {t('account.auth.phoneBinding.submit')}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            loading={logoutLoading}
            disabled={loading}
            onClick={onLogout}
          >
            {t('account.auth.phoneBinding.logout')}
          </Button>
        </DialogFooter>

        <p className="mt-3 text-center text-xs leading-relaxed text-mg-text-3">
          {t('account.auth.legal.bindingPrefix')}{' '}
          <Link to="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-brand-base hover:text-brand-deep">{t('account.auth.legal.terms')}</Link>
          {' '}{t('account.auth.legal.and')}{' '}
          <Link to="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-base hover:text-brand-deep">{t('account.auth.legal.privacy')}</Link>
        </p>
      </DialogContent>
    </Dialog>
  )
}
