/**
 * 模型图标厂牌选择。
 * 路由：所有使用 ModelIcon 的模型展示页。
 * API：GET /catalog/models 返回 provider（公开厂牌）与 vendor（内部上游）。
 */

/** 图标解析采用公开厂牌；没有 provider 时才回退内部 vendor。 */
export function modelIconVendor(model: { provider?: string | null; vendor?: string | null }): string | undefined {
  return model.provider?.trim() || model.vendor?.trim() || undefined
}
