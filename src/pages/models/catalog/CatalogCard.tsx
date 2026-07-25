/**
 * 模型卡片（等高网格卡）。
 *
 * 信息顺序：图标 + 角标 → 名称/厂商/API ID → 简介 → 输入→输出模态流 → API 协议 →
 * 能力标签 → 价格规格（贴底）→ 操作。
 *
 * 两条硬约束:
 * 1) 卡片等高、价格贴底 —— 简介长度不同不能把价格行推得高低不齐（靠 flex + margin-top:auto）。
 * 2) 角标与心形收藏同处右上角，必须互相避让：收藏绝对定位在角上，角标在顶行内右
 *    对齐并留出收藏的宽度。收藏是既有功能（localStorage，无后端），按既定决策保持
 *    现状、不随原型删除。
 *
 * 促销双价：original_price 是划线装饰，pricing 里的价格才是真实扣费价。promotion
 * 字段**存在即代表此刻生效**（服务端用服务端时钟判定，接口刻意不下发时间窗口），
 * 前端不得按时间自行推算。
 *
 * 容器用 .mg-tile/.mg-tile-hover（DESIGN.md 的卡片语言，走 --radius-md 与
 * --mg-card-* token），不再手写 border/shadow/裸数值圆角；主操作用
 * <Button variant="brand">。
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LuFileText, LuImage, LuMic, LuVideo, LuArrowRight,
  LuBrain, LuMapPin, LuGlobe, LuZap, LuWrench, LuTag,
  LuGitCompareArrows, LuBadgeCheck, LuHeart, LuSparkles,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { CopyButton } from '@/components/ui/CopyButton'
import { Button } from '@/components/ui/Button'
import { formatContextLength, prettyModelName } from '@/lib/utils'
import type { CatalogModelItem } from '@/types'

const MODALITY_ICON: Record<string, IconType> = { text: LuFileText, image: LuImage, audio: LuMic, video: LuVideo }
const MODALITY_CODES = ['text', 'image', 'audio', 'video']
/**
 * 内部标签黑名单。**目标是删掉它** —— 能力标签应由后端 model_tags 的 capability
 * 分组决定（facets 已按该分组下发）。等各环境能力字典 seed 完成、tags 里不再混入
 * 这些值之后即可移除。
 */
const TAG_DENYLIST = new Set(['modelgo_tool', 'test', 'free', 'internal', 'tool'])

function tagIcon(tag: string): IconType {
  const t = tag.toLowerCase()
  if (t.includes('reason') || tag.includes('推理')) return LuBrain
  if (t.includes('region') || tag.includes('区域') || tag.includes('境内')) return LuMapPin
  if (t.includes('cache') || tag.includes('缓存')) return LuZap
  if (t.includes('search') || tag.includes('搜索') || tag.includes('联网')) return LuGlobe
  if (t.includes('function') || t.includes('tool') || tag.includes('函数') || tag.includes('工具')) return LuWrench
  return LuTag
}

// 收藏：localStorage 本地持久化（无后端，纯本地标记）
const FAV_KEY = 'modelgo_fav_models'
function readFavs(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]') as string[]) } catch { return new Set() }
}
function writeFav(id: string, on: boolean) {
  const s = readFavs()
  if (on) s.add(id); else s.delete(id)
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...s])) } catch { /* 忽略隐私模式写入失败 */ }
}

// 货币代码 → 符号（后端给的是 CNY/USD 这类代码）
const CCY_SYMBOL: Record<string, string> = { CNY: '¥', RMB: '¥', USD: '$', EUR: '€', '¥': '¥', $: '$' }

/** 计价单位后缀。price_unit 为空表示按每 1M token 计价（对话模型）。 */
function priceUnitSuffix(priceUnit: string | undefined): string {
  return priceUnit ? `/${priceUnit}` : '/1M tokens'
}

function priceText(
  amount: number | string | null | undefined,
  symbol: string,
  freeLabel: string,
  unitSuffix: string,
) {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (amount == null || amount === '' || Number.isNaN(n) || (n ?? 0) <= 0) {
    return { value: freeLabel, unit: '' }
  }
  return { value: `${symbol} ${amount}`, unit: unitSuffix }
}

const PROTOCOL_LABEL: Record<string, string> = { openai: 'OpenAI', anthropic: 'Anthropic', other: 'Other' }

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
}

