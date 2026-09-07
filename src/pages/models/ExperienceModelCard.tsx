/**
 * 模型体验空态的模型卡片（需求方 shared/modelgo_prd#834）。
 *
 * 真源是 PRD 原型 `modelgo_prd/src/App.tsx:20965 PlaygroundModelWelcomeCard`
 * （单里那张 `tuyi-model-card` 截图是它的渲染结果）。结构逐条对齐原型：
 * 图标 + 模型名 / model_id+复制 → 一句话简介 → 两列六格（输入类型/输出类型、
 * 输入价格/输出价格、上下文窗口/最大输出）。只在空态渲染，发出首条消息后随空态消失；
 * 切模型即时联动（数据全部来自入参，组件无自有状态）。
 *
 * 两处**有意保留控制台口径**、不照抄原型：
 * 1. 视觉（字号/圆角/配色/角标形状）按 CLAUDE.md「布局排版对标现状不对标原型视觉」，
 *    用控制台 token 与既有类，不搬原型的 22px/999px 胶囊那套。
 * 2. 价格取值走 `features/models/model-format` 的同一批纯函数 —— #834 单内明确
 *    「数据与模型广场卡片/详情同源同口径（含免费/限免价签规则）」。原型的
 *    `playgroundWelcomePrice` 只有「免费 / — / ¥值/单位」三档，我们是它的超集
 *    （多了划线原价与阶梯价的「起」）。价格值绿色是原型 `dd.price` 的口径。
 *
 * 输入/输出类型**按当前 task 推导**，不是读 modalities 并集（原型
 * `getPlaygroundWelcomeOutput` / `getPlaygroundInputCapabilities` 的口径）：
 * 选了「文生图」就该显示「文本 → 图片」，显示模型的全部模态会把「图生图」的
 * 能力也算进来，与用户当下要发的那一枪对不上。
 */
import { useTranslation } from 'react-i18next'
import { CopyButton } from '@/components/ui/CopyButton'
import { OverflowTip } from '@/components/ui/OverflowTip'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { ModalityChip } from '@/features/models/components/ModalityMark'
import {
  MODALITY_CODES, cardSummary, currencySymbol, hasPricingGradient, modelVendorLabel,
  priceText, priceUnitSuffix, strikeOriginalPrice, withPriceFrom,
} from '@/features/models/model-format'
import { formatContextLength, formatNumber, prettyModelName, trimPriceZeros } from '@/lib/utils'
import { resolveModelCategory, type ExperienceTaskType } from './model-experience-data'
import type { CatalogModelItem } from '@/types'

interface SpecCell {
  key: string
  label: string
  /** 模态格：渲染「图标 + 标签」成对的 chip，其余格走 value */
  modalities?: string[]
  value?: string
  unit?: string
  /** 划线原价（含单位），仅促销且原价确实高于现价时才有，见 strikeOriginalPrice */
  strike?: string
  /** 价格格：原型 `.playground-welcome-specs dd.price` → success 绿 */
  isPrice?: boolean
}

/** 任务枚举恒为 `<输入>_to_<输出>`，输出侧直接劈出来（原型 getPlaygroundWelcomeOutput 同义） */
function taskOutputModality(task: ExperienceTaskType): string {
  return task.split('_to_')[1] ?? 'text'
}

/**
 * 输入侧模态。对话类要显示模型**支持的全部输入模态**（原型对 dialogue 取
 * model.modalities 交四模态；控制台有更准的 input_modalities，main 已优先用它），
 * 媒体类则只显示当前任务的输入（文生图=文本、图生图=图片）。
 */
function inputModalities(model: CatalogModelItem, task: ExperienceTaskType): string[] {
  if (resolveModelCategory(model) === 'dialogue') {
    return (model.input_modalities ?? model.modalities ?? []).filter((m) => MODALITY_CODES.includes(m))
  }
  const input = task.split('_to_')[0]
  return MODALITY_CODES.includes(input) ? [input] : []
}

export function ExperienceModelCard({ model, task }: { model: CatalogModelItem; task: ExperienceTaskType }) {
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

  // per_call（按张/按次）模型的每张价镜像在 input_per_1m（#851 契约），输出侧本就没有
  // token 价 —— 原型对这类模型也走同一对格子，输出价自然回落「—」，不另开一套版式。
  const input = withPriceFrom(priceText(model.pricing?.input_per_1m, symbol, isFree ? freeLabel : '—', unitSuffix, isFree), hasGradient)
  const output = withPriceFrom(priceText(model.pricing?.output_per_1m, symbol, isFree ? freeLabel : '—', unitSuffix, isFree), hasGradient)
  const strikeInput = strikeOriginalPrice(promo?.original_input_per_1m ?? promo?.original_price, model.pricing?.input_per_1m, isFree)
  const strikeOutput = strikeOriginalPrice(promo?.original_output_per_1m, model.pricing?.output_per_1m, isFree)

  // 顺序即版面：网格按行铺，左列 输入类型/输入价格/上下文窗口，右列 输出类型/输出价格/最大输出
  const cells: SpecCell[] = [
    { key: 'inputType', label: t('modelsExperience.modelCard.inputType'), modalities: inputModalities(model, task) },
    { key: 'outputType', label: t('modelsExperience.modelCard.outputType'), modalities: [taskOutputModality(task)] },
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
    {
      key: 'maxOutput',
      label: t('modelsExperience.modelCard.maxOutput'),
      // 广场规格条按 prd#348 撤掉过这一格（后端数据不可靠），原型这里要它；
      // 缺值用原型的兜底词「按接口约定」，不编一个 4096 默认值糊上去。
      value: (model.max_output_tokens ?? 0) > 0
        ? `${formatNumber(model.max_output_tokens)} ${t('modelsExperience.modelCard.tokens')}`
        : t('modelsExperience.modelCard.maxOutputByApi'),
    },
  ]

  return (
    <article className="mg-tile models-experience-model-card" aria-label={t('modelsExperience.modelCard.aria', { name })}>
      <header className="models-experience-model-card-head">
        {/* 档位与圆角照控制台同类模块「模型详情 hero」（ModelDetailPanel:215），
            48px 也正好是原型 .playground-model-avatar 的尺寸 */}
        <ModelIcon model={model} variant="hero" rounded="rounded-sm" className="models-experience-model-card-avatar" />
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
            {/* 原型头部只画了「免费」一种角标；折扣角标是补的——真实数据里促销模型会渲染
                划线原价，没有角标解释就成了两个价干瞪眼。文案沿用广场口径。 */}
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
            <dd className={cell.modalities ? 'is-modality' : cell.isPrice ? 'is-price' : undefined}>
              {cell.modalities
                ? cell.modalities.map((m) => (
                    <ModalityChip key={m} m={m} label={t(`modelsCatalog.modality.${m}`)} />
                  ))
                : (
                  <>
                    {/* 值可能很长：省略号打在真实文本上，截断时悬停显全文；
                        单位与划线原价不参与截断，否则先被裁的是读价必需的「/M Tokens」 */}
                    <OverflowTip text={cell.value || '—'} className="models-experience-model-card-spec-main" />
                    {cell.unit && <i>{cell.unit}</i>}
                    {cell.strike && <s>{cell.strike}</s>}
                  </>
                )}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  )
}
