/**
 * 模型体验 / 对比 / 选择器 / 日志等处共用的展示格式化。
 *
 * 抽这一层的原因（当时是控制台的模型广场卡片与详情页，二者 prd#1272 已拆到官网）：两处必须给出
 * **同一口径**的价格符号、单位后缀、协议标签与能力标签过滤 —— 此前两处各写一份，
 * 详情页用 `formatModelPrice` 打出 `CNY10/M`、卡片打出 `¥ 10/1M tokens`，同一个模型
 * 两个页面两种写法。
 *
 * 促销字段口径（与卡片注释一致）：`promotion` 存在即代表此刻生效（服务端按服务端
 * 时钟判定，接口刻意不下发时间窗口），前端不得按时间自行推算；`original_price` 只是
 * 划线装饰，真实扣费价永远取 `pricing.*`。
 */
import i18n from '@/i18n'
import { formatContextLength, trimPriceZeros } from '@/lib/utils'
import type {
  CatalogPriceTier, CatalogPricingRule, PublicProtocolLabelItem,
} from '@/types'

export type { CatalogPriceTier, CatalogPricingRule }

/** 货币代码 → 符号（后端给的是 CNY/USD 这类代码） */
const CCY_SYMBOL: Record<string, string> = { CNY: '¥', RMB: '¥', USD: '$', EUR: '€', '¥': '¥', $: '$' }

/** 当前界面是否中文——供非组件模块（纯函数/格式化器）判断货币符号兜底，
 *  避免各处自己写 i18n.language 判断（#372） */
export function isZhLang(): boolean {
  return (i18n.language || '').toLowerCase().startsWith('zh')
}

export function currencySymbol(currency: string | undefined, isZh: boolean): string {
  return CCY_SYMBOL[(currency || '').toUpperCase()] || currency || (isZh ? '¥' : '$')
}

/** 计价单位后缀。mode=per_call（按次/按张计价，图片生成类）→ /张（en /image）；
 *  price_unit 为空表示按每 M token 计价（对话模型）。
 *  qa#286 二轮反馈：PRD §9.1 字段口径 price_unit 枚举值是「M、张、秒、万字符等」，
 *  不带数字前缀，兜底要跟这套枚举同形态，不能写死「1M」。 */
export function priceUnitSuffix(
  priceUnit: string | undefined,
  mode?: string | null,
  priceUnitEN?: string | null,
): string {
  if (mode === 'per_call') return isZhLang() ? '/张' : '/image'
  // 英文站取 price_unit_en：单位是后端下发的中文枚举（M/张/秒/万字符），
  // 直接渲染会在英文页上打出「$0.1176 /秒」（shared/modelgo_prd#857 腿 D）。
  // 为空时仍回落中文单位——漏配一个单位不该把价格整格吞掉。
  const unit = (!isZhLang() && priceUnitEN?.trim()) || priceUnit
  return unit ? `/${unit}` : '/M'
}

/** 纯媒体模型（文本输入/输出都没有正价）才用 price_tiers 替换卡片四格；
 *  混合模型（如 gemini 图文）保留输入/输出/上下文，档位只在详情展示。 */
export function catalogCardReplacesGridWithTiers(
  pricing: { input_per_1m?: string; output_per_1m?: string } | null | undefined,
  tiers: CatalogPriceTier[] | undefined | null,
): boolean {
  if (!tiers?.length) return false
  const input = parseFloat(pricing?.input_per_1m ?? '0')
  const output = parseFloat(pricing?.output_per_1m ?? '0')
  return !(input > 0 || output > 0)
}

export function priceTierLabel(tier: CatalogPriceTier, isZh: boolean): string {
  return isZh ? tier.label : (tier.label_en || tier.label)
}

/** 价格梯度维度的渲染顺序（原型 marketplacePricingDimensionOrder 的 token 子集）。
 *  已知维度按此序在前，有专属表头；未知维度**不再整组丢弃**而是降级渲染
 *  （通用表头 + 后端 label），否则后端扩维度时前端不发版就整组消失，
 *  hasPricingGradient 还会连带把规格条的「起」摘掉（prd#864 A3）。 */
