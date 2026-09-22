/**
 * Global 登录页折扣橱窗的数据口径 —— 来源是模型广场那一份公开目录（`GET /catalog/models`），
 * 不再是页面里写死的 mock 列表（prd#1092）。
 *
 * 三条硬口径：
 *
 * 1. **折扣率前端自己按价格算，不用后端的 `discount_label`。** 后端下发的是中文营销口径
 *    （「限时95折」＝便宜 5%），而它的 `discount_label_en` 直译成 `95% off`（便宜 95%）——
 *    含义整整差一个数量级，英文站照搬就是对外报错价。价格是唯一可信的真源。
 * 2. **沿用 `strikeOriginalPrice` 的守卫**：线上存在 `original_price` 等于现价、或为 "0"
 *    的促销数据（见 model-format.ts 的长注释）。撑不起双价的条目**直接不展示**，
 *    而不是渲染出「省 0%」这种反效果的行。
 * 3. **没有合格数据就不渲染整个橱窗**（同 #932 档位阶梯口径：宁可不展示，也不编造）。
 */
import { strikeOriginalPrice } from '@/features/models/model-format'
import type { CatalogModelItem } from '@/types'

export interface DiscountShowcaseItem {
  /** 后端模型标识，列表 key 用 */
  modelId: string
  /** 展示名 */
  name: string
  /** 图标解析用的上游标识（对外文案用 providerLabel） */
  vendor?: string
  /** 对外展示的厂商名 */
  providerLabel: string
  /** 现价（已含单位后缀，如 `$0.28/M`）；撑不出价格时为空串 */
  price: string
  /** 折扣百分比整数，40 表示便宜 40% */
  discount: number
}

/** 展示条数：橱窗是滚动列表，取够一屏循环即可，不需要整页目录。 */
export const DISCOUNT_SHOWCASE_LIMIT = 12

interface BuildOptions {
  /** 价格格式化（调用方注入，复用广场那套 currencySymbol / priceUnitSuffix 口径） */
  formatPrice: (model: CatalogModelItem) => string
}

/**
 * 目录列表 → 橱窗条目：只保留双价成立的促销模型，按折扣力度倒序。
 * 限免模型（promotion.free）不进橱窗 —— 它的"折扣"是 100%，会把真实折扣行全挤下去，
 * 而且免费额度另有限频规则，放在"省多少钱"的列表里会误导。
 */
export function buildDiscountShowcase(
  models: CatalogModelItem[] | undefined,
  { formatPrice }: BuildOptions,
): DiscountShowcaseItem[] {
  if (!models?.length) return []

  const rows: DiscountShowcaseItem[] = []
  for (const model of models) {
    const promotion = model.promotion
    if (!promotion || promotion.free) continue

    const current = Number.parseFloat(model.pricing?.input_per_1m ?? '')
    const original = strikeOriginalPrice(
      promotion.original_input_per_1m ?? promotion.original_price,
      model.pricing?.input_per_1m,
    )
    if (original == null || !Number.isFinite(current) || current <= 0) continue

    const discount = Math.round((1 - current / original) * 100)
    if (discount <= 0) continue

    rows.push({
      modelId: model.model_id,
      name: model.display_name || model.model_id,
      vendor: model.vendor,
      providerLabel: model.provider || model.vendor || '',
      price: formatPrice(model),
      discount,
    })
  }

  return rows
    .sort((a, b) => b.discount - a.discount)
    .slice(0, DISCOUNT_SHOWCASE_LIMIT)
}

/** 橱窗副标题用的「最高省多少」——空列表返回 0，由调用方决定不渲染。 */
export function maxDiscount(items: DiscountShowcaseItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.discount), 0)
}
