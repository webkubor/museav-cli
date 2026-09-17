/**
 * 新手指南编排 Hook —— 把身份/租户/市场接到领域层，把五步 CTA 接到控制台路由。
 * 路由：全局
 * API：services/onboarding.ts（prd#943 三接口），状态经 store/use-onboarding-store.ts
 *
 * 规格：2026-08-06-onboarding-guide-reward-design.md §5.4（自动展开）/§6.2（权限）
 *      /§7（五步定义与 CTA）/§8.2（金额快照按站点）
 *
 * 原型里这些逻辑都堆在 App.tsx（它是单文件原型）。控制台侧拆成 hook，
 * 让侧栏入口和模型广场悬浮入口共用同一份状态与回调。
 */

import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { balanceBreakdownKey, balanceKey } from '@/hooks/use-balance'
import { useMarket } from '@/hooks/useMarket'
import { useTenantRole, type TenantRole } from '@/hooks/use-tenant-role'
import { useAuthStore } from '@/store/auth'
import { useConnectModalStore } from '@/store/use-connect-modal-store'
import { reportOnboardingStep, useOnboardingStore } from '@/store/use-onboarding-store'
import { appToast } from '@/lib/app-toast'
import { trackEvent, type TrackTopFields } from '@/lib/track'
import { useTrackContext } from '@/hooks/use-track-context'
import {
  canAccessOnboardingGuide,
  type OnboardingRole,
  type OnboardingSite,
  type OnboardingStepKey,
} from './onboarding-guide-domain'
import { buildOnboardingGuideProps, type OnboardingTrackProps } from './onboarding-track'

/** 后端角色码 → 领域层角色。未知角色按 member 处理（fail-closed，不给入口）。 */
function toOnboardingRole(role: TenantRole | undefined): OnboardingRole | null {
  if (role === 'tenant_owner') return 'owner'
  if (role === 'tenant_admin') return 'admin'
  if (role === 'tenant_member') return 'member'
  return null
}

/** 站点决定奖励币种与金额（国内 ¥10 / 海外 $5，规格 §8.1）。 */
function toOnboardingSite(market: 'china' | 'global'): OnboardingSite {
  return market === 'china' ? 'domestic' : 'overseas'
}