export const PRICING_RULE_DIMENSIONS = ['context_length', 'peak_time'] as const
export type PricingRuleDimension = (typeof PRICING_RULE_DIMENSIONS)[number]

export interface PricingRuleGroup {
  dimension: string
  rules: CatalogPricingRule[]
}

/** 按维度分组，组内保持接口下发的档位顺序；未知维度排已知维度后、按首现顺序。 */
export function pricingRuleGroups(rules: CatalogPricingRule[] | undefined | null): PricingRuleGroup[] {
  if (!rules?.length) return []
  const known: PricingRuleGroup[] = PRICING_RULE_DIMENSIONS
    .map((dimension) => ({ dimension, rules: rules.filter((r) => r.dimension === dimension) }))
    .filter((g) => g.rules.length > 0)
  const unknownDims = [...new Set(
    rules.map((r) => r.dimension)
      .filter((d): d is string => !!d && !(PRICING_RULE_DIMENSIONS as readonly string[]).includes(d)),
  )]
  return [
    ...known,
    ...unknownDims.map((dimension) => ({ dimension, rules: rules.filter((r) => r.dimension === dimension) })),
  ]
}

/** 有可渲染的阶梯价 → 一口价挂「起」（原型 marketplacePriceText 的 hasConfirmedGradient）。 */
export function hasPricingGradient(rules: CatalogPricingRule[] | undefined | null): boolean {
  return pricingRuleGroups(rules).length > 0
}

/**
 * 一口价挂「起」（原型 marketplacePriceText：有梯度时规格条/卡片价格后加「起」，
 * 后端已把起始档写进 pricing.*）。中文跟在单位后（¥ 0.8/M 起）、英文改前缀
 * （from $ 0.8/M）；免费/未配价（unit 为空）不挂。
 */
export function withPriceFrom(
  price: { value: string; unit: string },
  hasGradient: boolean,
): { value: string; unit: string } {
  if (!hasGradient || !price.unit) return price
  return isZhLang()
    ? { value: price.value, unit: `${price.unit} 起` }
    : { value: `from ${price.value}`, unit: price.unit }
}

/**
 * 单价文案。金额缺失/为 0 时回落到 freeLabel（调用方决定是「免费」还是「—」）：
 * 「未配价」与「真的免费」是两件事，由调用方按上下文给词，这里不猜。
 *
 * isFree=true（服务端显式限免标记）时直接给 freeLabel，**不看金额** —— test 上
 * 就有 promotion.free=true 而 pricing 仍留着原价的模型（deepseek-v4-flash-free
 * 标限免、价格却写 10/20），按金额判会渲染出「角标说免费、价格说 ¥10」的自相
 * 矛盾页面。限免与否的真源是这个标记，不是金额。
 */
export function priceText(
  amount: number | string | null | undefined,
  symbol: string,
  freeLabel: string,
  unitSuffix: string,
  isFree = false,
): { value: string; unit: string } {
  if (isFree) return { value: freeLabel, unit: '' }
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (amount == null || amount === '' || Number.isNaN(n) || (n ?? 0) <= 0) {
    return { value: freeLabel, unit: '' }
  }
  // 符号与金额之间不留空格：原型全站是「¥4.46/M」紧凑式，「¥ 4.46」对不上
  // （2026-08-25 需求方走查；选择模型弹窗 priceLabel 本就是紧凑式，就此统一）。
  return { value: `${symbol}${trimPriceZeros(amount)}`, unit: unitSuffix }
}

