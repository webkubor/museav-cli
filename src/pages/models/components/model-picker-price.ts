/** 选择模型弹窗的价格文案（从 ModelPickerDialog 拆出：react-refresh 规则不允许组件文件
 *  导出普通函数，且拆出后可直接单测）。口径与 dualPriceText / 广场卡片一致。 */
import i18n from '@/i18n'
import { currencySymbol, isZhLang, priceTierUnit, priceUnitSuffix } from '@/features/models/model-format'
import { trimPriceZeros } from '@/lib/utils'
import type { CatalogModelItem } from '@/types'

export function priceLabel(model: CatalogModelItem, kind: 'input' | 'output' = 'input'): string {
  const currency = currencySymbol(model.pricing?.currency, isZhLang())
  const unit = model.price_unit ? priceUnitSuffix(model.price_unit, undefined, model.price_unit_en) : '/1M tokens'
  // 「免费」只认 promotion.free 显式标记；未配价（零价无标记）显示「—」，不算免费
  // ——§9.1，qa#624。isPaidModel 是付费/余额判定（未配价确实不扣费），不能反推成展示上的免费。
  if (model.promotion?.free) return i18n.t('modelsExperience.picker.free')
  if (model.price_tiers?.length) {
    const tier = kind === 'output' ? (model.price_tiers[1] ?? model.price_tiers[0]) : model.price_tiers[0]
    return `${currency}${trimPriceZeros(tier.price)}/${priceTierUnit(tier)}`
  }
  // per_call（按张/按次计价，文生图类）：只有一个单价，单位 /张，不存在输出侧价格。
  // 套 token 那套会显示成「¥0.05/1M tokens」（prd#851 复验时发现的同族漏改；口径与
  // dualPriceText / 广场卡片一致：per_call_price 缺省回落 input_per_1m 镜像）。
  if (model.pricing?.mode === 'per_call') {
    if (kind === 'output') return '—'
    const perCall = model.pricing.per_call_price?.trim() || model.pricing.input_per_1m?.trim()
    if (!(parseFloat(perCall ?? '') > 0)) return '—'
    return `${currency}${trimPriceZeros(perCall ?? '0')}${priceUnitSuffix(model.price_unit, 'per_call', model.price_unit_en)}`
  }
  const amount = kind === 'output' ? model.pricing?.output_per_1m : model.pricing?.input_per_1m
  // 判零数值化：后端零价下发字符串 "0"（truthy），直接判会拼出「¥0/1M tokens」
  if (!(parseFloat(amount ?? '') > 0)) return '—'
  return `${currency}${trimPriceZeros(amount ?? '0')}${unit}`
}

export function cachePriceLabel(model: CatalogModelItem): string {
  const currency = currencySymbol(model.pricing?.currency, isZhLang())
  const cache = model.pricing?.cache_read_per_1m
  // 判零数值化：零价下发字符串 "0"，truthy 判会显示「¥0/1M」（qa#624）
  if (!(parseFloat(cache ?? '') > 0)) return '—'
  return `${currency}${trimPriceZeros(cache)}/1M`
}
