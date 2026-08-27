/**
 * 新手指南编排 Hook —— 把身份/租户/市场接到领域层，把五步 CTA 接到控制台路由。
 * 路由：全局
 * API：无（本轮全 Mock，见 store/use-onboarding-store.ts 末尾「待后端」）
 *
 * 规格：2026-08-06-onboarding-guide-reward-design.md §5.4（自动展开）/§6.2（权限）
 *      /§7（五步定义与 CTA）/§8.2（金额快照按站点）
 *
 * 原型里这些逻辑都堆在 App.tsx（它是单文件原型）。控制台侧拆成 hook，
 * 让侧栏入口和模型广场悬浮入口共用同一份状态与回调。
 */

import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMarket } from '@/hooks/useMarket'
import { useTenantRole, type TenantRole } from '@/hooks/use-tenant-role'
import { useAuthStore } from '@/store/auth'
import { useConnectModalStore } from '@/store/use-connect-modal-store'
import {
  hasSeenOnboardingAutoOpen,
  markOnboardingAutoOpenSeen,
  reportOnboardingStep,
  useOnboardingStore,
} from '@/store/use-onboarding-store'
import { trackEvent } from '@/lib/track'
import {
  canAccessOnboardingGuide,
  type OnboardingRole,
  type OnboardingSite,
  type OnboardingStepKey,
} from './onboarding-guide-domain'

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
  const market = useMarket()
  const account = useAuthStore((s) => s.account)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const { role, isEnterprise } = useTenantRole()
  const openConnectModal = useConnectModalStore((s) => s.open)

  const guides = useOnboardingStore((s) => s.guides)
  const open = useOnboardingStore((s) => s.open)
  const setOpen = useOnboardingStore((s) => s.setOpen)
  const ensureGuide = useOnboardingStore((s) => s.ensureGuide)
  const claimReward = useOnboardingStore((s) => s.claimReward)

  const onboardingRole = toOnboardingRole(role)
  const tenantKind = isEnterprise ? 'enterprise' : 'personal'
  const guide = activeTenantId ? guides[activeTenantId] : undefined

  // 角色还没回来时不判定：此时既不给入口也不建状态，避免先按 member 藏掉再闪出来
  const hasAccess = Boolean(
    activeTenantId && onboardingRole && canAccessOnboardingGuide(tenantKind, onboardingRole),
  )

  // 取得资格：租户第一次进控制台时建状态并快照奖励金额（规格 §6.1）
  useEffect(() => {
    if (!activeTenantId || !hasAccess) return
    ensureGuide({ tenantId: activeTenantId, tenantKind, site: toOnboardingSite(market) })
  }, [activeTenantId, hasAccess, tenantKind, market, ensureGuide])

  // 自动展开一次（规格 §5.4）：偏好按 user+tenant+guideVersion，Owner 关掉不影响 Admin。
  // 已领取的租户不再打扰。
  useEffect(() => {
    if (!hasAccess || !guide || !activeTenantId || !account) return
    if (guide.status === 'rewarded') return
    if (hasSeenOnboardingAutoOpen(account.account_id, activeTenantId)) return
    markOnboardingAutoOpenSeen(account.account_id, activeTenantId)
    setOpen(true)
    trackEvent('onboarding_guide_viewed', { source: 'auto' })
  }, [hasAccess, guide, activeTenantId, account, setOpen])

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
      trackEvent('onboarding_step_cta_clicked', { step_key: stepKey })
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
    [navigate, setOpen, activeWorkspaceId, openConnectModal],
  )

  const handleClaim = useCallback(() => {
    if (!activeTenantId) return
    trackEvent('onboarding_reward_claim_submitted', {})
    const receipt = claimReward(activeTenantId)
    trackEvent('onboarding_reward_claim_result', {
      result: receipt ? 'success' : 'already_claimed',
    })
  }, [activeTenantId, claimReward])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      trackEvent(next ? 'onboarding_guide_viewed' : 'onboarding_guide_closed', {
        ...(next ? { source: 'manual' } : {}),
      })
    },
    [setOpen],
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
