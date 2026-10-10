/**
 * 余额为 0 的发送拦截提示条（需求方 #833，1.0.6）。
 * 付费模型：余额不足 + 「去充值」。免费模型（#1231 起不再受余额限制）：只在后端仍返回 4032 时兜底，
 * 文案中性、不引导充值。「去充值」统一走全局充值弹窗
 * （不再跳 /billing，当前模型与输入原地保留，与文案承诺一致）。
 * 免费模型日限额提示（场景三）待后端错误码交付后接入（#833 后端项）。
 * 体验页、模型对比的共享/独立输入三处复用。
 */
import { LuTriangleAlert } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import { trackEvent } from '@/lib/track'
import { useRechargeStore } from '@/store/use-recharge-store'
import { useCurrency } from '@/hooks/use-platform-config'

export function ExperienceBalanceNotice({ free, lockedModelCount }: {
  /** 被拦截的模型是否为免费模型（决定场景一/场景二文案） */
  free: boolean
  /** 埋点：本入口锁定的模型数（单模型页 1，对比页为列数） */
  lockedModelCount: number
}) {
  const { t } = useTranslation()
  const { symbol } = useCurrency()
  const openRecharge = useRechargeStore((s) => s.open)

  return (
    <div className="playground-balance-notice" role="alert">
      <LuTriangleAlert size={15} />
      <span>
        <strong>
          {t(free ? 'modelsExperience.balanceZeroFreeTitle' : 'modelsExperience.balanceInsufficientTitle', { symbol })}
        </strong>
        {t(free ? 'modelsExperience.balanceZeroFreeHint' : 'modelsExperience.balanceInsufficientHint', { symbol })}
      </span>
      {/* #1231：免费模型已不受余额限制，这一路只剩后端 4032 兜底，引导重试/换模型，不引导充值 */}
      {!free && (
        <button
          type="button"
          onClick={() => {
            trackEvent('playground_recharge_click', { locked_model_count: lockedModelCount })
            openRecharge()
          }}
        >
          {t('modelsExperience.recharge')}
        </button>
      )}
    </div>
  )
}
