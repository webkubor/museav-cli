/**
 * 模型体验空态的模型卡片（需求方 shared/modelgo_prd#834）。
 *
 * 原型：#834 附图 `tuyi-model-card`（产品 2026-08-25 确认）—— 消息区空态中央一张卡，
 * 自上而下「图标 + 模型名 / model_id + 复制」→ 一句话简介 → 两列六格参数。
 * 只在空态渲染，发出第一条消息后随空态一起消失；模型条切模型即时联动（数据全部
 * 来自入参 model，没有自己的状态）。
 *
 * 字段口径与模型广场卡片/详情**同源**（#834 验收项）：价格、限免、划线原价一律走
 * `features/models/model-format` 的同一批纯函数，不在这里重算。两处口径的唯一差异
 * 是价格配色 —— 广场卡片走「正文色、仅免费标绿」，本卡片按 #834 单内文案要求
 * 「输入/输出价格绿色强调」，故价格值一律 --mg-success。
 *
 * 媒体模型（图片/音频/视频）不套 token 那套格子：与广场媒体卡同口径改摆
 * 主价格 / 计费单位 / 主要规格 / 可体验任务，否则整排会是「¥— / 上下文 —」。
 */
import { useTranslation } from 'react-i18next'
import { CopyButton } from '@/components/ui/CopyButton'
import { OverflowTip } from '@/components/ui/OverflowTip'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { ModalityMark } from '@/features/models/components/ModalityMark'
import {
  MODALITY_CODES, cardSummary, currencySymbol, firstPositivePrice, hasPricingGradient,
  mediaPrimaryPrice, modelVendorLabel, priceText, priceTierLabel, priceTiersForCard,
  priceUnitSuffix, strikeOriginalPrice, withPriceFrom,
} from '@/features/models/model-format'
import { formatContextLength, formatNumber, prettyModelName, trimPriceZeros } from '@/lib/utils'
import { experienceTaskLabel, modelExperienceTasks, resolveModelCategory } from './model-experience-data'
import type { CatalogModelItem } from '@/types'

interface SpecCell {
  key: string
  label: string
  /** 值前缀的模态标记（输入/输出类型格用），其余格不传 */
  marks?: string[]
  value: string
  unit?: string
  /** 划线原价（含单位），仅促销且原价确实高于现价时才有，见 strikeOriginalPrice */
  strike?: string
  /** 价格格：按 #834 文案「绿色强调」 */
  isPrice?: boolean
}

