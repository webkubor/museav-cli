/**
 * 详情页「相关模型」条的价格视图模型（shared/modelgo_prd#861 前端半）。
 *
 * 相关模型条与广场卡片必须是同一口径：#853 定的「媒体模型主价格 = price_tiers 最高档、
 * 不展示上下文」，卡片和详情规格条都已落地，只剩这条小卡还按文本口径渲染
 * 「¥0 / ¥14 每M + 128K 上下文」（Seedance 同页卡片是 ¥77）。后端 #871 已把卡片同名
 * 字段镜像进 /related，这里做的只是**复用**卡片那条计算链（mediaPrimaryPrice →
 * strikeOriginalPrice），不另写一套取值。
 *
 * 纯函数、不依赖 React；文案（每M / 限时免费 / —）由调用方按 i18n 拼。
 */
import type { CatalogRelatedModel } from '@/types'
import { resolveModelCategory } from '@/pages/models/model-experience-data'
import {
  currencySymbol, firstPositivePrice, mediaPrimaryPrice, strikeOriginalPrice,
} from './model-format'
import { trimPriceZeros } from '@/lib/utils'

export type RelatedPriceView =
  /** 服务端显式限免：调用方渲染「限时免费」 */
  | { kind: 'free'; showContext: boolean }
  /** 未配价：调用方渲染「—」 */
  | { kind: 'none'; showContext: boolean }
  /**
   * 单值主价格（媒体模型的最高档 / 按张价）。text 已含符号与单位（¥77/M、¥0.22/张），
   * strike 为划线原价全文（同样带符号与单位），仅在原价确高于现价时给。
   */
  | { kind: 'primary'; text: string; strike?: string; showContext: boolean }
  /** 文本模型：输入价 / 输出价 两个数，各自带符号；单位文案由调用方接「每M」 */
  | { kind: 'pair'; input: string; output: string; showContext: boolean }
  /** 文本模型只有输入价（输出侧为 0 的脏数据）：只给一个数、不带单位 */
  | { kind: 'single'; text: string; showContext: boolean }

/**
 * 媒体判定复用卡片同一函数（resolveModelCategory：video/image/纯 audio/transcription 归媒体，
 * audio+text 的 omni 对话模型仍归对话）。per_call（按张）也按主价格形态渲染 ——
 * 它本来就是图片生成类，且老后端不下发 output_modalities 时只有这个字段能判。
 * 两者都没有（老契约的普通文本模型）→ 文本形态，与升级前完全一致。
 */
export function isRelatedMediaModel(item: CatalogRelatedModel): boolean {
  if (item.pricing_mode === 'per_call') return true
  if (!item.output_modalities?.length) return false
  return resolveModelCategory({ output_modalities: item.output_modalities }) !== 'dialogue'
}

export function relatedPriceView(item: CatalogRelatedModel, isZh: boolean): RelatedPriceView {
  const isMedia = isRelatedMediaModel(item)
  // 媒体模型不展示「NNNK 上下文」：对视频/图片生成模型无意义（#861 期望 3，与 #858/#859 同口径）
  const showContext = !isMedia && item.context_length > 0
  if (item.is_free) return { kind: 'free', showContext }

  const symbol = currencySymbol(item.currency, isZh)

  if (isMedia) {
    // 与 CatalogCard / ModelDetailPanel 同一条链：pricing 形状按列表卡片的 pricing.* 对齐
    // （input_price ↔ input_per_1m），mediaPrimaryPrice 内部按 per_call → 最高档 → output → input 取值。
    const primary = mediaPrimaryPrice(
      {
        mode: item.pricing_mode,
        per_call_price: item.per_call_price,
        input_per_1m: item.input_price,
        output_per_1m: item.output_price,
      },
      item.price_unit,
      item.price_tiers,
      item.price_unit_en,
    )
    if (!primary.amount) return { kind: 'none', showContext }
    const promo = item.promotion ?? undefined
    // 划线候选顺序与卡片一致：主价那一档自己的折前价优先（矩阵促销时 promotion 的
    // token 侧原价与最高档不是一回事，prd#863 ④），再到 promotion.original_*，
    // 末位 per_call_price 只在促销期参与（它维持折前原价）。守卫拦掉 ≤ 现价的取值。
    const strikeVal = strikeOriginalPrice(
      firstPositivePrice(
        primary.originalAmount,
        promo?.original_output_per_1m, promo?.original_input_per_1m, promo?.original_price,
        promo ? item.per_call_price : undefined,
      ),
      primary.amount,
    )
    return {
      kind: 'primary',
      text: `${symbol}${trimPriceZeros(primary.amount)}${primary.unit}`,
      strike: strikeVal != null ? `${symbol}${trimPriceZeros(String(strikeVal))}${primary.unit}` : undefined,
      showContext,
    }
  }

  // 文本模型：#852 之前的既有形态原样保留（¥输入 / ¥输出 每M；输出为 0 只给输入价）。
  // #871 起 input/output_price 已是折后现价，不再需要前端换算；这条小卡 12px × 180px 的
  // 版面放不下两个划线，原型 .marketplace-related-price 也只有现价，故文本对不划线。
  if (parseFloat(item.output_price) > 0) {
    return {
      kind: 'pair',
      input: `${symbol}${trimPriceZeros(item.input_price)}`,
      output: `${symbol}${trimPriceZeros(item.output_price)}`,
      showContext,
    }
  }
  if (parseFloat(item.input_price) > 0) {
    return { kind: 'single', text: `${symbol}${trimPriceZeros(item.input_price)}`, showContext }
  }
  return { kind: 'none', showContext }
}
