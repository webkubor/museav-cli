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
import { OverflowTip } from '@/components/ui/OverflowTip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import {
  currencySymbol, priceUnitSuffix, priceText, protocolLabel, pickCapabilities, vendorFromModelId, detailSummary, modelVendorLabel,
  priceTierLabel, mediaPrimaryPrice, firstPositivePrice, strikeOriginalPrice,
  pricingRuleGroups, pricingRuleLabel, pricingRulePriceText, withPriceFrom, sortProtocols,
} from '../model-format'
import { formatContextLength, prettyModelName, trimPriceZeros } from '@/lib/utils'
// 任务/类别推导与广场卡片共用一份（lib/login-intent.ts 已有同向引用的先例）；
// 媒体判定与「可体验任务」格都以模态推导为准，不读已废弃的 experience_types。
import { experienceTaskLabel, modelExperienceTasks, resolveModelCategory } from '@/pages/models/model-experience-data'

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
  label, value, unit, strike, subValue, subTag, valueTag, free,
}: {
  label: string
  value: string
  unit?: string
  strike?: string
  subValue?: string
  subTag?: string
  valueTag?: string
  free?: boolean
}) {
  return (
    <div className="mg-metric">
      <span className="mg-metric-label">{label}</span>
      <span className={`mg-metric-value ${free ? 'is-free' : ''}`}>
        {/* 主文本单独包一层：值容器是 flex，超出省略只能打在真实子元素上；
            截断时悬停冒气泡显全文（OverflowTip，没截断不冒） */}
        <OverflowTip text={value || '—'} className="mg-metric-value-main" />
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
  // 价格梯度（#800）：pricing_rules 按维度分组（context_length → peak_time）。
  // 有梯度时规格条的输入/输出价仍是起始档（后端已写进 pricing.*），只在后面加「起」。
  const ruleGroups = pricingRuleGroups(detail.pricing_rules)
  const hasGradient = ruleGroups.length > 0
  const input = withPriceFrom(priceText(detail.pricing?.input_per_1m, symbol, isFree ? freeLabel : '', unitSuffix, isFree), hasGradient)
  const output = withPriceFrom(priceText(detail.pricing?.output_per_1m, symbol, isFree ? freeLabel : '', unitSuffix, isFree), hasGradient)
  // 缓存读取同为起始档价（glm-4.7 两档 0.4/0.8），与输入/输出一样挂「起」（prd#864 A2）
  const cacheRead = withPriceFrom(priceText(detail.pricing?.cache_read_per_1m, symbol, isFree ? freeLabel : '', unitSuffix, isFree), hasGradient)
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

  const strikeInputVal = strikeOriginalPrice(
    promo?.original_input_per_1m ?? promo?.original_price,
    detail.pricing?.input_per_1m,
    isFree,
  )
  const strikeInput = strikeInputVal != null
    ? `${symbol}${trimPriceZeros(String(strikeInputVal))}${unitSuffix}`
    : undefined
  const strikeOutputVal = strikeOriginalPrice(
    promo?.original_output_per_1m,
    detail.pricing?.output_per_1m,
    isFree,
  )
  const strikeOutput = strikeOutputVal != null
    ? `${symbol}${trimPriceZeros(String(strikeOutputVal))}${unitSuffix}`
    : undefined
  // 缓存读取的原价画线与输入/输出同口径（prd#831：后端有下发、此前没渲染）。
  // 缓存写入契约里没有 original_* 字段（CatalogPromotion 只有 read），有价无原价，不画。
  const strikeCacheReadVal = strikeOriginalPrice(
    promo?.original_cache_read_per_1m,
    detail.pricing?.cache_read_per_1m,
    isFree,
  )
  const strikeCacheRead = strikeCacheReadVal != null
    ? `${symbol}${trimPriceZeros(String(strikeCacheReadVal))}${unitSuffix}`
    : undefined
  const priceTiers = detail.price_tiers ?? []
  // 媒体产物模型（图片/视频/音频）：规格条改摆「主价格 / 计价单位 / 主要规格 /
  // 可体验任务」四格（原型 marketplace-pricing-summary media 变体，App.tsx:5637-5642），
  // 不再铺输入/输出/缓存，档位矩阵挪进下方「价格梯度」表 —— 需求方 2026-08-25：
  // 视频/图片模型只展示主价格，不需要那么细致。
  const category = resolveModelCategory(detail)
  const isMediaModel = category !== 'dialogue'
  const experienceTasks = modelExperienceTasks(detail)
  const tasksLabel = experienceTasks.length > 0
    ? [...new Set(experienceTasks.map(experienceTaskLabel))].join(' / ')
    : t('modelsCatalog.button.comingSoon')
  const primaryRaw = mediaPrimaryPrice(detail.pricing, detail.price_unit, priceTiers)
  const primary = withPriceFrom(priceText(primaryRaw.amount, symbol, isFree ? freeLabel : '', primaryRaw.unit, isFree), hasGradient)
  // firstPositivePrice 而非 ??：per_call 模型 original_output 恒 "0"，会把镜像在
  // original_input 的折前价截住（seedream「限时71折」无划线的前端侧成因）
  // 末位候选 per_call_price：促销期它维持折前原价（折后现价在 input_per_1m），
  // original_* 缺发时靠它兜底；仅促销卡参与，守卫会拦掉 ≤ 现价的取值
  const strikePrimaryVal = strikeOriginalPrice(
    firstPositivePrice(
      promo?.original_output_per_1m, promo?.original_input_per_1m, promo?.original_price,
      promo ? detail.pricing?.per_call_price : undefined,
    ),
    primaryRaw.amount,
    isFree,
  )
  const strikePrimary = strikePrimaryVal != null
    ? `${symbol}${trimPriceZeros(String(strikePrimaryVal))}${primaryRaw.unit}`
    : undefined
  // 计价单位：有明确单位（张/秒/万字符）写「每X」；按 token 计价的媒体模型
  // （Seedance 类）原型详情条写「按接口约定」（App.tsx:5638），与卡片的
  // 「每百万 Token」口径不同，以原型详情为准。
  const billingUnitText = primaryRaw.unitName !== 'M'
    ? t('modelsCatalog.card.perUnit', { unit: primaryRaw.unitName })
    : t('modelsCatalog.detail.byInterface')
  const mainSpecText = priceTiers.length > 0
    ? priceTiers.slice(0, 3).map((tier) => priceTierLabel(tier, isZh)).join(' / ')
    : t('modelsCatalog.detail.byTaskSpec')
  const mediaSpecHead = t(category === 'video'
    ? 'modelsCatalog.detail.specVideo'
    : category === 'audio'
      ? 'modelsCatalog.detail.specAudio'
      : 'modelsCatalog.detail.specImage')

  const capabilities = pickCapabilities(detail.tags, [detail.provider, detail.vendor, vendor])
  // 详情位取长描述优先（prd#820 起与卡片位的 cardSummary 成对定义，见那边的注释）。
  const summary = detailSummary(detail, vendor, isZh)

  return (
    <>
      {/* Hero：图标 | 主信息 | 操作区（原型 App.tsx:5041-5098） */}
      <section className="mg-tile mg-detail-hero">
        <ModelIcon
          model={{ logo_url: detail.logo_url, vendor, display_name: detail.display_name }}
          variant="hero"
          rounded="rounded-sm"
          className="mg-detail-avatar"
        />
        <div className="mg-detail-hero-main">
          <div className="mg-detail-title">
            <h2 className="mg-text-title-sm font-bold text-[var(--mg-text-1)]">
              {prettyModelName(detail.display_name, detail.model_id, vendor)}
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
            {sortProtocols(detail.protocols ?? []).map((p) => (
              <span key={p} className={`mg-proto is-${p}`}>{protocolLabel(p, isZh)}</span>
            ))}
            {capabilities.map((c) => (
              <span key={c} className="mg-mcard-tag">{c}</span>
            ))}
          </div>
        </div>
        {actions && <div className="mg-detail-hero-actions">{actions}</div>}
      </section>

      {/* 规格条：对话模型横向 6 格（原型 App.tsx:5622-5626）；媒体模型
          主价格/计价单位/主要规格/可体验任务 四格（原型 App.tsx:5637-5642，
          无上下文/缓存格）。 */}
      <section className="mg-tile mg-detail-specs">
        {isMediaModel ? (
          <>
            <Metric
              label={t('modelsCatalog.card.primaryPrice')}
              value={primary.value}
              unit={primary.unit}
              strike={strikePrimary}
              free={isFree}
            />
            <Metric label={t('modelsCatalog.detail.ruleUnit')} value={billingUnitText} />
            <Metric label={t('modelsCatalog.detail.mainSpec')} value={mainSpecText} />
            <Metric label={t('modelsCatalog.card.experienceTasks')} value={tasksLabel} />
          </>
        ) : (
          <>
        {detail.context_length > 0 && (
          <Metric
            label={t('models.detail.contextLength')}
            value={formatContextLength(detail.context_length)}
            unit="tokens"
          />
        )}
          <>
            <Metric
              label={t('models.detail.pricingInput')}
              value={input.value}
              unit={input.unit}
              valueTag={textInput.value ? mediaTag : undefined}
              strike={strikeInput}
              subValue={textInput.value ? `${textInput.value}${textInput.unit}` : undefined}
              subTag={textInput.value ? textTag : undefined}
              free={isFree}
            />
            <Metric
              label={t('models.detail.pricingOutput')}
              value={output.value}
              unit={output.unit}
              valueTag={textOutput.value ? mediaTag : undefined}
              strike={strikeOutput}
              subValue={textOutput.value ? `${textOutput.value}${textOutput.unit}` : undefined}
              subTag={textOutput.value ? textTag : undefined}
              free={isFree}
            />
            <Metric
              label={t('models.detail.pricingCacheRead')}
              value={cacheRead.value}
              unit={cacheRead.unit}
              strike={strikeCacheRead}
              free={isFree}
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
          </>
        )}
      </section>

      {/* 价格梯度（#800）：token 模型的上下文分档 / 峰时价，功能对照原型
          App.tsx:5529-5654（MarketplacePricingRules / MarketplacePriceAndBilling），
          表格视觉走现状控制台 ui/Table（全站表格统一居中）。媒体模型的档位矩阵
          （price_tiers）也进这里的「规格/计价单位/价格」表（原型 image_spec/video_spec
          表，App.tsx:5540-5570）——规格条只留主价格，不再铺档位（需求方 2026-08-25）。
          限免口径只认 promotion.free，不从阶梯价推断。 */}
      {(hasGradient || (isMediaModel && priceTiers.length > 0)) && (
        <section className="mg-tile mg-detail-card">
          <h3 className="text-mg-text-1 mb-3 text-[14px] font-semibold">
            {t('modelsCatalog.detail.pricingRules')}
          </h3>
          <div className="flex flex-col gap-4">
            {isMediaModel && priceTiers.length > 0 && (
              <div>
                <h4 className="mg-text-label text-mg-text-3 mb-2">{mediaSpecHead}</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{mediaSpecHead}</TableHead>
                      <TableHead>{t('modelsCatalog.detail.ruleUnit')}</TableHead>
                      <TableHead>{t('modelsCatalog.detail.rulePrice')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {priceTiers.map((tier, idx) => (
                      <TableRow key={`${tier.bucket}-${tier.label}-${idx}`}>
                        <TableCell>{priceTierLabel(tier, isZh)}</TableCell>
                        <TableCell>{tier.unit}</TableCell>
                        <TableCell>{`${symbol}${trimPriceZeros(tier.price)}/${tier.unit}`}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {ruleGroups.map(({ dimension, rules }) => (
              <div key={dimension}>
                <h4 className="mg-text-label text-mg-text-3 mb-2">
                  {/* 未知维度降级用通用表头，区间列直接吃后端 label（prd#864 A3） */}
                  {t(dimension === 'context_length'
                    ? 'modelsCatalog.detail.ruleDimContext'
                    : dimension === 'peak_time'
                      ? 'modelsCatalog.detail.ruleDimPeak'
                      : 'modelsCatalog.detail.ruleDimOther')}
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {t(dimension === 'context_length'
                          ? 'modelsCatalog.detail.ruleRange'
                          : dimension === 'peak_time'
                            ? 'modelsCatalog.detail.ruleTimeSlot'
                            : 'modelsCatalog.detail.ruleRangeOther')}
                      </TableHead>
                      {dimension === 'peak_time' && (
                        <TableHead>{t('modelsCatalog.detail.ruleTimezone')}</TableHead>
                      )}
                      <TableHead>{t('models.detail.pricingInput')}</TableHead>
                      <TableHead>{t('models.detail.pricingOutput')}</TableHead>
                      <TableHead>{t('models.detail.pricingCacheRead')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule, idx) => (
                      <TableRow key={`${dimension}-${idx}`}>
                        <TableCell>{pricingRuleLabel(rule, isZh)}</TableCell>
                        {dimension === 'peak_time' && (
                          <TableCell>{rule.timezone || '—'}</TableCell>
                        )}
                        <TableCell>{pricingRulePriceText(rule, 'input', symbol)}</TableCell>
                        <TableCell>{pricingRulePriceText(rule, 'output', symbol)}</TableCell>
                        <TableCell>{pricingRulePriceText(rule, 'cache_read', symbol)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
            {ruleGroups.length > 0 && (
              // prd#864 A4：0–32K 档还存在输出长度子档（后端投影暂只保留最低价），
              // 脚注兜住「把起始档当唯一价」的误读
              <p className="text-xs text-mg-text-3">{t('modelsCatalog.detail.gradientFootnote')}</p>
            )}
          </div>
        </section>
      )}

      {/* qa#290：详情页原型没有单独的"技术规格"板块（zero_data_retention/
          in_region_routing/released_at/knowledge_cutoff 之前被塞进这里），
          按原型对齐去掉——这几个字段展示价值不高（当前实测全是「不支持」），
          原型 6 格规格条已经够用，不需要额外板块。 */}
    </>
  )
}
