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
import { trimPriceZeros } from '@/lib/utils'

/** 货币代码 → 符号（后端给的是 CNY/USD 这类代码） */
const CCY_SYMBOL: Record<string, string> = { CNY: '¥', RMB: '¥', USD: '$', EUR: '€', '¥': '¥', $: '$' }

export function currencySymbol(currency: string | undefined, isZh: boolean): string {
  return CCY_SYMBOL[(currency || '').toUpperCase()] || currency || (isZh ? '¥' : '$')
}

/** 计价单位后缀。price_unit 为空表示按每 1M token 计价（对话模型）。 */
export function priceUnitSuffix(priceUnit: string | undefined): string {
  return priceUnit ? `/${priceUnit}` : '/1M tokens'
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
