/**
 * 模型目录/详情共用的展示格式化。
 *
 * 抽这一层的原因：卡片（catalog/CatalogCard）与详情页（ModelDetailPanel）必须给出
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
import type { CatalogPriceTier, CatalogPricingRule } from '@/types'

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
export function priceUnitSuffix(priceUnit: string | undefined, mode?: string | null): string {
  if (mode === 'per_call') return isZhLang() ? '/张' : '/image'
  return priceUnit ? `/${priceUnit}` : '/M'
}

const CARD_PRICE_TIER_LIMIT = 4

/** 卡片最多展示 4 档；详情页用原数组。 */
export function priceTiersForCard(tiers: CatalogPriceTier[] | undefined | null): CatalogPriceTier[] {
  if (!tiers?.length) return []
  return tiers.slice(0, CARD_PRICE_TIER_LIMIT)
}

/**
 * 媒体模型（图片/视频/音频产物）的「主价格」（需求方 2026-08-25 对齐原型
 * marketplacePrimaryPriceText，App.tsx:4199）：媒体卡片/详情条只摆一个主价，
 * 不再铺输入/输出/缓存四格或整张档位矩阵（完整档位进详情「价格梯度」表）。
 *
 * 取值顺序：per_call 的每张价 → price_tiers 里**价格最高的一档**（需求方
 * 2026-08-25：主价格取最高档。媒体模型的 price_tiers 才是媒体产物价，pricing.*
 * 是文本 token 侧分项价 —— gemini-3.1-flash-lite-image 图片产出 ¥204/M、文本
 * output 仅 ¥10.2/M，先读 pricing 会把主价格错标成便宜一个量级的文本价）→
 * pricing 的 output||input（Seedance 这类按 token 计价、无矩阵的视频模型，
 * ¥46/M）→ 未配价 undefined。
 * unit 是随金额来源配对的后缀（/张、/M、/秒），unitName 是给「计费单位」格的
 * 裸单位名（张、M、秒）。
 */
