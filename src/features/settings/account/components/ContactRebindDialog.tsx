/**
 * 手机号 / 邮箱换绑弹窗（shared/modelgo_prd#837，对齐原型 App.tsx AccountContactChangeDialog）。
 * 路由：/settings/account（基本资料）
 * API（后端契约 2026-09-14 落地，见 services/account.ts 说明）：
 *      ① POST /account/rebind/current-code/send → POST /account/rebind/verify-current（签发 rebind_ticket）
 *      ② POST /auth/sms-code/send | /auth/email-code/send（给新凭证发码，现有）→ POST /account/rebind/commit
 *
 * 三步：① 验证身份（向**当前绑定的、要被换掉的那个凭证**发码：改手机验当前手机、改邮箱验当前邮箱；「下一步」真校验并拿票据）
 *      → ② 验证新凭证（票据 + 新码一起提交）→ ③ 完成。
 * ⚠️ 与原型的差异：原型「更换邮箱」第一步用当前手机验身；后端 CommitRebind 按票据里的 channel 决定替换哪个凭证
 *   （permissions pkg/service/account_rebind.go），票据 channel 必须等于换绑目标，所以前端验身 channel 跟 mode 走。
 * commit 成功后端吊销全部会话：完成页不再拉任何接口，「重新登录」清鉴权态跳 /login。
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LuCheck } from 'react-icons/lu'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { VerificationCodeButton } from '@/components/auth/VerificationCodeButton'
import {
  REBIND_ERROR_CODE,
  commitRebind,
  sendRebindCurrentCode,
  verifyRebindCurrent,
  type RebindCurrentChannel,
} from '@/services/account'
import { sendEmailCode, sendSmsCode } from '@/services/auth'
import { getCaptchaParam } from '@/lib/aliyun-captcha'
import { appToast } from '@/lib/app-toast'
import { trackEvent } from '@/lib/track'
import { toLoginWithRedirect } from '@/lib/redirect'
import { errorCodeOf, isApiErrorCode } from '@/lib/request-error-message'
import { useAuthStore } from '@/store/auth'
import { getMarketConfig } from '@/config/market'
import { useMarket } from '@/hooks/useMarket'
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
  const navigate = useNavigate()
  const clearAuth = useAuthStore((s) => s.clearAuth)
  // 求助出口是人工支持邮箱的 mailto（原型口径「联系人工客服」）；控制台内嵌平台助手归 1.0.7，这里不能挂它
  const supportEmail = getMarketConfig(useMarket()).supportEmail
  const supportMailHref = `mailto:${supportEmail}?subject=${encodeURIComponent(t('account.info.rebind.supportMailSubject'))}`
  const isPhone = mode === 'phone'

  // 验身凭证 = 要被换掉的那个凭证（后端票据 channel 决定 commit 替换哪个字段，见文件头）。
  // 入口在 BasicInfoTab 只对已绑定的凭证露出，所以这里 profile.phone / profile.email 必有值，40037 不可达。
  const currentChannel: RebindCurrentChannel = mode
  const currentTarget = isPhone ? maskPhone(profile.phone ?? '') : maskEmail(profile.email)

  const [step, setStep] = useState<Step>('identity')
  const [currentCode, setCurrentCode] = useState('')
  const [currentCodeSent, setCurrentCodeSent] = useState(false)
  // 第一步校验通过后端签发的换绑票据（600s）；「上一步」回退不作废，再点「下一步」直接进第二步
  const [rebindTicket, setRebindTicket] = useState<string | null>(null)
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

  // 当前凭证发码走换绑专用端点（登录态、后端按会话取号，无需滑块）
  const sendCurrentCode = async () => {
    await sendRebindCurrentCode(currentChannel)
    setCurrentCodeSent(true)
  }

  // 新凭证发码复用登录/注册的公共端点，短信与邮箱后端都要人机参数（缺参 40025）
  const sendNewCode = async () => {
    const captcha = await getCaptchaParam()
    if (isPhone) await sendSmsCode(normalizedNew, captcha)
    else await sendEmailCode(normalizedNew, captcha)
    setNewCodeSent(true)
  }

  const rebindEvent = isPhone ? 'account.phone:rebind' : 'account.email:rebind'

  // 票据失效（40103）：回第一步重新验身，旧码已被消费，必须重发
  const resetToIdentity = () => {
    setRebindTicket(null)
    setCurrentCode('')
    setCurrentCodeSent(false)
    setStep('identity')
  }

  const verifyMutation = useMutation({
    mutationFn: () => verifyRebindCurrent(currentChannel, currentCode.trim()),
    onSuccess: (res) => {
      setRebindTicket(res.rebind_ticket)
      setStep('new')
    },
    onError: (err: unknown) => {
      // 验身阶段的失败不是「更换失败」：兜底文案单独一条，后端 msg（40035 等）优先透出
      appToast.requestError(err, t('account.info.rebind.identityVerifyFailed'))
      trackEvent(rebindEvent, undefined, { result: 'fail', error_code: errorCodeOf(err) })
    },
  })

  const goNext = () => {
    if (rebindTicket) {
      setStep('new')
      return
    }
    verifyMutation.mutate()
  }

  const commitMutation = useMutation({
    mutationFn: () => commitRebind(rebindTicket ?? '', normalizedNew, newCode.trim()),
    onSuccess: () => {
      appToast.success(t(isPhone ? 'account.info.rebind.phoneSuccess' : 'account.info.rebind.emailSuccess'))
      // 会话已被后端吊销：完成页存活期间不允许再有任何请求打出去（会撞 40101 → 「会话过期」toast 把完成页顶掉），
      // 掐掉在途查询、不 invalidate、不同步本地 profile（relogin 马上 clearAuth，写了也是白写）
      void queryClient.cancelQueries()
      trackEvent(rebindEvent, undefined, { result: 'success' })
      setStep('done')
    },
    onError: (err: unknown) => {
      trackEvent(rebindEvent, undefined, { result: 'fail', error_code: errorCodeOf(err) })
      if (isApiErrorCode(err, REBIND_ERROR_CODE.TICKET_INVALID)) {
        appToast.error(t('account.info.rebind.ticketExpired'))
        resetToIdentity()
        return
      }
      // 40911 占用 / 42901 限频 / 新码错误：后端 msg 已是中英 catalog 文案，直接透出
      appToast.requestError(err, t(isPhone ? 'account.info.rebind.phoneError' : 'account.info.rebind.emailError'))
    },
  })

  // 完成页唯一出口：全部会话已吊销，清前端鉴权态 → SPA 跳登录（不用 window.location，防 /login↔/dashboard 循环刷新）
  const relogin = () => {
    onClose()
    clearAuth()
    // 复用 RequireAuth 的回跳口径：重新登录后落回账号设置页
    navigate(toLoginWithRedirect('/settings/account'), { replace: true })
  }

  const title = t(isPhone ? 'account.info.rebind.changePhone' : 'account.info.rebind.changeEmail')
  const newStepLabel = t(isPhone ? 'account.info.rebind.stepNewPhone' : 'account.info.rebind.stepNewEmail')
  const currentCodeValid = CODE_RE.test(currentCode.trim())
  const newCodeValid = CODE_RE.test(newCode.trim())
  const verifying = verifyMutation.isPending
  const busy = commitMutation.isPending
  const doneTarget = isPhone ? maskPhone(normalizedNew) : maskEmail(normalizedNew)

  const footer = step === 'identity' ? (
    <>
      <Button variant="outline" className="h-8 rounded-lg px-3 text-xs" disabled={verifying} onClick={onClose}>{t('common.cancel')}</Button>
      <Button
        variant="brand"
        className="h-8 rounded-lg px-4 text-xs font-semibold"
        loading={verifying}
        disabled={!currentCodeSent || !currentCodeValid}
        onClick={goNext}
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
        disabled={!rebindTicket || !newValid || isSame || !newCodeSent || !newCodeValid}
        onClick={() => commitMutation.mutate()}
      >
        {t('account.info.rebind.confirm')}
      </Button>
    </>
  ) : (
    <Button variant="brand" className="h-8 rounded-lg px-4 text-xs font-semibold" onClick={relogin}>
      {t('account.info.rebind.relogin')}
    </Button>
  )

  return (
    // modal={false}：发码走阿里云人机验证，SDK 浮层 portal 在 Dialog 之外，Radix modal 会锁住 body 让它点不动
    // （同 RequiredPhoneBindingDialog）；遮罩仍渲染。非 modal 下 Radix 仍会把滑块浮层上的操作当「外部交互」
    // 触发关闭，滑完弹窗就没了——一并拦掉，关闭只走右上角 X / 取消 / ESC。
    <Modal
      open
      onClose={() => {
        if (step === 'done') relogin()
        else if (!busy && !verifying) onClose()
      }}
      size="md"
      modal={false}
      onPointerDownOutside={(event) => event.preventDefault()}
      onInteractOutside={(event) => event.preventDefault()}
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
              disabled={verifying}
              onChange={(e) => {
                setCurrentCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                // 改了当前码就得重新校验，旧票据不再对应
                setRebindTicket(null)
              }}
              placeholder={t('account.info.rebind.codePlaceholder')}
              size="sm"
              suffix={<VerificationCodeButton onSend={sendCurrentCode} disabled={verifying} />}
            />
          </div>
          <Button asChild variant="link" className="h-auto p-0 text-xs font-bold">
            <a href={supportMailHref} onClick={() => trackEvent('account.contact:rebind_support')}>
              {t('account.info.rebind.contactSupport', { email: supportEmail })}
            </a>
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
              size="sm"
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
              size="sm"
              suffix={<VerificationCodeButton onSend={sendNewCode} disabled={!newValid || isSame || busy} />}
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
          <p className="max-w-xs text-xs text-mg-text-3">{t('account.info.rebind.doneRelogin')}</p>
        </div>
      )}
    </Modal>
  )
}