export function useOnboardingGuide() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const market = useMarket()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const { role, isEnterprise } = useTenantRole()
  const openConnectModal = useConnectModalStore((s) => s.open)
  // 房内公共属性收集器：page / tenant_id / tenant_type / role / workspace_id（与 overview_* 家族同源）
  const trackCtx = useTrackContext()

  const guides = useOnboardingStore((s) => s.guides)
  const open = useOnboardingStore((s) => s.open)
  const setOpen = useOnboardingStore((s) => s.setOpen)
  const ensureGuide = useOnboardingStore((s) => s.ensureGuide)
  const claimReward = useOnboardingStore((s) => s.claimReward)
  const pendingAutoOpen = useOnboardingStore((s) => s.pendingAutoOpen)
  const consumeAutoOpen = useOnboardingStore((s) => s.consumeAutoOpen)

  const onboardingRole = toOnboardingRole(role)
  const tenantKind = isEnterprise ? 'enterprise' : 'personal'
  const guide = activeTenantId ? guides[activeTenantId] : undefined

  // 角色还没回来时不判定：此时既不给入口也不建状态，避免先按 member 藏掉再闪出来
  const hasAccess = Boolean(
    activeTenantId && onboardingRole && canAccessOnboardingGuide(tenantKind, onboardingRole),
  )

  /**
   * 埋点统一出口。两件事容易做错，所以收成一个函数：
   *   1. 公共属性（规格 §13.1）必须每条都带 —— trackCtx + guide 快照。
   *   2. source / result / error_code 是**顶层契约字段**（#423 / SDK TrackEventOptions）：
   *      服务端 IngestEvent 按固定列落库，塞进 props 会被脱敏白名单丢掉 = 丢数据，
   *      所以走 trackEvent 的第三个参数，不进第二个。
   *
   * trackCtx 每次渲染都是新对象，直接进 useCallback 依赖会让所有回调跟着变；
   * 这里用 ref 兜住，emit 保持稳定引用。ref 只在 effect 里写（react-hooks/refs）。
   */
  const trackPropsRef = useRef<OnboardingTrackProps>({})
  useEffect(() => {
    trackPropsRef.current = guide
      ? { ...trackCtx, ...buildOnboardingGuideProps(guide, role) }
      : { ...trackCtx }
  })

  const emit = useCallback(
    (event: string, extra?: OnboardingTrackProps, top?: TrackTopFields) => {
      trackEvent(event, { ...trackPropsRef.current, ...extra }, top)
    },
    [],
  )

  // 取得资格 + 拉进度：服务端在第一次 GET 时建进度行并快照奖励金额（规格 §6.1）
  useEffect(() => {
    if (!activeTenantId || !hasAccess) return
    ensureGuide({ tenantId: activeTenantId, tenantKind, site: toOnboardingSite(market), role })
  }, [activeTenantId, hasAccess, tenantKind, market, role, ensureGuide])

  /**
   * 自动展开一次（规格 §5.4）。判定权在服务端：偏好按 user+tenant+guideVersion 存在
   * billing，GET /guide 只对「这个用户这一版第一次读」回 auto_open=true，读完即写
   * auto_open_seen_at。所以这里不再查 localStorage，只消费 store 收到的那一次信号
   * （consumeAutoOpen 防同一会话里重复弹）。已领取的租户服务端不会回 true。
   */
  useEffect(() => {
    if (!hasAccess || !guide || !activeTenantId) return
    if (pendingAutoOpen !== activeTenantId) return
    consumeAutoOpen()
    if (guide.status === 'rewarded') return
    setOpen(true)
    emit('onboarding_guide_viewed', undefined, { source: 'auto' })
  }, [hasAccess, guide, activeTenantId, pendingAutoOpen, consumeAutoOpen, setOpen, emit])

  /**
   * 业务页在真实成功节点调这个上报，不要绑在普通点击上（规格 §16.2）。
   * 实现委托给 store 的命令式版本 —— 非 React 调用方（experience-run.ts）走同一条路径，
   * 两处各写一份迟早分叉。
   */
  const reportStep = useCallback(
    (stepKey: OnboardingStepKey, evidenceType: string, evidenceId: string) => {
      reportOnboardingStep(stepKey, evidenceType, evidenceId)
    },
    [],
  )

  /** 气泡里五个 CTA 的落点。第 4 步复用顶栏那个弹窗，不另开一套（规格 §7.3）。 */
  const handleStepAction = useCallback(
    (stepKey: OnboardingStepKey) => {
      emit('onboarding_step_cta_clicked', { step_key: stepKey })
      setOpen(false)
      if (stepKey === 'marketplace') {
        navigate('/models')
        return
      }
      if (stepKey === 'playground') {
        navigate('/models/playground')
        return
      }
      if (stepKey === 'api_key') {
        // API Keys 是工作区级页面；没有 activeWorkspaceId 时走中转页解析默认空间
        navigate(activeWorkspaceId ? `/workspace/${activeWorkspaceId}/api-keys` : '/api-keys')
        return
      }
      if (stepKey === 'quick_connect') {
        openConnectModal()
        return
      }
      navigate('/logs')
    },
    [navigate, setOpen, activeWorkspaceId, openConnectModal, emit],
  )

  const handleClaim = useCallback(async () => {
    if (!activeTenantId) return
    emit('onboarding_reward_claim_submitted')
    const outcome = await claimReward(activeTenantId)
    /**
     * 规格 §13.1 要 result=success|failed|already_claimed 三态，但顶层 result 列的枚举
     * 只有 success|fail|cancel（SDK TrackEventOptions）。两个契约都要满足：
     *   · 顶层 result/error_code 按 SDK 枚举落库，指标口径与其他模块一致
     *   · 规格那个更细的三态放业务属性 claim_result，§13.2「重复领取请求率」照样算得出
     *
     * 三态的判定在 store：服务端对重复领取是**幂等重放**（同样返 200 + 原记录），
     * 光看响应分不出首次与重复，得靠领取前的本地状态。
     */
    emit(
      'onboarding_reward_claim_result',
      { claim_result: outcome.result },
      outcome.result === 'success'
        ? { result: 'success' }
        : { result: 'fail', error_code: outcome.result === 'failed' ? outcome.errorCode : 'already_claimed' },
    )
    // 领取是用户主动点的按钮，失败必须给回音（上报五步那些是背景动作，才静默）
    if (outcome.result === 'failed') {
      appToast.requestError(outcome.error, t('onboarding.reward.claimFailed'))
      return
    }
    /**
     * 领取成功 = 服务端刚给这个租户加了一笔赠金，本地缓存里的余额与入账记录当场作废。
     * 不失效的话（全局 staleTime 60s、余额 30s）会踩两件事：
     *   1. 余额卡片还显示领取前的数字；
     *   2. 「查看赠金」落到账单页时 react-query 认为列表还新鲜、根本不发请求 ——
     *      拿到的是**领取前**的列表，那条新记录不在里面，高亮定位当场落空。
     * 对照 TopUpModal / PromoRedeemForm：充值与兑换码成功后也是这么收口的。
     */
    if (outcome.result === 'success' || outcome.result === 'already_claimed') {
      void queryClient.invalidateQueries({ queryKey: balanceKey(activeTenantId) })
      void queryClient.invalidateQueries({ queryKey: balanceBreakdownKey(activeTenantId) })
      void queryClient.invalidateQueries({ queryKey: ['billing', 'income-records', activeTenantId] })
    }
  }, [activeTenantId, claimReward, emit, t, queryClient])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      // 关闭事件规格没定 source；只有 viewed 分 auto|manual
      emit(
        next ? 'onboarding_guide_viewed' : 'onboarding_guide_closed',
        undefined,
        next ? { source: 'manual' } : undefined,
      )
    },
    [setOpen, emit],
  )

  return {
    /** 已领取的租户不再展示入口（规格 §5.3「关闭后当前租户入口永久隐藏」） */
    visible: Boolean(hasAccess && guide && guide.status !== 'rewarded'),
    guide,
    open,
    reportStep,
    handleStepAction,
    handleClaim,
    handleOpenChange,
  }
}