/**
 * 划线原价的有效性守卫。返回 null 表示这条促销数据不足以撑起双价，调用方只留现价。
 *
 * 原型口径（App.tsx:16410 kimi-k2.6：inputPrice 4.46 / originalInputPrice 5.6 /
 * 「限时特惠·8折」）是 **pricing 为折后价、original_price 为折前原价**，划线只在
 * 原价高于现价时成立。线上后端目前不满足这个口径：促销模型的 `original_price` 要么
 * 直接等于现价（deepseek-v4-flash 现价 3、original_price "3.0"，角标标「限时95折」），
 * 要么是 "0"（glm-5.1 / qwen3-max 等 6 个）—— 不加守卫就渲染成「¥3 划掉 ¥3」与
 * 「划掉 ¥0」，反倒像折扣没生效。折后价的真源是 `pricing.*`，前端不得去解析
 * `discount_label` 里的「95折」自行算价 —— 「广场现价按折扣率算折后实收」是后端单
 * shared/modelgo_prd#747 的事（该单当前实现把划线原价定义成「取当前目录 input 价」，
 * 与现价同源必然相等，需求方要的双价差异并未落地，已带证据回单）。
 *
 * isFree（服务端显式限免）时现价即 0，任何正原价都是有效划线，不参与大小比较。
 */
export function strikeOriginalPrice(
  originalPrice: string | number | null | undefined,
  currentPrice: string | number | null | undefined,
  isFree = false,
): number | null {
  const toNum = (v: string | number | null | undefined): number | null => {
    if (v == null || v === '') return null
    const n = typeof v === 'string' ? parseFloat(v) : v
    return Number.isFinite(n) ? n : null
  }
  const original = toNum(originalPrice)
  if (original == null || original <= 0) return null
  if (isFree) return original
  const current = toNum(currentPrice)
  if (current == null || original <= current) return null
  return original
}

/**
 * 协议标签文案 —— **本地兜底**，不是真源。
 *
 * 真源已迁移到 modelgo-model-gateway `pkg/publicprotocols` 的静态注册表，经
 * controller/web-api 透传，运行时通过 usePublicProtocolsStore（GET
 * /catalog/public-protocols）拉取；这里的两张表只在该接口还没上线、请求未完成或
 * 失败时兜底，文案需要跟后端注册表的措辞对齐。
 *
 * 2026-08-26 命名规范改版：由「协议族」文案（OpenAI 兼容/Anthropic 兼容）换成
 * 「厂商 + 能力」的英文专有名词命名（OpenAI Chat Completions、Google Gemini
 * 等），闭集同时从 7 值扩到 12 值（openai_chat 改名 openai_chat_completions，
 * openai_audio 拆成 openai_speech/openai_transcriptions，新增 openai_rerank 与
 * google_gemini/google_imagen/google_video 三个原生透传条目——仅信息展示，不参与
 * defaultPublicProtocols 的自动派生，需运营手动打标）。厂商+能力类值中英文同名，
 * 只有 other 保留中英双语。
 * 旧 3 值（openai/anthropic/other，过渡期未重新打标的模型仍会下发）维持原文案。
 */
