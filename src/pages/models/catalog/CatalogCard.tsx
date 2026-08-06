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
import { LuColumns2, LuSparkles } from 'react-icons/lu'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { CopyButton } from '@/components/ui/CopyButton'
import { Button } from '@/components/ui/Button'
import { formatContextLength, prettyModelName, trimPriceZeros } from '@/lib/utils'
import {
  MODALITY_CODES, currencySymbol, priceUnitSuffix, priceText, pickCapabilities, autoSummary, modelVendorLabel,
} from '@/features/models/model-format'
import { hasPlaygroundExperience } from '../model-experience-data'
import type { CatalogModelItem } from '@/types'

interface Props {
  model: CatalogModelItem
  isZh: boolean
  onTry: (modelId: string, e: React.MouseEvent) => void
  onCompare?: (e: React.MouseEvent) => void
  canCompare: boolean
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
  model, isZh, onTry, onCompare, canCompare, onPickCapability,
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

  const unitSuffix = priceUnitSuffix(model.price_unit)
  const freeLabel = t('modelsCatalog.card.free')
  // isFree 优先于金额：限免标记与 pricing 打架时（test 上确有这种数据）以标记为准，
  // 否则卡片会「角标写限时免费、价格写 ¥10」自相矛盾。
  const input = priceText(model.pricing?.input_per_1m, symbol, freeLabel, unitSuffix, isFree)
  const output = priceText(model.pricing?.output_per_1m, symbol, freeLabel, unitSuffix, isFree)
  // 缓存读取价：未配价回落「—」而非「免费」——输入/输出没配价基本等于免费，
  // 但缓存读取没配大多是模型不支持缓存计费，写「免费」会误导。限免模型仍随 isFree 显示免费。
  const cacheRead = priceText(model.pricing?.cache_read_per_1m, symbol, isFree ? freeLabel : '—', unitSuffix, isFree)

  // 输入 → 输出模态流。后端拆分下发；老数据只有合并 modalities 时退回并集。
  const inputMods = (model.input_modalities ?? model.modalities ?? []).filter((m) => MODALITY_CODES.includes(m))
  const outputMods = (model.output_modalities ?? model.modalities ?? []).filter((m) => MODALITY_CODES.includes(m))
  // 2026-08 视觉改版稿：卡上不再区分输入/输出方向（方向信息详情页仍有），
  // 取并集渲染为文本 chips；保序：先输入后输出。
  const modalityChips = [...new Set([...inputMods, ...outputMods])]

  const capabilities = pickCapabilities(model.tags, [model.provider, model.vendor], 2)

  const discountLabel = isZh ? promo?.discount_label : (promo?.discount_label_en || promo?.discount_label)
  // qa#286：tagline 为空的模型此前简介行直接不渲染，卡片比同排矮一截；跟详情页
  // 同款兜底（真实字段拼一句事实性简介，不杜撰能力），两处口径一致。
  const summary = model.tagline?.trim() || autoSummary(model, provider ?? '', isZh)
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

      {/* 2026-08 视觉改版稿：模态流/协议/能力标签三行合并为一行文本 chips。
          模态是事实描述用 span；能力标签保留点击反查筛选用 button。
          输入/输出方向与 API 协议在卡上不再展示（详情页仍完整），
          屏幕阅读器保留原方向语义 aria-label。 */}
      {(modalityChips.length > 0 || capabilities.length > 0) && (
        <div
          className="mg-mcard-chips"
          aria-label={
            t('modelsCatalog.sidebar.inputOutputFlow', {
              input: inputMods.map((m) => t(`modelsCatalog.modality.${m}`)).join(t('modelsExperience.listSeparator')),
              output: outputMods.map((m) => t(`modelsCatalog.modality.${m}`)).join(t('modelsExperience.listSeparator')),
            })
          }
        >
          {modalityChips.map((m) => (
            <span key={m} className="mg-mcard-chip">{t(`modelsCatalog.modality.${m}`)}</span>
          ))}
          {capabilities.map((c) => (
            <button
              key={c}
              type="button"
              className="mg-mcard-chip"
              onClick={(e) => { e.stopPropagation(); onPickCapability?.(c) }}
              disabled={!onPickCapability}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* 贴底：价格规格，2026-08 视觉改版稿改单行 4 列。价格回归正文色（原 accent
          品牌色，四列同排两个彩色数字太抢），上下文长度按稿走 success 色。字段集
          维持 输入/输出/上下文/缓存读取——「最大输出」不回退，#348 的移除是数据
          可靠性决策，与版式无关。划线原价内联在现价右侧，不另起一行。 */}
      <div className="mg-mcard-specs">
        <Metric
          label={t('modelsCatalog.card.input')}
          value={input.value}
          unit={input.unit}
          strike={promo?.original_price ? `${symbol}${trimPriceZeros(promo.original_price)}` : undefined}
        />
        <Metric label={t('modelsCatalog.card.output')} value={output.value} unit={output.unit} />
        <Metric label={t('modelsCatalog.card.context')} value={ctxValue} ctx />
        <Metric label={t('modelsCatalog.card.cacheRead')} value={cacheRead.value} unit={cacheRead.unit} />
      </div>

      {/* 操作：2026-08 视觉改版稿改常驻显示（原 hover 浮出）。主/次操作 flex-1
          满行等分，对比图标按钮固定 36px。 */}
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
  label, value, unit, ctx, strike,
}: { label: string; value: string; unit?: string; ctx?: boolean; strike?: string }) {
  return (
    <div className="mg-metric">
      <span className="mg-metric-label">{label}</span>
      <span className={`mg-metric-value ${ctx ? 'is-ctx' : ''}`}>
        {value}
        {unit && <small className="mg-metric-unit">{unit}</small>}
        {/* 划线原价内联在现价右侧（原型口径）；仅有促销时渲染，是装饰而非真实价格 */}
        {strike && <s className="mg-metric-strike">{strike}</s>}
      </span>
    </div>
  )
}
