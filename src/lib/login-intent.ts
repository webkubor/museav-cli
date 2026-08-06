/**
 * 登录成功后的模型登录意图重新校验（qa#551，PRD《首页重构 PRD：模型广场页面》§11）
 *
 * 「立即体验」「发起模型对比」在游客态点击时，toLoginWithRedirect 已把结构化上下文
 * （model_id / model_category / experience_type / compare_with）存进 sessionStorage。
 * 登录成功后，各登录入口（邮箱密码 / 手机号 / OAuth 回调）统一调用
 * resolveLoginDestination()：重新拉一次模型详情，确认模型仍存在、公开在线、一级类别
 * 与「共同可体验类型」（对比场景要求每个候选都仍与基准模型同类别）未变；任一项不满足
 * 就降级为普通回跳（fallback，通常是广场/详情页原地址）并轻量提示用户重新确认，不静默
 * 假装成功、也不把失效的上下文继续带进体验/对比页。
 *
 * 类别/在线判定复用 qa#549 在 ModelsCompareModal.tsx 定下的口径（resolveModelCategory
 * + status !== 'unavailable'），不要在这里另造一套，否则两处判断会慢慢长歪。
 */
import type { NavigateFunction } from 'react-router-dom'
import { getModel } from '@/services/catalog'
import { consumeModelLoginIntent } from '@/lib/redirect'
import { appToast } from '@/lib/app-toast'
import i18n from 'i18next'
import { resolveModelCategory } from '@/pages/models/model-experience-data'
import type { CatalogModelDetail } from '@/types'

export interface LoginDestination {
  path: string
  state?: Record<string, unknown>
}

/** 公开在线判定，与 ModelsCompareModal 的 isOnline 同口径：只有显式 unavailable 才算离线 */
function isOnline(model: CatalogModelDetail): boolean {
  return model.status !== 'unavailable'
}

/**
 * 结合保存的模型登录意图 + 普通回跳目标，解析登录成功后应导航到的目的地。
 * fallback 用 getRedirectTarget() 算出的普通回跳地址（通常是广场/详情页原地址）。
 */
export async function resolveLoginDestination(fallback: string): Promise<LoginDestination> {
  const intent = consumeModelLoginIntent()
  if (!intent || !intent.experience_type) return { path: fallback }

  if (intent.experience_type === 'try' && intent.model_id) {
    try {
      const model = await getModel(intent.model_id)
      const categoryChanged =
        !!intent.model_category && resolveModelCategory(model) !== intent.model_category
      if (!isOnline(model) || categoryChanged) {
        appToast.info(i18n.t('common.loginIntent.modelChanged', { ns: 'common' }))
        return { path: fallback }
      }
      return { path: '/models/playground', state: { selectedModelId: intent.model_id } }
    } catch {
      appToast.info(i18n.t('common.loginIntent.modelChanged', { ns: 'common' }))
      return { path: fallback }
    }
  }

  if (intent.experience_type === 'compare' && intent.compare_with?.length) {
    try {
      const models = await Promise.all(intent.compare_with.map((id) => getModel(id).catch(() => null)))
      const anchorCategory = models.find(Boolean) ? resolveModelCategory(models.find(Boolean)!) : undefined
      const validIds = intent.compare_with.filter((_, idx) => {
        const model = models[idx]
        return !!model && isOnline(model) && (!anchorCategory || resolveModelCategory(model) === anchorCategory)
      })
      if (validIds.length === 0) {
        appToast.info(i18n.t('common.loginIntent.compareModelsChanged', { ns: 'common' }))
        return { path: fallback }
      }
      return { path: '/models/compare', state: { selectedIds: validIds } }
    } catch {
      appToast.info(i18n.t('common.loginIntent.compareModelsChanged', { ns: 'common' }))
      return { path: fallback }
    }
  }

  return { path: fallback }
}

/** 登录成功回调的统一收口：解析目的地并 replace 导航，供各登录入口调用 */
export async function navigateAfterLogin(navigate: NavigateFunction, fallback: string): Promise<void> {
  const destination = await resolveLoginDestination(fallback)
  navigate(destination.path, { replace: true, state: destination.state })
}
