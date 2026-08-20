/**
 * 模型详情主面板（Hero + 规格）。
 *
 * 信息结构照 PRD 原型 `modelgo_prd/src/App.tsx:5035-5168`（MarketplaceModelDetail）：
 * Hero 三栏「图标 | 名称+角标/厂商+API ID/简介/标签 | 操作区」，下面一条横向 5 格
 * 规格条（上下文窗口 / 输入价格 / 输出价格 / 缓存读取 / 缓存写入；最大输出已按
 * shared/modelgo_prd#348 移除——后端无可靠数据）。
 * 原型没有 Tab —— 此前包了一层只剩单个「基本参数」Tab 的空壳（供应商 Tab 已按
 * PRD §9.2 下线），现按原型平铺。
 *
 * 视觉走现状控制台：`.mg-badge` / `.mg-proto` / `.mg-metric` 等类与卡片同源
 * （catalog.css），不照抄原型的观感。
 */
import type { ReactNode } from 'react'
import { LuSparkles } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import type { CatalogModelDetail } from '@/types'
import { ModalityBadge } from './ModalityBadge'
import { ModelIcon } from './ModelIcon'
import { CopyButton } from '@/components/ui/CopyButton'
import {
  currencySymbol, priceUnitSuffix, priceText, protocolLabel, pickCapabilities, vendorFromModelId, autoSummary, modelVendorLabel,
  priceTierLabel, catalogCardReplacesGridWithTiers, strikeOriginalPrice,
} from '../model-format'
import { formatContextLength, prettyModelName, trimPriceZeros } from '@/lib/utils'

interface ModelDetailPanelProps {
  detail: CatalogModelDetail
  vendorHint?: string
  /** 埋点：marketplace_model_id_copied（复制 Hero 里的 API ID 时触发） */
  onModelIdCopied?: () => void
  /**
   * Hero 右侧操作区（去体验 / 模型对比 / 查看API接入手册）。由页面注入而不是面板
   * 自己渲染 —— 这些动作牵扯路由、登录跳转与埋点，面板保持纯展示。
   */
  actions?: ReactNode
}

/**
 * 一格规格。value 为空串时显示破折号 —— 未配置与「免费」是两件事，不能显示 0。
 * 划线原价内联在现价右侧（与广场卡片 CatalogCard 同口径）；此前它独占一行是为了
 * 躲开 nowrap 溢出，现在 .mg-detail-specs .mg-metric-value 改成可折行的 flex
 * 行，窄格时原价整块折到下一行，不会再挤出格外。次行价仍是独立一行。
 */
function Metric({
  label, value, unit, strike, subValue, subTag, valueTag, accent,
}: {
  label: string
  value: string
  unit?: string
  strike?: string
  subValue?: string
  subTag?: string
  valueTag?: string
  accent?: boolean
}) {
  return (
    <div className="mg-metric">
      <span className="mg-metric-label">{label}</span>
      <span className={`mg-metric-value ${accent ? 'is-accent' : ''}`}>
        {value || '—'}
        {unit && <i className="mg-metric-unit">{unit}</i>}
        {valueTag && <i className="mg-metric-ttl">{valueTag}</i>}
        {/* 划线原价：跟在折扣后价格后面，装饰性，不是真实扣费价 */}
        {strike && <s className="mg-metric-strike">{strike}</s>}
      </span>
      {subValue && (
        <span className="mg-metric-sub">
          {subValue}
          {subTag && <i className="mg-metric-ttl">{subTag}</i>}
        </span>
      )}
    </div>
  )
}