export function ExperienceModelCard({ model }: { model: CatalogModelItem }) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language.startsWith('zh')

  const vendor = modelVendorLabel(model, '')
  const name = prettyModelName(model.display_name, model.model_id, vendor)
  const summary = cardSummary(model, vendor, isZh)

  const promo = model.promotion
  // free 只认服务端显式限免标记，不从「价格为 0」推断——未配价的模型也是 0（与广场同口径）
  const isFree = Boolean(promo?.free)
  const discountLabel = isZh ? promo?.discount_label : (promo?.discount_label_en || promo?.discount_label)

  const symbol = currencySymbol(model.pricing?.currency, isZh)
  const isPerCall = model.pricing?.mode === 'per_call'
  const rawUnitSuffix = priceUnitSuffix(model.price_unit, model.pricing?.mode, model.price_unit_en)
  // 原型价格写作「¥2/M Tokens」：按 token 计价时在 /M 后补计量词，per_call 的 /张 不补
  const unitSuffix = isPerCall ? rawUnitSuffix : `${rawUnitSuffix} ${t('modelsExperience.modelCard.tokens')}`
  const freeLabel = t('modelsCatalog.card.free')
  const hasGradient = hasPricingGradient(model.pricing_rules)

  const inputMods = (model.input_modalities ?? model.modalities ?? []).filter((m) => MODALITY_CODES.includes(m))
  const outputMods = (model.output_modalities ?? model.modalities ?? []).filter((m) => MODALITY_CODES.includes(m))
  const modalityText = (mods: string[]) =>
    mods.map((m) => t(`modelsCatalog.modality.${m}`)).join(t('modelsExperience.listSeparator'))

  const typeCells: SpecCell[] = [
    {
      key: 'inputType',
      label: t('modelsExperience.modelCard.inputType'),
      marks: inputMods,
      value: modalityText(inputMods) || '—',
    },
    {
      key: 'outputType',
      label: t('modelsExperience.modelCard.outputType'),
      marks: outputMods,
      value: modalityText(outputMods) || '—',
    },
  ]

  const isMedia = resolveModelCategory(model) !== 'dialogue'
  let priceCells: SpecCell[]
  if (isMedia) {
    const cardTiers = priceTiersForCard(model.price_tiers)
    const primaryRaw = mediaPrimaryPrice(model.pricing, model.price_unit, cardTiers, model.price_unit_en)
    const primary = withPriceFrom(priceText(primaryRaw.amount, symbol, isFree ? freeLabel : '—', primaryRaw.unit, isFree), hasGradient)
    // 主价划线原价的候选顺序与广场卡片一致（prd#863 ④：档位主价的折前价优先于 token 侧原价）
    const strikePrimary = strikeOriginalPrice(
      firstPositivePrice(
        primaryRaw.originalAmount,
        promo?.original_output_per_1m, promo?.original_input_per_1m, promo?.original_price,
        promo ? model.pricing?.per_call_price : undefined,
      ),
      primaryRaw.amount,
      isFree,
    )
    const billingUnit = primaryRaw.unitName === 'M'
      ? t('modelsCatalog.card.perMillionTokens')
      : t('modelsCatalog.card.perUnit', { unit: primaryRaw.unitName })
    const mainSpec = cardTiers.length > 0
      ? cardTiers.slice(0, 3).map((tier) => priceTierLabel(tier, isZh)).join(' / ')
      : t('modelsCatalog.detail.byTaskSpec')
    const tasks = modelExperienceTasks(model)
    priceCells = [
      {
        key: 'primaryPrice',
        label: t('modelsCatalog.card.primaryPrice'),
        value: primary.value,
        unit: primary.unit,
        strike: strikePrimary != null ? `${symbol}${trimPriceZeros(String(strikePrimary))}${primaryRaw.unit}` : undefined,
        isPrice: true,
      },
      { key: 'billingUnit', label: t('modelsCatalog.card.billingUnit'), value: billingUnit },
      { key: 'mainSpec', label: t('modelsCatalog.detail.mainSpec'), value: mainSpec },
      {
        key: 'experienceTasks',
        label: t('modelsCatalog.card.experienceTasks'),
        value: tasks.map((task) => experienceTaskLabel(task)).join(t('modelsExperience.listSeparator')) || '—',
      },
    ]
  } else {
    const input = withPriceFrom(priceText(model.pricing?.input_per_1m, symbol, isFree ? freeLabel : '—', unitSuffix, isFree), hasGradient)
    const output = withPriceFrom(priceText(model.pricing?.output_per_1m, symbol, isFree ? freeLabel : '—', unitSuffix, isFree), hasGradient)
    const strikeInput = strikeOriginalPrice(promo?.original_input_per_1m ?? promo?.original_price, model.pricing?.input_per_1m, isFree)
    const strikeOutput = strikeOriginalPrice(promo?.original_output_per_1m, model.pricing?.output_per_1m, isFree)
    // 最大输出：广场规格条按 prd#348 撤掉过（后端数据不可靠），但 #834 原型明确要这一格，
    // 且该字段本来就在给模型设置弹窗的 max_tokens 定上限用；缺值渲染「—」而不是编一个默认值。
    const maxOutput = (model.max_output_tokens ?? 0) > 0
      ? `${formatNumber(model.max_output_tokens)} ${t('modelsExperience.modelCard.tokens')}`
      : '—'
    priceCells = [
      {
        key: 'inputPrice',
        label: t('models.detail.pricingInput'),
        value: input.value,
        unit: input.unit,
        strike: strikeInput != null ? `${symbol}${trimPriceZeros(String(strikeInput))}${unitSuffix}` : undefined,
        isPrice: true,
      },
      {
        key: 'outputPrice',
        label: t('models.detail.pricingOutput'),
        value: output.value,
        unit: output.unit,
        strike: strikeOutput != null ? `${symbol}${trimPriceZeros(String(strikeOutput))}${unitSuffix}` : undefined,
        isPrice: true,
      },
      {
        key: 'contextLength',
        label: t('models.detail.contextLength'),
        value: (model.context_length ?? 0) > 0 ? formatContextLength(model.context_length) : '—',
      },
      { key: 'maxOutput', label: t('modelsExperience.modelCard.maxOutput'), value: maxOutput },
    ]
  }

  // 网格按行铺：左列 输入类型/输入价格(主价格)/上下文窗口(主要规格)，右列 输出类型/输出价格(计费单位)/最大输出(可体验任务)
  const cells = [typeCells[0], typeCells[1], priceCells[0], priceCells[1], priceCells[2], priceCells[3]]

  return (
    <article className="mg-tile models-experience-model-card">
      <header className="models-experience-model-card-head">
        <ModelIcon model={model} variant="card" rounded="rounded-lg" className="models-experience-model-card-avatar" />
        <div className="models-experience-model-card-id">
          <h3 className="models-experience-model-card-name" title={name}>{name}</h3>
          <div className="models-experience-model-card-api">
            {/* 复制按钮在 API ID 前面（与广场卡片同顺序，qa#286） */}
            <CopyButton
              value={model.model_id}
              aria-label={t('modelsCatalog.card.copyApiId')}
              toast={t('modelsCatalog.toast.copied')}
              className="h-5 w-5 shrink-0"
            />
            <code className="font-mono">{model.model_id}</code>
          </div>
        </div>
        {(isFree || discountLabel) && (
          <div className="models-experience-model-card-badges">
            {isFree
              ? <em className="models-experience-model-card-badge is-free">{t('modelsCatalog.detail.freeBadge')}</em>
              : <em className="models-experience-model-card-badge is-discount">{discountLabel}</em>}
          </div>
        )}
      </header>

      {summary && <p className="models-experience-model-card-desc">{summary}</p>}

      <dl className="models-experience-model-card-specs">
        {cells.map((cell) => (
          <div key={cell.key} className="models-experience-model-card-spec">
            <dt>{cell.label}</dt>
            <dd className={cell.isPrice ? 'is-price' : undefined}>
              {cell.marks?.map((m) => (
                <ModalityMark key={m} m={m} title={t(`modelsCatalog.modality.${m}`)} size={13} />
              ))}
              {/* 值可能很长（可体验任务、多模态列表）：省略号打在真实文本上，截断时悬停显全文 */}
              <OverflowTip text={cell.value || '—'} className="models-experience-model-card-spec-main" />
              {cell.unit && <i>{cell.unit}</i>}
              {cell.strike && <s>{cell.strike}</s>}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  )
}
