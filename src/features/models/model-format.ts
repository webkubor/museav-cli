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
import type { CatalogPriceTier } from '@/types'

export type { CatalogPriceTier }

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
  return { value: `${symbol} ${trimPriceZeros(amount)}`, unit: unitSuffix }
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
