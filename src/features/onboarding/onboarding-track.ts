/**
 * 新手指南埋点公共属性（规格 §13.1「公共属性」）。
 *
 * 规格要求每条事件都带：site、tenant_type、role、guide_version、reward_currency、
 * reward_amount、已完成步数。其中前三项 role 之外的都能从 guide 自身推出来 —— 奖励
 * 快照就在 state 里（§8.2：进行中的租户始终按快照展示），所以不用再查市场配置。
 *
 * role 拿不到（未登录中间态 / 角色查询未回）时直接不带这个 key，不写 'unknown' 假值 ——
 * 与 use-track-context.ts 的口径一致：拿不到的字段跳过，不写假数据。
 *
 * ⚠️ site / tenant_type 用 guide 里的值而不是当前 market：租户取得资格时快照的那份才是
 * 这条任务的归属，后台调价或用户切站都不该改已有任务的归因（§8.2）。
 */

import type { OnboardingGuideState } from './onboarding-guide-domain'

/** 与 lib/track 的 TrackData 对齐：只允许标量，禁止嵌套 */
export type OnboardingTrackProps = Record<string, string | number | boolean>

export function buildOnboardingGuideProps(
  guide: OnboardingGuideState,
  role?: string,
): OnboardingTrackProps {
  const props: OnboardingTrackProps = {
    tenant_id: guide.tenantId,
    tenant_type: guide.tenantKind,
    site: guide.reward.site,
    guide_version: guide.guideVersion,
    reward_currency: guide.reward.currency,
    reward_amount: guide.reward.amount,
    completed_steps: guide.completedSteps.length,
  }
  if (role) props.role = role
  return props
}
