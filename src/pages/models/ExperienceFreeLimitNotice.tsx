/**
 * 免费模型日限额提示条（需求方 #833 场景三，1.0.6）。
 * 后端 `4291 / free_model_daily_limit_reached`（note 15550）到达后展示：标题/说明逐字对齐
 * 单内定稿表格，「查看用量」跳用量统计页。与余额拦截条（ExperienceBalanceNotice）共用一套
 * 版式；不锁输入框——文案本身引导用户切换其他模型继续。
 * 限额按东八区自然日重置，后端暂不返回 reset_at，「明日 00:00」先按静态文案。
 */
import { LuTriangleAlert } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

export function ExperienceFreeLimitNotice() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="playground-balance-notice" role="alert">
      <LuTriangleAlert size={15} />
      <span>
        <strong>{t('modelsExperience.freeDailyLimitTitle')}</strong>
        {t('modelsExperience.freeDailyLimitHint')}
      </span>
      <button type="button" onClick={() => navigate('/usage')}>
        {t('modelsExperience.viewUsage')}
      </button>
    </div>
  )
}