export function mediaPrimaryPrice(
  pricing: { mode?: string; per_call_price?: string; input_per_1m?: string; output_per_1m?: string } | undefined,
  priceUnit: string | undefined,
  tiers: CatalogPriceTier[] | undefined | null,
): { amount: string | undefined; unit: string; unitName: string } {
  const suffix = priceUnitSuffix(priceUnit, pricing?.mode)
  if (pricing?.mode === 'per_call') {
    // per_call 的每张价镜像在 input_per_1m（#851 契约），unitName 从后缀剥出
    // （zh 张 / en image，priceUnitSuffix 已本地化）。
    // 促销期后端把折后现价写进 input_per_1m、per_call_price 维持折前原价
    // （2026-08-25 生产实测：seedream-4.0 0.13/0.2、4.5 0.1875/0.25、
    // 5.0-lite 0.165/0.22），故现价取两者中较低的正值；非促销期两者相等，不受影响。
    const candidates = [pricing.per_call_price?.trim(), pricing.input_per_1m?.trim()]
      .filter((v): v is string => !!v && parseFloat(v) > 0)
    const amount = candidates.length
      ? candidates.reduce((min, v) => (parseFloat(v) < parseFloat(min) ? v : min))
      : undefined
    return { amount, unit: suffix, unitName: suffix.slice(1) }
  }
  const top = (tiers ?? []).reduce<CatalogPriceTier | undefined>(
    (max, tier) => (parseFloat(tier.price) > parseFloat(max?.price ?? '0') ? tier : max),
    undefined,
  )
  if (top) {
    return { amount: top.price, unit: `/${top.unit}`, unitName: top.unit }
  }
  if (parseFloat(pricing?.output_per_1m ?? '') > 0) {
    return { amount: pricing?.output_per_1m, unit: suffix, unitName: priceUnit || 'M' }
  }
  if (parseFloat(pricing?.input_per_1m ?? '') > 0) {
    return { amount: pricing?.input_per_1m, unit: suffix, unitName: priceUnit || 'M' }
  }
  return { amount: undefined, unit: suffix, unitName: priceUnit || 'M' }
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
 * 梯度区间/时段文案：label 优先（英文界面 label_en 回落 label），**不要前端自己拼**
 * （#800 契约原话）。label 全缺时才按维度兜底：context_length 用 min/max 拼
 * 「128K–256K / 256K 以上」，peak_time 用 start_time–end_time。
 */
export function pricingRuleLabel(rule: CatalogPricingRule, isZh: boolean): string {
  const label = isZh ? rule.label : (rule.label_en || rule.label)
  if (label) return label
  if (rule.dimension === 'peak_time') {
    return rule.start_time && rule.end_time ? `${rule.start_time}–${rule.end_time}` : '—'
  }
  if (rule.min != null || rule.max != null) {
    const min = formatContextLength(rule.min ?? 0)
    if (rule.max == null) return isZh ? `${min} 以上` : `${min}+`
    return `${min}–${formatContextLength(rule.max)}`
  }
  return '—'
}

/**
 * 梯度表单元格价格。金额格式与规格条同口径（货币符号 + trimPriceZeros + /unit）；
 * mode=multiplier（倍率）没有绝对价时展示 ×倍率；两者都缺回落「—」（未配价 ≠ 免费，
 * 限免口径只认 promotion.free，不从阶梯价推断）。
 */
export function pricingRulePriceText(
  rule: CatalogPricingRule,
  kind: 'input' | 'output' | 'cache_read',
  symbol: string,
): string {
  const raw = kind === 'input' ? rule.input_per_1m : kind === 'output' ? rule.output_per_1m : rule.cache_read_per_1m
  if (raw != null && raw !== '' && !Number.isNaN(parseFloat(raw))) {
    return `${symbol}${trimPriceZeros(raw)}/${rule.unit || 'M'}`
  }
  if (rule.mode === 'multiplier' && rule.rate) return `×${trimPriceZeros(rule.rate)}`
  return '—'
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
 * 从若干候选价里取第一个正数（媒体主价格的划线原价选值用）。
 * 后端零值下发字符串 "0" 而非省略键：per_call（按张）模型的 original_output_per_1m
 * 恒为 "0"，折前价镜像在 original_input_per_1m —— 用 `??` 链会被 "0" 截住，
 * 折前价永远取不到（doubao-seedream-5.0-pro「限时71折」复查时发现）。
 */
export function firstPositivePrice(
  ...values: Array<string | number | null | undefined>
): string | number | undefined {
  for (const v of values) {
    const n = typeof v === 'string' ? parseFloat(v) : v
    if (n != null && Number.isFinite(n) && n > 0) return v ?? undefined
  }
  return undefined
}

/** 协议标签文案照原型：带「兼容」后缀，明确这是入站协议兼容性而非厂商归属。 */
export const PROTOCOL_LABEL_ZH: Record<string, string> = {
  openai: 'OpenAI 兼容', anthropic: 'Anthropic 兼容', other: '其他协议',
}
export const PROTOCOL_LABEL_EN: Record<string, string> = {
  openai: 'OpenAI compatible', anthropic: 'Anthropic compatible', other: 'Other',
}

export function protocolLabel(protocol: string, isZh: boolean): string {
  return (isZh ? PROTOCOL_LABEL_ZH : PROTOCOL_LABEL_EN)[protocol] ?? protocol
}

/**
 * 协议展示统一顺序（QA：模型广场「端点兼容」顺序不一致）：openai → anthropic → other。
 * 后端下发的 protocols 数组顺序不保证，前端任何展示（卡片 chips / 详情标签 / 对比行 /
 * API 接入 Tab）前一律过这里排序；与侧栏筛选固定顺序（CatalogSidebar）对齐。
 * 未知值排最后且保持相对稳定（sort 在 V8 里是稳定排序）。
 * 源头治理单：qa/ai-quality-platform#685（管理后台提交侧校验归一，OpenAI 恒在前）。
 */
const PROTOCOL_ORDER = ['openai', 'anthropic', 'other', 'native']
export function sortProtocols<T extends string>(protocols: readonly T[]): T[] {
  const rank = (p: string) => {
    const i = PROTOCOL_ORDER.indexOf(p)
    return i === -1 ? PROTOCOL_ORDER.length : i
  }
  return [...protocols].sort((a, b) => rank(a) - rank(b))
}

export const MODALITY_CODES = ['text', 'image', 'audio', 'video']

/**
 * 内部标签黑名单。**目标是删掉它** —— 能力标签应由后端 model_tags 的 capability
 * 分组决定（facets 已按该分组下发）。等各环境能力字典 seed 完成、tags 里不再混入
 * 这些值之后即可移除。
 */
const TAG_DENYLIST = new Set(['modelgo_tool', 'test', 'free', 'internal', 'tool'])

/**
 * 能力标签：从 tags 里剔掉模态码、内部标记与厂商同名项。
 * limit 默认不截断（详情页有横向空间；卡片自己传 3）。
 */
export function pickCapabilities(
  tags: string[] | undefined,
  vendorish: (string | undefined)[],
  limit?: number,
): string[] {
  const deny = new Set(vendorish.filter(Boolean).map((s) => String(s).toLowerCase()))
  const list = (tags ?? [])
    .filter((tg) => !MODALITY_CODES.includes(tg))
    .filter((tg) => !TAG_DENYLIST.has(tg.toLowerCase()) && !deny.has(tg.toLowerCase()))
  return limit ? list.slice(0, limit) : list
}

const MOD_LABEL: Record<string, string> = { text: '文本', image: '图像', audio: '音频', video: '视频' }
const MOD_LABEL_EN: Record<string, string> = { text: 'text', image: 'image', audio: 'audio', video: 'video' }

/**
 * description/tagline 都为空时，用真实字段拼一句事实性简介（不杜撰能力）。
 * 卡片（CatalogModelItem）与详情页（CatalogModelDetail）共用同一份口径
 * （qa#286：部分模型卡片因为 tagline 为空，简介行直接不渲染，跟其他卡片比矮一截；
 * 详情页早就有这层兜底，卡片列表漏了，这里补齐让两边一致）。
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

/** cardSummary / detailSummary 的入参：autoSummary 那几个字段 + 两个文案字段。 */
type SummarySource = Parameters<typeof autoSummary>[0] & { tagline?: string; description?: string }

/**
 * 卡片位（模型广场网格、体验选型弹窗）的简介取值：
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
 * 详情页（Hero 简介）的取值：**description → tagline → autoSummary**。
 *
 * 与 cardSummary 只差前两项的优先级 —— 详情位要的是长描述，卡片位要的是短描述，
 * 这是 PRD §9.1 对两个字段的定义（「卡片短描述与详情简介」），不是漂移。两处口径放在
 * 一起是为了改一处时能立刻看见另一处的约定。
 */
export function detailSummary(model: SummarySource, vendor: string, isZh: boolean): string {
  return model.description?.trim() || model.tagline?.trim() || autoSummary(model, vendor, isZh)
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

/**
 * 厂商名兜底。详情接口（GET /catalog/models/:id）**不下发 vendor/provider**，只有
 * 列表接口有 —— 详情页 Hero 因此长期缺厂商名（原型 App.tsx:5051 有）。后端补字段
 * 前，用 model_id 的 `vendor/model` 前缀兜底；已开后端单见 detail/index.tsx 注释。
 */
export function vendorFromModelId(modelId: string | undefined): string {
  if (!modelId || !modelId.includes('/')) return ''
  const head = modelId.split('/')[0].trim()
  return head.length > 0 ? head : ''
}
