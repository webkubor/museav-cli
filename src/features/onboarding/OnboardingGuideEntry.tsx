/**
 * 新手指南的挂载点 —— 都是薄壳，状态与回调全在 useOnboardingGuide。
 * 路由：侧栏（登录态全站）/ 领取成功弹框
 * （原公开模型广场的左下角悬浮入口随广场拆到官网删除，prd#1272；官网没有登录态，挂不了）
 * API：无（本轮全 Mock）
 *
 * 规格：2026-08-06 §5.1（侧栏入口；广场悬浮入口已随广场下线）
 *      2026-08-13（领取成功弹框 → 账单入账记录定位）
 */

import { useNavigate } from 'react-router-dom'
import { OnboardingGuide, OnboardingRewardSuccessDialog } from './OnboardingGuide'
import { useOnboardingGuide } from './use-onboarding-guide'
import { useOnboardingStore } from '@/store/use-onboarding-store'
import { useAuthStore } from '@/store/auth'
import { trackEvent } from '@/lib/track'
import { useTrackContext } from '@/hooks/use-track-context'
import { buildOnboardingGuideProps } from './onboarding-track'

/** 侧栏底部入口：展开态单行「金币 + 新手指南 + N/5」，收起态只剩图标 + Tooltip。 */
export function OnboardingGuideSidebarEntry({ collapsed }: { collapsed: boolean }) {
  const { visible, guide, open, handleStepAction, handleClaim, handleOpenChange } =
    useOnboardingGuide()

  if (!visible || !guide) return null

  return (
    <div className="px-3 pb-3">
      <OnboardingGuide
        collapsed={collapsed}
        guide={guide}
        onClaim={handleClaim}
        onOpenChange={handleOpenChange}
        onStepAction={handleStepAction}
        open={open}
      />
    </div>
  )
}

/**
 * 领取成功弹框。「查看赠金」进账单管理并定位到本次「新手任务奖励」入账记录；
 * 「稍后查看」只关闭、不跳转，奖励和记录都保持有效（2026-08-13 规格）。
 */
export function OnboardingRewardDialog() {
  const navigate = useNavigate()
  const receipt = useOnboardingStore((s) => s.rewardReceipt)
  const dismissReceipt = useOnboardingStore((s) => s.dismissReceipt)
  const takeReceiptForBilling = useOnboardingStore((s) => s.takeReceiptForBilling)

  // 埋点公共属性（规格 §13.1）。弹框不走 useOnboardingGuide（它挂在布局壳上、
  // 领取完 visible 已经是 false），所以自己从 store 取这一份 guide。
  const trackCtx = useTrackContext()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const guide = useOnboardingStore((s) => (activeTenantId ? s.guides[activeTenantId] : undefined))
  const trackRole = useOnboardingStore((s) =>
    activeTenantId ? s.trackRoles[activeTenantId] : undefined,
  )

  return (
    <OnboardingRewardSuccessDialog
      open={Boolean(receipt)}
      rewardLabel={receipt?.rewardLabel ?? ''}
      onDismiss={dismissReceipt}
      onViewCredit={() => {
        // 先把 recordRef 交给账单页（store 里换手），再跳；跳过去时高亮标识已就位
        if (!takeReceiptForBilling()) return
        trackEvent(
          'onboarding_reward_view_credit',
          { ...trackCtx, ...(guide ? buildOnboardingGuideProps(guide, trackRole) : {}) },
          { source: 'reward_success_dialog' },
        )
        navigate('/billing')
      }}
    />
  )
}
