/**
 * 侧边栏底部「运营位」配置（PRD §7.3：轻量、可配置的活动运营位）
 *
 * - 位置：活动中心分组之后、底部设置之前（挂载点在 DashboardSidebar）
 * - 视觉等级低于导航项：小卡、克制的品牌渐变、不抢焦点
 * - enabled=false 时整块不渲染
 * - 文案走 i18n：title/description 存 i18n key（promo.* 子树），组件用 t() 取值
 * - 跳转：route（站内 react-router 路径）或 href（外链，新窗口打开）二选一
 */
export interface PromoConfig {
  /** 开关：关闭时运营位整块不渲染 */
  enabled: boolean
  /** 标题 i18n key（promo.*） */
  titleKey: string
  /** 描述 i18n key（promo.*），可选 */
  descriptionKey?: string
  /** 角标 i18n key（promo.*），可选（如「限时免费」） */
  badgeKey?: string
  /** 站内路由（与 href 二选一） */
  route?: string
  /** 外链（与 route 二选一，新窗口打开） */
  href?: string
}

/**
 * 当前运营位。按 PRD §7.3 与原型 SSOT 默认为「邀请返利计划」，配置驱动
 *（不再写死轮播 + 拉模型目录）。需下线时把 enabled 置 false；换活动时改 titleKey/route 即可。
 */
// prd#581：邀请返利计划暂时下线，需重新上线时把 enabled 置回 true
export const sidebarPromo: PromoConfig = {
  enabled: false,
  titleKey: 'promo.referral.title',
  descriptionKey: 'promo.referral.description',
  route: '/referral',
}