export function CatalogCard({
  model, isZh, onTry, onCompare, canCompare, onPickProtocol, onPickCapability,
}: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [fav, setFav] = useState(() => readFavs().has(model.id))

  const detailHref = `/models/${model.slug || model.id}`
  const symbol = CCY_SYMBOL[(model.pricing?.currency || '').toUpperCase()] || model.pricing?.currency || (isZh ? '¥' : '$')
  const ctxValue = (model.context_length ?? 0) > 0 ? formatContextLength(model.context_length) : '—'
  const name = prettyModelName(model.display_name, model.model_id)
  const provider = model.provider || model.vendor
  const promo = model.promotion
  // free 只认服务端的显式限免标记，不从「价格为 0」推断 —— 未配价的模型也是 0。
  const isFree = Boolean(promo?.free)

  const unitSuffix = priceUnitSuffix(model.price_unit)
  const freeLabel = t('modelsCatalog.card.free')
  const input = priceText(model.pricing?.input_per_1m, symbol, freeLabel, unitSuffix)
  const output = priceText(model.pricing?.output_per_1m, symbol, freeLabel, unitSuffix)

  // 输入 → 输出模态流。后端拆分下发；老数据只有合并 modalities 时退回并集。
  const inputMods = (model.input_modalities ?? model.modalities ?? []).filter((m) => MODALITY_CODES.includes(m))
  const outputMods = (model.output_modalities ?? model.modalities ?? []).filter((m) => MODALITY_CODES.includes(m))

  const vendorish = new Set([model.provider, model.vendor].filter(Boolean).map((s) => String(s).toLowerCase()))
  const capabilities = (model.tags ?? [])
    .filter((tg) => !MODALITY_CODES.includes(tg))
    .filter((tg) => !TAG_DENYLIST.has(tg.toLowerCase()) && !vendorish.has(tg.toLowerCase()))
    .slice(0, 3)

  const discountLabel = isZh ? promo?.discount_label : (promo?.discount_label_en || promo?.discount_label)
  const summary = model.tagline || ''

  const toggleFav = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !fav
    setFav(next)
    writeFav(model.id, next)
  }

  return (
    <article className="mg-tile mg-tile-hover mg-mcard" onClick={() => navigate(detailHref)}>
      <button
        type="button"
        onClick={toggleFav}
        className={`mg-mcard-fav ${fav ? 'is-on' : ''}`}
        aria-pressed={fav}
        aria-label={t('modelsCatalog.card.favorite')}
      >
        <LuHeart size={15} fill={fav ? 'currentColor' : 'none'} />
      </button>

      {/* 顶行：图标 + 角标（右对齐，留出收藏按钮位置） */}
      <div className="mg-mcard-top">
        <ModelIcon model={model} size={38} rounded="rounded-full" className="mg-mcard-avatar" />
        <div className="mg-mcard-badges">
          {model.is_new && (
            <em className="mg-badge is-new">
              <LuSparkles size={10} />
              {isZh ? '最新' : 'New'}
            </em>
          )}
          {isFree ? (
            <em className="mg-badge is-free">{isZh ? '限时免费' : 'Free'}</em>
          ) : discountLabel ? (
            <em className="mg-badge is-discount">{discountLabel}</em>
          ) : null}
        </div>
      </div>

      {/* 身份 */}
      <div className="mg-mcard-id">
        <h3 className="mg-mcard-name" title={name}>{name}</h3>
        <div className="mg-mcard-meta" onClick={(e) => e.stopPropagation()}>
          {provider && (
            <>
              <span className="truncate">{provider}</span>
              <LuBadgeCheck size={12} className="mg-mcard-verified" />
            </>
          )}
          <code className="mg-mcard-api font-mono">{model.model_id}</code>
          <CopyButton
            value={model.model_id}
            aria-label={t('modelsCatalog.card.copyApiId')}
            toast={false}
            className="h-5 w-5 shrink-0"
          />
        </div>
      </div>

      {/* 简介：最多两行 */}
      {summary && <p className="mg-mcard-desc">{summary}</p>}

      {/* 输入 → 输出模态流 */}
      {(inputMods.length > 0 || outputMods.length > 0) && (
        <div
          className="mg-mcard-flow"
          aria-label={
            isZh
              ? `输入 ${inputMods.map((m) => t(`modelsCatalog.modality.${m}`)).join('、')}，输出 ${outputMods.map((m) => t(`modelsCatalog.modality.${m}`)).join('、')}`
              : `input ${inputMods.join(', ')} to output ${outputMods.join(', ')}`
          }
        >
          <span className="mg-mcard-flow-group">
            {inputMods.map((m) => {
              const Icon = MODALITY_ICON[m]
              return <Icon key={`i-${m}`} size={12} title={t(`modelsCatalog.modality.${m}`)} />
            })}
          </span>
          <LuArrowRight size={13} className="mg-mcard-flow-arrow" aria-hidden />
          <span className="mg-mcard-flow-group">
            {outputMods.map((m) => {
              const Icon = MODALITY_ICON[m]
              return <Icon key={`o-${m}`} size={12} title={t(`modelsCatalog.modality.${m}`)} />
            })}
          </span>
        </div>
      )}

      {/* API 协议：可点击反查筛选 */}
      {(model.protocols ?? []).length > 0 && (
        <div className="mg-mcard-protocols" aria-label={isZh ? 'API 协议' : 'API protocol'}>
          {(model.protocols ?? []).map((p) => (
            <button
              key={p}
              type="button"
              className={`mg-proto is-${p}`}
              title={isZh ? `筛选：${PROTOCOL_LABEL[p] ?? p}` : `Filter: ${PROTOCOL_LABEL[p] ?? p}`}
              onClick={(e) => { e.stopPropagation(); onPickProtocol?.(p) }}
              disabled={!onPickProtocol}
            >
              {p === 'other' ? (isZh ? '其他协议' : 'Other') : PROTOCOL_LABEL[p] ?? p}
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

      {/* 贴底：价格规格 */}
      <div className="mg-mcard-specs">
        <Metric label={t('modelsCatalog.card.context')} value={ctxValue} />
        <Metric
          label={t('modelsCatalog.card.input')}
          value={input.value}
          unit={input.unit}
          strike={promo?.original_price ? `${symbol} ${promo.original_price}` : undefined}
          accent
        />
        <Metric label={t('modelsCatalog.card.output')} value={output.value} unit={output.unit} accent />
      </div>

      {/* 操作：hover / 键盘聚焦时浮出，覆盖最底一行，不改变卡片高度 */}
      <div className="mg-mcard-actions">
        <Button variant="brand" size="sm" onClick={(e) => onTry(model.model_id, e)}>
          {t('modelsCatalog.button.try')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => { e.stopPropagation(); navigate(detailHref) }}
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
            <LuGitCompareArrows size={14} />
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
      </span>
      {/* 划线原价：仅在有促销时渲染，是装饰而非真实价格 */}
      {strike && <s className="mg-metric-strike">{strike}</s>}
    </div>
  )
}
