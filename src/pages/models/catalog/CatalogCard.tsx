/**
 * 模型卡片（横向分栏，对齐设计稿）：
 * 左 = 圆形图标 + 名称/免费徽章 + 官方供应商 + 能力标签
 * 中 = 上下文长度 / 输入价格 / 输出价格 三列
 * 右 = 立即体验 + API文档/对比模型；右上角收藏 ♡（localStorage 持久化）
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LuCopy, LuCheck, LuFileText, LuImage, LuMic, LuVideo,
  LuBrain, LuMapPin, LuGlobe, LuZap, LuWrench, LuTag, LuChevronRight,
  LuGitCompareArrows, LuBadgeCheck, LuHeart,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { useCopy } from '@/hooks/use-copy'
import { appToast } from '@/lib/app-toast'
import { formatContextLength, prettyModelName } from '@/lib/utils'
import type { CatalogModelItem } from '@/types'

const MODALITY_ICON: Record<string, IconType> = { text: LuFileText, image: LuImage, audio: LuMic, video: LuVideo }
const MODALITY_LABEL: Record<'zh' | 'en', Record<string, string>> = {
  zh: { text: '文本', image: '图像', audio: '音频', video: '视频' },
  en: { text: 'Text', image: 'Image', audio: 'Audio', video: 'Video' },
}
const MODALITY_CODES = ['text', 'image', 'audio', 'video']
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

function priceText(amount: number | string | null | undefined, symbol: string, isZh: boolean) {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (amount == null || amount === '' || Number.isNaN(n) || (n ?? 0) <= 0) {
    return { value: isZh ? '免费' : 'Free', unit: '' }
  }
  return { value: `${symbol} ${amount}`, unit: '/1M tokens' }
}

interface Props {
  model: CatalogModelItem
  isZh: boolean
  onTry: (modelId: string, e: React.MouseEvent) => void
  onCompare?: (e: React.MouseEvent) => void
  canCompare: boolean
}

export function CatalogCard({ model, isZh, onTry, onCompare, canCompare }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { copy } = useCopy()
  const [copied, setCopied] = useState(false)
  const [fav, setFav] = useState(() => readFavs().has(model.id))

  const symbol = CCY_SYMBOL[(model.pricing?.currency || '').toUpperCase()] || model.pricing?.currency || (isZh ? '¥' : '$')
  const ctxValue = (model.context_length ?? 0) > 0 ? formatContextLength(model.context_length) : '—'
  const isFree =
    Number(model.pricing?.input_per_1m ?? 0) === 0 && Number(model.pricing?.output_per_1m ?? 0) === 0
  const name = prettyModelName(model.display_name, model.model_id)
  const provider = model.provider || model.vendor

  const modalities = (model.modalities ?? []).filter((m) => MODALITY_CODES.includes(m))
  const vendorish = new Set([model.provider, model.vendor].filter(Boolean).map((s) => String(s).toLowerCase()))
  const capabilities = (model.tags ?? [])
    .filter((tg) => !MODALITY_CODES.includes(tg))
    .filter((tg) => !TAG_DENYLIST.has(tg.toLowerCase()) && !vendorish.has(tg.toLowerCase()))
  const chips = [
    ...modalities.map((m) => ({ key: `m-${m}`, icon: MODALITY_ICON[m], label: MODALITY_LABEL[isZh ? 'zh' : 'en'][m] ?? m })),
    ...capabilities.map((c) => ({ key: `c-${c}`, icon: tagIcon(c), label: c })),
  ]
  const shownChips = chips.slice(0, 5)

  const input = priceText(model.pricing?.input_per_1m, symbol, isZh)
  const output = priceText(model.pricing?.output_per_1m, symbol, isZh)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (await copy(model.model_id)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } else {
      appToast.error(t('modelsCatalog.toast.copyFailed'))
    }
  }
  const toggleFav = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !fav
    setFav(next)
    writeFav(model.id, next)
  }

  return (
    <article className="mg-card" onClick={() => navigate(`/models/${model.id}`)}>
      <button
        type="button"
        onClick={toggleFav}
        className={`mg-card-fav ${fav ? 'is-on' : ''}`}
        aria-pressed={fav}
        aria-label={isZh ? '收藏' : 'Favorite'}
      >
        <LuHeart size={16} fill={fav ? 'currentColor' : 'none'} />
      </button>

      {/* 左：身份 */}
      <div className="mg-card-id">
        <ModelIcon model={model} size={52} rounded="rounded-full" className="mg-card-avatar" />
        <div className="mg-card-id-text">
          <div className="mg-card-name-row">
            <h3 className="mg-card-name" title={name}>{name}</h3>
            {isFree && (
              <span className="mg-card-free">
                <span className="mg-card-free-dot" />
                {isZh ? '免费' : 'Free'}
              </span>
            )}
          </div>
          {provider && (
            <div className="mg-card-provider">
              <span className="truncate">{provider}</span>
              <LuBadgeCheck size={13} className="mg-card-verified" />
              <span className="mg-card-api">
                <code className="font-mono">{model.model_id}</code>
                <button type="button" onClick={handleCopy} className="mg-card-copy" aria-label={isZh ? '复制 API ID' : 'Copy API ID'}>
                  {copied ? <LuCheck size={11} /> : <LuCopy size={11} />}
                </button>
              </span>
            </div>
          )}
          {shownChips.length > 0 && (
            <div className="mg-card-tags">
              {shownChips.map(({ key, icon: Icon, label }) => (
                <span key={key} className="mg-card-tag">
                  {Icon && <Icon size={11} />}
                  {label}
                </span>
              ))}
              {chips.length > shownChips.length && <span className="mg-card-tag-more">···</span>}
            </div>
          )}
        </div>
      </div>

      {/* 中：指标 */}
      <div className="mg-card-metrics">
        <Metric label={isZh ? '上下文长度' : 'Context'} value={ctxValue} />
        <Metric label={isZh ? '输入价格' : 'Input'} value={input.value} unit={input.unit} accent />
        <Metric label={isZh ? '输出价格' : 'Output'} value={output.value} unit={output.unit} accent />
      </div>

      {/* 右：操作 */}
      <div className="mg-card-actions">
        <button type="button" onClick={(e) => onTry(model.model_id, e)} className="mg-card-cta">
          {t('modelsCatalog.button.try')}
          <LuChevronRight size={14} />
        </button>
        <div className="mg-card-links">
          <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/models/${model.id}`) }}>
            {isZh ? 'API 文档' : 'API docs'}
          </button>
          {canCompare && onCompare && (
            <>
              <span className="mg-card-links-sep" />
              <button type="button" onClick={onCompare}>
                <LuGitCompareArrows size={12} />
                {isZh ? '对比模型' : 'Compare'}
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  )
}

function Metric({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: boolean }) {
  return (
    <div className="mg-metric">
      <span className="mg-metric-label">{label}</span>
      <span className="mg-metric-value" style={accent ? { color: 'var(--brand-base)' } : undefined}>
        {value}
        {unit && <small className="mg-metric-unit">{unit}</small>}
      </span>
    </div>
  )
}
