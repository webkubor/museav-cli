/**
 * 模型卡片（等高网格卡）。
 *
 * 信息顺序：图标 + 角标 → 名称/厂商/API ID → 简介 → 输入→输出模态流 → API 协议 →
 * 能力标签 → 价格规格（贴底）→ 操作。
 *
 * 硬约束：卡片等高、价格贴底 —— 简介长度不同不能把价格行推得高低不齐（靠 flex + margin-top:auto）。
 *
 * qa#286 二轮反馈：收藏按钮已删除——PRD §4.2「非目标」原文明确排除「收藏或订阅」，
 * 之前当"既定决策保持现状"留着是误判，飞书 PRD 才是真源。
 *
 * 促销双价：original_price 是划线装饰，pricing 里的价格才是真实扣费价。promotion
 * 字段**存在即代表此刻生效**（服务端用服务端时钟判定，接口刻意不下发时间窗口），
 * 前端不得按时间自行推算。
 *
 * 容器用 .mg-tile/.mg-tile-hover（DESIGN.md 的卡片语言，走 --radius-md 与
 * --mg-card-* token），不再手写 border/shadow/裸数值圆角；主操作用
 * <Button variant="brand">。
 */
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LuImage, LuMic, LuVideo, LuArrowRight,
  LuBrain, LuMapPin, LuGlobe, LuZap, LuWrench, LuTag,
  LuColumns2, LuSparkles,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { CopyButton } from '@/components/ui/CopyButton'
import { Button } from '@/components/ui/Button'
import { formatContextLength, prettyModelName, trimPriceZeros } from '@/lib/utils'
import {
  MODALITY_CODES, currencySymbol, priceUnitSuffix, priceText, protocolLabel, pickCapabilities, cardSummary, modelVendorLabel,
  strikeOriginalPrice,
  priceTiersForCard, priceTierLabel, catalogCardReplacesGridWithTiers, hasPricingGradient, withPriceFrom,
} from '@/features/models/model-format'
import { hasPlaygroundExperience } from '../model-experience-data'
import type { CatalogModelItem } from '@/types'

const MODALITY_ICON: Record<string, IconType> = { image: LuImage, audio: LuMic, video: LuVideo }

/** 输入→输出模态流的单个标记。原型文本模态用字母「T」，不是图标（qa#286）；
 *  其余模态（图像/音频/视频）仍用图标区分。 */
function ModalityMark({ m, title }: { m: string; title: string }) {
  if (m === 'text') return <span className="mg-mcard-flow-text" title={title}>T</span>
  const Icon = MODALITY_ICON[m]
  return Icon ? <Icon size={12} title={title} /> : null
}

function tagIcon(tag: string): IconType {
  const t = tag.toLowerCase()
  if (t.includes('reason') || tag.includes('推理')) return LuBrain
  if (t.includes('region') || tag.includes('区域') || tag.includes('境内')) return LuMapPin
  if (t.includes('cache') || tag.includes('缓存')) return LuZap
  if (t.includes('search') || tag.includes('搜索') || tag.includes('联网')) return LuGlobe
  if (t.includes('function') || t.includes('tool') || tag.includes('函数') || tag.includes('工具')) return LuWrench
  return LuTag
}

interface Props {
  model: CatalogModelItem
  isZh: boolean
  onTry: (modelId: string, e: React.MouseEvent) => void
  onCompare?: (e: React.MouseEvent) => void
  canCompare: boolean
  /** 点击协议标签反查筛选；不传则标签不可点。 */
  onPickProtocol?: (protocol: string) => void
  /** 点击能力标签反查筛选。 */
  onPickCapability?: (tag: string) => void
  /** 卡片在当前列表中的位置（埋点 marketplace_card_opened 的 list_position） */
  listPosition: number
  /** 埋点：marketplace_card_opened（点击卡片主体进入详情，非 API请求/去体验/对比按钮） */
  onCardOpened?: (model: CatalogModelItem, listPosition: number) => void
  /** 埋点：marketplace_model_id_copied（source='card'） */
  onModelIdCopied?: (model: CatalogModelItem) => void
  /** 埋点：marketplace_api_request_clicked（点击「API 文档」按钮，进入详情并滚动到 API 接入区） */
  onApiRequest?: (model: CatalogModelItem) => void
}

