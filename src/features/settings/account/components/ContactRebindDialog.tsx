/**
 * 手机号 / 邮箱换绑弹窗（shared/modelgo_prd#837，对齐原型 App.tsx AccountContactChangeDialog）。
 * 路由：/settings/account（基本资料）
 * API：POST /auth/sms-code/send、POST /auth/email-code/send（发码，现有）；
 *      POST /account/phone/rebind、POST /account/email/rebind（提案，见 services/account.ts）
 *
 * 三步：① 验证身份（向当前绑定手机号发码；无手机号的账号退到当前邮箱）→ ② 验证新凭证 → ③ 完成。
 * 第一步只做本地格式校验，当前验证码随第二步一起提交由后端一次性校验——避免后端维护跨步骤
 * 状态，也避免现有 /auth/*-code/verify 会不会消费验证码的不确定性。
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LuCheck } from 'react-icons/lu'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { VerificationCodeButton } from '@/components/auth/VerificationCodeButton'
import { rebindEmail, rebindPhone, type RebindCurrentChannel } from '@/services/account'
import { sendEmailCode, sendSmsCode } from '@/services/auth'
import { getCaptchaParam } from '@/lib/aliyun-captcha'
import { appToast } from '@/lib/app-toast'
import { trackEvent } from '@/lib/track'
import { errorCodeOf, isNotFoundError } from '@/lib/request-error-message'
import { useAuthStore } from '@/store/auth'
import { useCustomerServiceStore } from '@/store/use-customer-service-store'
import type { AccountProfile } from '@/types'
import { CODE_RE, EMAIL_RE, PHONE_RE, maskEmail, maskPhone, normalizePhone } from '../contact-mask'

export type ContactRebindMode = 'phone' | 'email'

interface ContactRebindDialogProps {
  mode: ContactRebindMode
  profile: AccountProfile
  onClose: () => void
}

type Step = 'identity' | 'new' | 'done'

function StepIndicator({ step, newStepLabel }: { step: Step; newStepLabel: string }) {
  const { t } = useTranslation()
  const order: Step[] = ['identity', 'new', 'done']
  const current = order.indexOf(step)
  const items = [t('account.info.rebind.stepIdentity'), newStepLabel, t('account.info.rebind.stepDone')]
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label={t('account.info.rebind.stepIdentity')}>
      {items.map((label, idx) => {
        const state = idx < current ? 'done' : idx === current ? 'active' : 'todo'
        return (
          <li key={label} className="flex items-center gap-2" data-state={state} aria-current={state === 'active' ? 'step' : undefined}>
            <span
              className={
                state === 'active'
                  ? 'flex h-5 w-5 items-center justify-center rounded-full bg-brand-base text-xs font-bold text-white'
                  : state === 'done'
                    ? 'flex h-5 w-5 items-center justify-center rounded-full bg-brand-pale text-brand-base'
                    : 'flex h-5 w-5 items-center justify-center rounded-full border border-mg-border text-xs font-semibold text-mg-text-3'
              }
            >
              {state === 'done' ? <LuCheck size={11} strokeWidth={3} /> : idx + 1}
            </span>
            <span className={state === 'todo' ? 'text-mg-text-3' : 'font-semibold text-mg-text-1'}>{label}</span>
            {idx < items.length - 1 && <span className="h-px w-6 bg-mg-border" aria-hidden="true" />}
          </li>
        )
      })}
    </ol>
  )
}

export function ContactRebindDialog({ mode, profile, onClose }: ContactRebindDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const openSupport = useCustomerServiceStore((s) => s.setOpen)
  const isPhone = mode === 'phone'

  // 验身凭证：有手机号优先手机号（国内账号必有），否则退到当前邮箱
  const currentChannel: RebindCurrentChannel = profile.phone ? 'phone' : 'email'
  const currentTarget = currentChannel === 'phone' ? maskPhone(profile.phone ?? '') : maskEmail(profile.email)

  const [step, setStep] = useState<Step>('identity')
  const [currentCode, setCurrentCode] = useState('')
  const [currentCodeSent, setCurrentCodeSent] = useState(false)
  const [newContact, setNewContact] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newCodeSent, setNewCodeSent] = useState(false)

  const normalizedNew = isPhone ? normalizePhone(newContact) : newContact.trim().toLowerCase()
  const newValid = isPhone ? PHONE_RE.test(normalizedNew) : EMAIL_RE.test(normalizedNew)
  const isSame = isPhone
    ? Boolean(profile.phone && normalizedNew === normalizePhone(profile.phone))
    : Boolean(profile.email && normalizedNew === profile.email.trim().toLowerCase())
  const newContactError = newContact && !newValid
    ? t(isPhone ? 'account.info.rebind.invalidPhone' : 'account.info.rebind.invalidEmail')
    : isSame
      ? t(isPhone ? 'account.info.rebind.samePhone' : 'account.info.rebind.sameEmail')
      : ''

  const sendCurrentCode = async () => {
    if (currentChannel === 'phone') {
      const captcha = await getCaptchaParam()
      await sendSmsCode(profile.phone ?? '', captcha)
    } else {
      await sendEmailCode(profile.email)
    }
    setCurrentCodeSent(true)
  }

  const sendNewCode = async () => {
    if (isPhone) {
      const captcha = await getCaptchaParam()
      await sendSmsCode(normalizedNew, captcha)
    } else {
      await sendEmailCode(normalizedNew)
    }
    setNewCodeSent(true)
  }

  const rebindEvent = isPhone ? 'account.phone:rebind' : 'account.email:rebind'
  const mutation = useMutation({
    mutationFn: () => {
      const credential = { current_channel: currentChannel, current_code: currentCode.trim() }
      return isPhone
        ? rebindPhone(normalizedNew, newCode.trim(), credential)
        : rebindEmail(normalizedNew, newCode.trim(), credential)
    },
    onSuccess: (updated) => {
      appToast.success(t(isPhone ? 'account.info.rebind.phoneSuccess' : 'account.info.rebind.emailSuccess'))
      if (updated) queryClient.setQueryData<AccountProfile>(['account-profile'], updated)
      void queryClient.invalidateQueries({ queryKey: ['account-profile'] })
      // 右上角账号信息 / 手机号守卫读的是 auth store，成功后本地同步，不等重拉 session
      const account = useAuthStore.getState().account
      if (account) {
        useAuthStore.setState({ account: isPhone ? { ...account, phone: normalizedNew } : { ...account, email: normalizedNew } })
      }
      trackEvent(rebindEvent, undefined, { result: 'success' })
      setStep('done')
    },
    onError: (err: unknown) => {
      // 后端换绑端点未落地（#837）→ 40401，给用户可理解的文案而不是「资源不存在」
      if (isNotFoundError(err)) appToast.error(t('account.info.rebind.serviceUnavailable'))
      else appToast.requestError(err, t(isPhone ? 'account.info.rebind.phoneError' : 'account.info.rebind.emailError'))
      trackEvent(rebindEvent, undefined, { result: 'fail', error_code: errorCodeOf(err) })
    },
  })

  const title = t(isPhone ? 'account.info.rebind.changePhone' : 'account.info.rebind.changeEmail')
  const newStepLabel = t(isPhone ? 'account.info.rebind.stepNewPhone' : 'account.info.rebind.stepNewEmail')
  const currentCodeValid = CODE_RE.test(currentCode.trim())
  const newCodeValid = CODE_RE.test(newCode.trim())
  const busy = mutation.isPending
  const doneTarget = isPhone ? maskPhone(normalizedNew) : maskEmail(normalizedNew)

  const footer = step === 'identity' ? (
    <>
      <Button variant="outline" className="h-8 rounded-lg px-3 text-xs" onClick={onClose}>{t('common.cancel')}</Button>
      <Button
        variant="brand"
        className="h-8 rounded-lg px-4 text-xs font-semibold"
        disabled={!currentCodeSent || !currentCodeValid}
        onClick={() => setStep('new')}
      >
        {t('account.info.rebind.next')}
      </Button>
    </>
  ) : step === 'new' ? (
    <>
      <Button variant="outline" className="h-8 rounded-lg px-3 text-xs" disabled={busy} onClick={() => setStep('identity')}>
        {t('account.info.rebind.prev')}
      </Button>
      <Button
        variant="brand"
        className="h-8 rounded-lg px-4 text-xs font-semibold"
        loading={busy}
        disabled={!newValid || isSame || !newCodeSent || !newCodeValid}
        onClick={() => mutation.mutate()}
      >
        {t('account.info.rebind.confirm')}
      </Button>
    </>
  ) : (
    <Button variant="brand" className="h-8 rounded-lg px-4 text-xs font-semibold" onClick={onClose}>
      {t('account.info.rebind.done')}
    </Button>
  )

  return (
    // modal={false}：短信发码走阿里云人机验证，SDK 浮层 portal 在 Dialog 之外，Radix modal 会锁住 body 让它点不动
    // （同 RequiredPhoneBindingDialog）；遮罩仍渲染。
    <Modal
      open
      onClose={() => { if (!busy) onClose() }}
      size="md"
      modal={false}
      title={title}
      description={<StepIndicator step={step} newStepLabel={newStepLabel} />}
      footer={footer}
    >
      {step === 'identity' && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-mg-text-2">
              {t(currentChannel === 'phone' ? 'account.info.rebind.currentPhoneCode' : 'account.info.rebind.currentEmailCode')}
            </label>
            <p className="text-xs text-mg-text-3">{t('account.info.rebind.codeWillSendTo', { target: currentTarget })}</p>
            <Input
              inputMode="numeric"
              autoFocus
              value={currentCode}
              onChange={(e) => setCurrentCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={t('account.info.rebind.codePlaceholder')}
              className="h-9 text-xs rounded-lg"
              suffix={<VerificationCodeButton onSend={sendCurrentCode} />}
            />
          </div>
          <Button
            variant="link"
            className="h-auto p-0 text-xs font-bold"
            onClick={() => { trackEvent('account.contact:rebind_support'); openSupport(true) }}
          >
            {t('account.info.rebind.contactSupport')}
          </Button>
        </div>
      )}

      {step === 'new' && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-mg-text-2">
              {t(isPhone ? 'account.info.rebind.newPhone' : 'account.info.rebind.newEmail')}
            </label>
            <Input
              autoFocus
              type={isPhone ? 'tel' : 'email'}
              inputMode={isPhone ? 'tel' : 'email'}
              value={newContact}
              disabled={busy}
              error={Boolean(newContactError)}
              prefix={isPhone ? <span className="text-xs text-mg-text-3">+86</span> : undefined}
              onChange={(e) => {
                setNewContact(isPhone ? e.target.value.replace(/\D/g, '').slice(0, 11) : e.target.value)
                // 换了目标就得重新发码，旧码不再对应
                setNewCode('')
                setNewCodeSent(false)
              }}
              placeholder={t(isPhone ? 'account.info.rebind.newPhonePlaceholder' : 'account.info.rebind.newEmailPlaceholder')}
              className="h-9 text-xs rounded-lg"
            />
            {newContactError && <p className="text-xs text-mg-danger" role="alert">{newContactError}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-mg-text-2">
              {t(isPhone ? 'account.info.rebind.newPhoneCode' : 'account.info.rebind.newEmailCode')}
            </label>
            <p className="text-xs text-mg-text-3">
              {newCodeSent
                ? t('account.info.rebind.codeSentTo', { target: isPhone ? maskPhone(normalizedNew) : maskEmail(normalizedNew) })
                : t('account.info.rebind.fillNewContactFirst')}
            </p>
            <Input
              inputMode="numeric"
              value={newCode}
              disabled={busy}
              onChange={(e) => setNewCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={t('account.info.rebind.codePlaceholder')}
              className="h-9 text-xs rounded-lg"
              suffix={<VerificationCodeButton onSend={sendNewCode} disabled={!newValid || isSame} />}
            />
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-pale text-brand-base">
            <LuCheck size={22} strokeWidth={2.5} />
          </span>
          <strong className="text-sm font-bold text-mg-text-1">
            {t(isPhone ? 'account.info.rebind.phoneSuccess' : 'account.info.rebind.emailSuccess')}
          </strong>
          <span className="text-xs text-mg-text-3">{doneTarget}</span>
        </div>
      )}
    </Modal>
  )
}