export const PROTOCOL_LABEL_ZH: Record<string, string> = {
  openai: 'OpenAI 兼容', anthropic: 'Anthropic 兼容', other: '其他（异步任务类，如图像/音视频）',
  openai_chat_completions: 'OpenAI Chat Completions',
  openai_responses: 'OpenAI Responses',
  openai_completions: 'OpenAI Completions',
  openai_embeddings: 'OpenAI Embeddings',
  openai_embeddings_multimodal: 'OpenAI Multimodal Embeddings',
  openai_rerank: 'OpenAI Rerank',
  openai_images: 'OpenAI Images',
  openai_images_edits: 'OpenAI Image Edits',
  openai_speech: 'OpenAI Speech',
  openai_transcriptions: 'OpenAI Transcriptions',
  openai_translations: 'OpenAI Translations',
  anthropic_messages: 'Anthropic Messages',
  openai_video: 'OpenAI Video',
  content_generation: 'Content Generation',
  gemini_generate_content: 'Gemini Generate Content',
  gemini_predict: 'Gemini Predict',
  gemini_predict_long_running: 'Gemini Predict Long Running',
  gemini_files: 'Gemini Files',
  ark_batch_chat_completions: 'Ark Batch Chat Completions',
  ark_context_create: 'Ark Context Create',
  ark_context_chat_completions: 'Ark Context Chat Completions',
  ark_tokenization: 'Ark Tokenization',
  kling_text2video: 'Kling Text to Video',
  kling_image2video: 'Kling Image to Video',
  kling_multi_image2video: 'Kling Multi-Image to Video',
  kling_omni_video: 'Kling Omni Video',
  kling_video_extend: 'Kling Video Extend',
  kling_motion_control: 'Kling Motion Control',
  kling_avatar_image2video: 'Kling Avatar Image to Video',
  kling_multi_elements: 'Kling Multi Elements',
  kling_advanced_lip_sync: 'Kling Advanced Lip Sync',
  kling_text_to_audio: 'Kling Text to Audio',
  kling_video_to_audio: 'Kling Video to Audio',
  kling_tts: 'Kling TTS',
  hailuo_video_generation: 'Hailuo Video Generation',
  vidu_text2video: 'Vidu Text to Video',
  vidu_img2video: 'Vidu Image to Video',
  vidu_start_end2video: 'Vidu Start-End Frame to Video',
  vidu_reference2video: 'Vidu Reference to Video',
}
export const PROTOCOL_LABEL_EN: Record<string, string> = {
  openai: 'OpenAI compatible', anthropic: 'Anthropic compatible', other: 'Other',
  openai_chat_completions: 'OpenAI Chat Completions',
  openai_responses: 'OpenAI Responses',
  openai_completions: 'OpenAI Completions',
  openai_embeddings: 'OpenAI Embeddings',
  openai_embeddings_multimodal: 'OpenAI Multimodal Embeddings',
  openai_rerank: 'OpenAI Rerank',
  openai_images: 'OpenAI Images',
  openai_images_edits: 'OpenAI Image Edits',
  openai_speech: 'OpenAI Speech',
  openai_transcriptions: 'OpenAI Transcriptions',
  openai_translations: 'OpenAI Translations',
  anthropic_messages: 'Anthropic Messages',
  openai_video: 'OpenAI Video',
  content_generation: 'Content Generation',
  gemini_generate_content: 'Gemini Generate Content',
  gemini_predict: 'Gemini Predict',
  gemini_predict_long_running: 'Gemini Predict Long Running',
  gemini_files: 'Gemini Files',
  ark_batch_chat_completions: 'Ark Batch Chat Completions',
  ark_context_create: 'Ark Context Create',
  ark_context_chat_completions: 'Ark Context Chat Completions',
  ark_tokenization: 'Ark Tokenization',
  kling_text2video: 'Kling Text to Video',
  kling_image2video: 'Kling Image to Video',
  kling_multi_image2video: 'Kling Multi-Image to Video',
  kling_omni_video: 'Kling Omni Video',
  kling_video_extend: 'Kling Video Extend',
  kling_motion_control: 'Kling Motion Control',
  kling_avatar_image2video: 'Kling Avatar Image to Video',
  kling_multi_elements: 'Kling Multi Elements',
  kling_advanced_lip_sync: 'Kling Advanced Lip Sync',
  kling_text_to_audio: 'Kling Text to Audio',
  kling_video_to_audio: 'Kling Video to Audio',
  kling_tts: 'Kling TTS',
  hailuo_video_generation: 'Hailuo Video Generation',
  vidu_text2video: 'Vidu Text to Video',
  vidu_img2video: 'Vidu Image to Video',
  vidu_start_end2video: 'Vidu Start-End Frame to Video',
  vidu_reference2video: 'Vidu Reference to Video',
}

/**
 * labelMap 缺省时退回本地兜底表；传入时优先用它（调用方一般传
 * mergeProtocolLabels(PROTOCOL_LABEL_ZH/EN, usePublicProtocolsStore 的 items, ...)
 * 算出的合并结果，让展示文案跟着 /catalog/public-protocols 的最新下发走）。
 */