export function CatalogCard({
  model, isZh, onTry, onCompare, canCompare, onPickProtocol, onPickCapability,
  listPosition, onCardOpened, onModelIdCopied, onApiRequest,
}: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  const detailHref = `/models/${model.slug || model.id}`
  const symbol = currencySymbol(model.pricing?.currency, isZh)
  const ctxValue = (model.context_length ?? 0) > 0 ? formatContextLength(model.context_length) : '—'
  const name = prettyModelName(model.display_name, model.model_id)
  const provider = modelVendorLabel(model, '') || undefined
  const promo = model.promotion
  // free 只认服务端的显式限免标记，不从「价格为 0」推断 —— 未配价的模型也是 0。
  const isFree = Boolean(promo?.free)

  // per_call（按张/按次计价，图片生成类）模型：主价取 per_call_price、单位 /张，
  // 无输入/输出 token 拆分与缓存读取，后两者回落「—」。
  const isPerCall = model.pricing?.mode === 'per_call'
  const unitSuffix = priceUnitSuffix(model.price_unit, model.pricing?.mode)
  const freeLabel = t('modelsCatalog.card.free')
  // isFree 优先于金额：限免标记与 pricing 打架时（test 上确有这种数据）以标记为准，
  // 否则卡片会「角标写限时免费、价格写 ¥10」自相矛盾。
  // 未配价（金额为 0/缺省且无限免标记）一律回落「—」而非「免费」——§9.1 价格为 0
  // 但未标 free 的仍按付费处理，写「免费」是误导（qa#624，与详情面板同口径）。
  // 阶梯价（#800）：列表接口与详情同一份 pricing_rules。卡片不摆梯度表，只在
  // 输入/输出价后面加「起」提示这是起始档（原型 marketplacePriceText 口径）。
  const hasGradient = hasPricingGradient(model.pricing_rules)
  const input = withPriceFrom(priceText(isPerCall ? model.pricing?.per_call_price : model.pricing?.input_per_1m, symbol, isFree ? freeLabel : '—', unitSuffix, isFree), hasGradient)
  const output = withPriceFrom(priceText(isPerCall ? undefined : model.pricing?.output_per_1m, symbol, isFree && !isPerCall ? freeLabel : '—', unitSuffix, isFree), hasGradient)
  const cacheRead = priceText(isPerCall ? undefined : model.pricing?.cache_read_per_1m, symbol, isFree ? freeLabel : '—', unitSuffix, isFree)
  const cardTiers = priceTiersForCard(model.price_tiers)
  const strikeInputVal = strikeOriginalPrice(
    promo?.original_input_per_1m ?? promo?.original_price,
    isPerCall ? model.pricing?.per_call_price : model.pricing?.input_per_1m,
    isFree,
  )
  const strikeOutputVal = strikeOriginalPrice(
    promo?.original_output_per_1m,
    model.pricing?.output_per_1m,
    isFree,
  )
  const useTierGrid = catalogCardReplacesGridWithTiers(model.pricing, cardTiers)

  // 输入 → 输出模态流。后端拆分下发；老数据只有合并 modalities 时退回并集。
  const inputMods = (model.input_modalities ?? model.modalities ?? []).filter((m) => MODALITY_CODES.includes(m))
  const outputMods = (model.output_modalities ?? model.modalities ?? []).filter((m) => MODALITY_CODES.includes(m))

  const capabilities = pickCapabilities(model.tags, [model.provider, model.vendor], 3)

  const discountLabel = isZh ? promo?.discount_label : (promo?.discount_label_en || promo?.discount_label)
  // 划线原价只在原价真高于现价时渲染（见 strikeOriginalPrice）：线上促销模型的
  // original_* 若等于现价或为 0，直接渲染会变成「¥3 划掉 ¥3」「划掉 ¥0」。
  // qa#286：tagline 为空的模型此前简介行直接不渲染，卡片比同排矮一截；跟详情页
  // 同款兜底（真实字段拼一句事实性简介，不杜撰能力），两处口径一致。
  // prd#820：兜底句前面还得先回落 description —— 线上没有一个模型配了 tagline，
  // 卡片却因此全部渲染「详细简介待补充。」，详情页显示真描述。口径见 cardSummary。
  const summary = cardSummary(model, provider ?? '', isZh)
  // PRD §模型广场 AC-13「暂未开放」：模型本身可浏览详情/API，但没配置任何可体验任务时
  // 「去体验」按钮禁用并说明原因（原型 App.tsx:4619-4620/5076-5081 逐字对齐）。
  const hasExperience = hasPlaygroundExperience(model)

  return (
    <article
      className="mg-tile mg-tile-hover mg-mcard"
      onClick={() => {
        onCardOpened?.(model, listPosition)
        navigate(detailHref, { state: { source: 'catalog_list', fromSearch: location.search } })
      }}
    >
      {/* 顶行：图标 + 角标（右对齐） */}
      <div className="mg-mcard-top">
        <ModelIcon model={model} size={38} rounded="rounded-full" className="mg-mcard-avatar" />
        <div className="mg-mcard-badges">
          {model.is_new && (
            <em className="mg-badge is-new">
              <LuSparkles size={10} />
              {t('modelsCatalog.sidebar.new')}
            </em>
          )}
          {/* PRD §5「状态徽标」原文：免费显示「限时特惠·免费」 */}
          {isFree ? (
            <em className="mg-badge is-free">{t('modelsCatalog.sidebar.limitedFree')}</em>
          ) : discountLabel ? (
            <em className="mg-badge is-discount">{discountLabel}</em>
          ) : null}
        </div>
      </div>

      {/* 身份 */}
      <div className="mg-mcard-id">
        <h3 className="mg-mcard-name" title={name}>{name}</h3>
        <div className="mg-mcard-meta" onClick={(e) => e.stopPropagation()}>
          {/* 原型卡片只有「厂商 + API ID + 复制」，没有认证图标 —— 它在所有模型上都
              相同、无区分度，四列窄卡下却会挤掉厂商名与 API ID 的显示空间。
              复制按钮在 API ID 前面（原型顺序，qa#286），不是后面。 */}
          {provider && <span className="mg-mcard-vendor">{provider}</span>}
          <CopyButton
            value={model.model_id}
            aria-label={t('modelsCatalog.card.copyApiId')}
            toast={false}
            className="h-5 w-5 shrink-0"
            onCopied={() => onModelIdCopied?.(model)}
          />
          <code className="mg-mcard-api font-mono">{model.model_id}</code>
        </div>
      </div>

      {/* 简介：最多两行 */}
      {summary && <p className="mg-mcard-desc">{summary}</p>}

      {/* 输入 → 输出模态流 */}
      {(inputMods.length > 0 || outputMods.length > 0) && (
        <div
          className="mg-mcard-flow"
          aria-label={
            t('modelsCatalog.sidebar.inputOutputFlow', {
              input: inputMods.map((m) => t(`modelsCatalog.modality.${m}`)).join(t('modelsExperience.listSeparator')),
              output: outputMods.map((m) => t(`modelsCatalog.modality.${m}`)).join(t('modelsExperience.listSeparator')),
            })
          }
        >
          <span className="mg-mcard-flow-group">
            {inputMods.map((m) => <ModalityMark key={`i-${m}`} m={m} title={t(`modelsCatalog.modality.${m}`)} />)}
          </span>
          <LuArrowRight size={13} className="mg-mcard-flow-arrow" aria-hidden />
          <span className="mg-mcard-flow-group">
            {outputMods.map((m) => <ModalityMark key={`o-${m}`} m={m} title={t(`modelsCatalog.modality.${m}`)} />)}
          </span>
        </div>
      )}

      {/* API 协议：可点击反查筛选 */}
      {(model.protocols ?? []).length > 0 && (
        <div className="mg-mcard-protocols" aria-label={t('modelsCatalog.sidebar.apiProtocolAria')}>
          {(model.protocols ?? []).map((p) => (
            <button
              key={p}
              type="button"
              className={`mg-proto is-${p}`}
              title={t('modelsCatalog.sidebar.filterTitle', { label: protocolLabel(p, isZh) })}
              onClick={(e) => { e.stopPropagation(); onPickProtocol?.(p) }}
              disabled={!onPickProtocol}
            >
              {protocolLabel(p, isZh)}
            </button>
          ))}
        </div>
      )}

      {/* 能力标签：可点击反查筛选 */}
      {capabilities.length > 0 && (
        <div className="mg-mcard-tags">
          {capabilities.map((c) => {
            const Icon = tagIcon(c)
            return (
              <button
                key={c}
                type="button"
                className="mg-mcard-tag"
                onClick={(e) => { e.stopPropagation(); onPickCapability?.(c) }}
                disabled={!onPickCapability}
              >
                <Icon size={10} />
                {c}
              </button>
            )
          })}
        </div>
      )}

      {/* 贴底：价格规格。第一行输入/输出价，第二行上下文/缓存读取。划线原价内联在现价
          右侧，不另起一行。最大输出已按 shared/modelgo_prd#348 移除（后端无可靠数据），
          空出的第四格按需求方 2026-08-04 口径改放缓存读取价。 */}
      <div className="mg-mcard-specs">
        {useTierGrid ? (
          cardTiers.map((tier) => {
            const shown = priceText(tier.price, symbol, '—', `/${tier.unit}`, isFree)
            return (
              <Metric
                key={`${tier.bucket}-${tier.label}`}
                label={priceTierLabel(tier, isZh)}
                value={shown.value}
                unit={shown.unit}
                accent
              />
            )
          })
        ) : (
          <>
            <Metric
              label={t('modelsCatalog.card.input')}
              value={input.value}
              unit={input.unit}
              strike={strikeInputVal != null ? `${symbol}${trimPriceZeros(String(strikeInputVal))}` : undefined}
              accent
            />
            <Metric
              label={t('modelsCatalog.card.output')}
              value={output.value}
              unit={output.unit}
              strike={strikeOutputVal != null ? `${symbol}${trimPriceZeros(String(strikeOutputVal))}` : undefined}
              accent
            />
            <Metric label={t('modelsCatalog.card.context')} value={ctxValue} />
            <Metric label={t('modelsCatalog.card.cacheRead')} value={cacheRead.value} unit={cacheRead.unit} />
          </>
        )}
      </div>

      {/* 操作：hover / 键盘聚焦时浮出，覆盖最底一行，不改变卡片高度。
          主/次操作 flex-1 满行等分（原型 .marketplace-try/.marketplace-compare
          均 flex:1），对比图标按钮固定 36px——之前两个主按钮不设 flex-1，
          挤在左侧留一大截空白，位置对不上原型。 */}
      <div className="mg-mcard-actions">
        <Button
          variant="brand"
          size="sm"
          className="flex-1"
          disabled={!hasExperience}
          title={!hasExperience ? t('modelsCatalog.button.comingSoonHint') : undefined}
          onClick={(e) => onTry(model.model_id, e)}
        >
          {hasExperience ? t('modelsCatalog.card.try') : t('modelsCatalog.button.comingSoon')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={(e) => {
            e.stopPropagation()
            onApiRequest?.(model)
            // 「API请求」进入详情后自动滚动到 API 接入区，不打开新弹窗（PRD §7.5/§8.3）
            navigate(detailHref, { state: { source: 'catalog_list', scrollTo: 'api-access', fromSearch: location.search } })
          }}
        >
          {t('modelsCatalog.card.apiDocs')}
        </Button>
        {canCompare && onCompare && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCompare}
            title={t('modelsCatalog.card.compare')}
            aria-label={t('modelsCatalog.card.compare')}
            className="mg-mcard-icon-btn"
          >
            {/* 原型 App.tsx marketplace-card-compare-icon 用的是 Columns2，不是 git 对比箭头 */}
            <LuColumns2 size={14} />
          </Button>
        )}
      </div>
    </article>
  )
}

function Metric({
  label, value, unit, accent, strike,
}: { label: string; value: string; unit?: string; accent?: boolean; strike?: string }) {
  return (
    <div className="mg-metric">
      <span className="mg-metric-label">{label}</span>
      <span className={`mg-metric-value ${accent ? 'is-accent' : ''}`}>
        {value}
        {unit && <small className="mg-metric-unit">{unit}</small>}
        {/* 划线原价内联在现价右侧（原型口径）；仅有促销时渲染，是装饰而非真实价格 */}
        {strike && <s className="mg-metric-strike">{strike}</s>}
      </span>
    </div>
  )
}
