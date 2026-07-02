/**
 * 轻量埋点上报（Umami）
 *
 * 包一层 window.umami.track：脚本未加载（拦截/离线/dev）时静默降级，绝不抛错阻断业务。
 * 约束：禁止上报 API Key / 密码 / Prompt / 邮箱 / 手机号等明文，data 只传枚举或标量。
 *
 * 纯按钮点击优先用 `data-umami-event` 属性（零 JS）；本函数用于需要在成功/失败
 * 回调里主动上报、或要带上下文属性的场景（如 login_success / signup_fail）。
 */
export function trackEvent(
  event: string,
  data?: Record<string, string | number | boolean>,
): void {
  try {
    window.umami?.track(event, data)
  } catch {
    /* 埋点不阻断业务 */
  }
}