export function protocolLabel(protocol: string, isZh: boolean, labelMap?: Record<string, string>): string {
  const map = labelMap ?? (isZh ? PROTOCOL_LABEL_ZH : PROTOCOL_LABEL_EN)
  return map[protocol] ?? protocol
}

/**
 * 用 /catalog/public-protocols 下发的目录覆盖本地兜底表。只覆盖 base 里已声明的
 * code——未知/尚未收录的远端 code 不会凭空长出新条目，避免和 sortProtocols /
 * 卡片 CSS（.mg-proto.is-<code>）等按固定值集合工作的逻辑对不上。items 为
 * null/空（接口未完成、失败、或依赖的后端仓库还没合并）时原样返回 base，即「不
 * 拿到新数据就完全维持现状」，这是本次改造要的非阻塞降级行为。
 */
export function mergeProtocolLabels<T extends string>(
  base: Record<T, string>,
  items: Pick<PublicProtocolLabelItem, 'code' | 'label' | 'label_en'>[] | null | undefined,
  field: 'label' | 'label_en',
): Record<T, string> {
  if (!items?.length) return base
  let merged: Record<T, string> | null = null
  for (const item of items) {
    const code = item.code as T
    const value = item[field]
    if (code in base && value && base[code] !== value) {
      if (!merged) merged = { ...base }
      merged[code] = value
    }
  }
  return merged ?? base
}

/**
 * 协议展示统一顺序（QA：模型广场「端点兼容」顺序不一致）：openai → anthropic → other。
 * 后端下发的 protocols 数组顺序不保证，前端任何展示（卡片 chips / 详情标签 / 对比行 /
 * API 接入 Tab）前一律过这里排序；与侧栏筛选固定顺序（CatalogSidebar）对齐。
 * 未知值排最后且保持相对稳定（sort 在 V8 里是稳定排序）。
 * 源头治理单：qa/ai-quality-platform#685（管理后台提交侧校验归一，OpenAI 恒在前）。
 */
const PROTOCOL_ORDER = [
  'openai_chat_completions', 'openai_responses', 'openai_completions', 'openai_embeddings',
  'openai_embeddings_multimodal', 'openai_rerank', 'openai_images', 'openai_images_edits',
  'openai_speech', 'openai_transcriptions', 'openai_translations', 'anthropic_messages',
  'openai_video', 'content_generation', 'dashscope_realtime', 'gemini_generate_content',
  'gemini_predict', 'gemini_predict_long_running', 'gemini_files', 'ark_batch_chat_completions',
  'ark_context_create', 'ark_context_chat_completions', 'ark_tokenization', 'kling_text2video',
  'kling_image2video', 'kling_multi_image2video', 'kling_omni_video', 'kling_video_extend',
  'kling_motion_control', 'kling_avatar_image2video', 'kling_multi_elements', 'kling_advanced_lip_sync',
  'kling_text_to_audio', 'kling_video_to_audio', 'kling_tts', 'hailuo_video_generation',
  'vidu_text2video', 'vidu_img2video', 'vidu_start_end2video', 'vidu_reference2video',
  'openai', 'anthropic', 'other', 'native',
]
export function sortProtocols<T extends string>(protocols: readonly T[]): T[] {
  const rank = (p: string) => {
    const i = PROTOCOL_ORDER.indexOf(p)
    return i === -1 ? PROTOCOL_ORDER.length : i
  }
  return [...protocols].sort((a, b) => rank(a) - rank(b))
}

export const MODALITY_CODES = ['text', 'image', 'audio', 'video']

const MOD_LABEL: Record<string, string> = { text: '文本', image: '图像', audio: '音频', video: '视频' }
const MOD_LABEL_EN: Record<string, string> = { text: 'text', image: 'image', audio: 'audio', video: 'video' }