export function ModelDetailPanel({ detail, vendorHint, onModelIdCopied, actions }: ModelDetailPanelProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language.startsWith('zh')
  // provider（对外厂商名）优先；详情接口两者都不下发时用 model_id 前缀兜底（见 model-format）
  const vendor = modelVendorLabel(detail, '') || vendorHint || vendorFromModelId(detail.model_id)

  const promo = detail.promotion
  // free 只认服务端的显式限免标记，不从「价格为 0」推断 —— 未配价的模型也是 0。
  const isFree = Boolean(promo?.free)
  const discountLabel = isZh ? promo?.discount_label : (promo?.discount_label_en || promo?.discount_label)

  const symbol = currencySymbol(detail.pricing?.currency, isZh)
  const unitSuffix = priceUnitSuffix(detail.price_unit, detail.pricing?.mode)
  const freeLabel = t('modelsCatalog.card.free')
  // 兜底词按上下文给：限免 → 「免费」；非限免而金额为 0/缺省 → 空串（Metric 渲染
  // 「—」）。未配价不能说成免费。
  const input = priceText(detail.pricing?.input_per_1m, symbol, isFree ? freeLabel : '', unitSuffix, isFree)
  const output = priceText(detail.pricing?.output_per_1m, symbol, isFree ? freeLabel : '', unitSuffix, isFree)
  const cacheRead = priceText(detail.pricing?.cache_read_per_1m, symbol, isFree ? freeLabel : '', unitSuffix, isFree)
  const cacheWrite5m = priceText(detail.cache_write_5m_per_1m, symbol, '', unitSuffix)
  const cacheWrite1h = priceText(detail.cache_write_1h_per_1m, symbol, '', unitSuffix)

  /**
   * 媒体模型的双价：主价按 price_unit（张 / 秒）计，文本 Token 分项价作次行。
   * 原型 App.tsx:5111-5143 的口径 —— 主价挂「图片/视频」标签，次行挂「文本」。
   */
  const mediaTag = detail.price_unit === '张'
    ? t('modelsCatalog.detail.mediaImage')
    : detail.price_unit === '秒'
      ? t('modelsCatalog.detail.mediaVideo')
      : t('modelsCatalog.detail.mediaGeneric')
  const textTag = t('modelsCatalog.detail.mediaText')
  const textInput = priceText(detail.text_input_price, symbol, '', '/1M tokens')
  const textOutput = priceText(detail.text_output_price, symbol, '', '/1M tokens')

  // 划线原价只在原价真高于现价时渲染（见 strikeOriginalPrice），与广场卡片同口径。
  const strikeOriginal = strikeOriginalPrice(promo?.original_price, detail.pricing?.input_per_1m, isFree)
  const originalPrice = strikeOriginal != null
    ? `${symbol} ${trimPriceZeros(strikeOriginal)}${unitSuffix}`
    : undefined
  const priceTiers = detail.price_tiers ?? []
  const replaceGridWithTiers = catalogCardReplacesGridWithTiers(detail.pricing, priceTiers)

  const capabilities = pickCapabilities(detail.tags, [detail.provider, detail.vendor, vendor])
  const summary = detail.description?.trim() || detail.tagline?.trim() || autoSummary(detail, vendor, isZh)

  return (
    <>
      {/* Hero：图标 | 主信息 | 操作区（原型 App.tsx:5041-5098） */}
      <section className="mg-tile mg-detail-hero">
        <ModelIcon
          model={{ logo_url: detail.logo_url, vendor, display_name: detail.display_name }}
          size={48}
          rounded="rounded-sm"
          className="mg-detail-avatar"
        />
        <div className="mg-detail-hero-main">
          <div className="mg-detail-title">
            <h2 className="mg-text-title-sm font-bold text-[var(--mg-text-1)]">
              {prettyModelName(detail.display_name, detail.model_id)}
            </h2>
            {detail.is_new && (
              <em className="mg-badge is-new">
                <LuSparkles size={10} />
                {t('modelsCatalog.detail.newBadge')}
              </em>
            )}
            {isFree ? (
              <em className="mg-badge is-free">{t('modelsCatalog.detail.freeBadge')}</em>
            ) : discountLabel ? (
              <em className="mg-badge is-discount">{discountLabel}</em>
            ) : null}
          </div>

          <div className="mg-detail-meta">
            {vendor && <span className="mg-detail-vendor">{vendor}</span>}
            {detail.model_id && (
              <>
                <code className="mg-detail-api font-mono">{detail.model_id}</code>
                <CopyButton
                  value={detail.model_id}
                  aria-label={t('modelsCatalog.card.copyApiId')}
                  toast={t('modelsCatalog.toast.copied')}
                  className="h-5 w-5 shrink-0"
                  onCopied={onModelIdCopied}
                />
              </>
            )}
          </div>

          <p className="mg-detail-desc">{summary}</p>

          <div className="mg-detail-tags">
            {detail.modalities.map((m) => <ModalityBadge key={m} modality={m} />)}
            {(detail.protocols ?? []).map((p) => (
              <span key={p} className={`mg-proto is-${p}`}>{protocolLabel(p, isZh)}</span>
            ))}
            {capabilities.map((c) => (
              <span key={c} className="mg-mcard-tag">{c}</span>
            ))}
          </div>
        </div>
        {actions && <div className="mg-detail-hero-actions">{actions}</div>}
      </section>

      {/* 规格条：横向 6 格（原型 App.tsx:5100-5168） */}
      <section className="mg-tile mg-detail-specs">
        {detail.context_length > 0 && (
          <Metric
            label={t('models.detail.contextLength')}
            value={formatContextLength(detail.context_length)}
            unit="tokens"
          />
        )}
        {!replaceGridWithTiers && (
          <>
            <Metric
              label={t('models.detail.pricingInput')}
              value={input.value}
              unit={input.unit}
              valueTag={textInput.value ? mediaTag : undefined}
              strike={originalPrice}
              subValue={textInput.value ? `${textInput.value}${textInput.unit}` : undefined}
              subTag={textInput.value ? textTag : undefined}
              accent
            />
            <Metric
              label={t('models.detail.pricingOutput')}
              value={output.value}
              unit={output.unit}
              valueTag={textOutput.value ? mediaTag : undefined}
              subValue={textOutput.value ? `${textOutput.value}${textOutput.unit}` : undefined}
              subTag={textOutput.value ? textTag : undefined}
              accent
            />
            <Metric
              label={t('models.detail.pricingCacheRead')}
              value={cacheRead.value}
              unit={cacheRead.unit}
            />
            <Metric
              label={t('models.detail.pricingCacheWrite')}
              value={cacheWrite5m.value}
              unit={cacheWrite5m.unit}
              valueTag={cacheWrite5m.value ? '5min' : undefined}
              subValue={cacheWrite1h.value ? `${cacheWrite1h.value}${cacheWrite1h.unit}` : undefined}
              subTag={cacheWrite1h.value ? '1h' : undefined}
            />
          </>
        )}
        {priceTiers.map((tier) => {
          const shown = priceText(tier.price, symbol, isFree ? freeLabel : '', `/${tier.unit}`, isFree)
          return (
            <Metric
              key={`${tier.bucket}-${tier.label}`}
              label={priceTierLabel(tier, isZh)}
              value={shown.value}
              unit={shown.unit}
              accent
            />
          )
        })}
      </section>

      {/* qa#290：详情页原型没有单独的"技术规格"板块（zero_data_retention/
          in_region_routing/released_at/knowledge_cutoff 之前被塞进这里），
          按原型对齐去掉——这几个字段展示价值不高（当前实测全是「不支持」），
          原型 6 格规格条已经够用，不需要额外板块。 */}
    </>
  )
}