/**
 * description/tagline 都为空时，用真实字段拼一句事实性简介（不杜撰能力）。
 * 原本卡片与详情页共用这份口径（qa#286：部分卡片因为 tagline 为空，简介行直接不渲染）；
 * 详情页 prd#1272 已拆到官网，现在经 cardSummary 给体验选型等卡片位用。
 */
export function autoSummary(
  model: { modalities?: string[]; context_length?: number; promotion?: { free?: boolean } },
  vendor: string,
  isZh: boolean,
): string {
  const mods = (model.modalities ?? []).filter((m) => m in MOD_LABEL)
  const modText = mods.length ? mods.map((m) => (isZh ? MOD_LABEL[m] : MOD_LABEL_EN[m])).join(isZh ? '/' : ', ') : (isZh ? '通用' : 'general')
  const ctx = model.context_length ? formatContextLength(model.context_length) : ''
  const free = Boolean(model.promotion?.free)
  if (isZh) {
    return `${vendor ? vendor + ' 出品的' : ''}${modText}模型${ctx ? `，${ctx} 上下文窗口` : ''}${free ? '，当前免费可用' : ''}。详细简介待补充。`
  }
  return `${vendor ? vendor + ' ' : ''}${modText} model${ctx ? `, ${ctx} context window` : ''}${free ? ', currently free' : ''}. Full description coming soon.`
}

/** cardSummary 的入参：autoSummary 那几个字段 + 两个文案字段。 */
type SummarySource = Parameters<typeof autoSummary>[0] & { tagline?: string; description?: string }

/**
 * 卡片位（体验选型弹窗等；原模型广场网格 prd#1272 已拆到官网）的简介取值：
 * **tagline → description → autoSummary**。
 *
 * tagline 是 PRD §9.1 的「卡片短描述」，所以卡片仍然优先它；但 tagline 缺失时必须回落
 * 长描述 description，不能直接跳到合成兜底句。
 *
 * shared/modelgo_prd#820：卡片此前只读 tagline（`model.tagline?.trim() || autoSummary(...)`），
 * 而目录接口至今**一个模型都没有 tagline** —— cn 生产 43/43 空、test 53 个全空；description
 * 反而 cn 生产 43/43 都有正经文案。于是广场每张卡都写「…详细简介待补充。」，点进详情又是
 * 真描述，提单人看到的「广场与详情描述不一致」就是这个。回落到 description 后，43/43 张卡
 * 立刻与详情同文，不必等运营逐个补 tagline（补了则自动优先 tagline，两条路不冲突）。
 *
 * 卡片侧长度由 CSS `-webkit-line-clamp: 2` 收口（PRD §7.3「简介最多两行」）：线上 description
 * 最长 120 字符，两行放得下，不在 JS 里截断以免把中英文都切坏。
 */
export function cardSummary(model: SummarySource, vendor: string, isZh: boolean): string {
  return model.tagline?.trim() || model.description?.trim() || autoSummary(model, vendor, isZh)
}

/**
 * 模型副标题（原厂名）的唯一取值规则：provider（对外厂商名，见 types/catalog.ts 注释
 * 「替代暴露上游的 vendor」）优先，退 vendor，都缺再退 fallback（默认平台名 ModelGo）。
 *
 * 此前同一规则散在 8 处、三种写法（provider||vendor / vendor||provider / vendor||'ModelGo'），
 * shared/modelgo_prd#341 收敛到这一个函数。注意：**禁止从 model_id 猜厂商名兜底** ——
 * 线上部分模型（glm-5.2 / kimi-k2.7-code 等）副标题显示成模型 ID，是后端把
 * vendor/provider 字段本身存成了模型 ID（test 环境同类样本：deepseek-v4-flash-free 的
 * vendor === model_id），属后端数据问题，前端不造假掩盖。
 */
export function modelVendorLabel(
  model: { vendor?: string | null; provider?: string | null },
  fallback = 'ModelGo',
): string {
  return (model.provider ?? '').trim() || (model.vendor ?? '').trim() || fallback
}
