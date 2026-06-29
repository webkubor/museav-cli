/**
 * 模型卡片（宽横向，参考国外官网 SharedModelCard 的视觉）
 * 适配控制台数据 CatalogModelItem + --mg-* token + ModelIcon。
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LuCopy, LuCheck, LuFileText, LuImage, LuMic, LuVideo,
  LuBrain, LuMapPin, LuGlobe, LuZap, LuWrench, LuTag, LuChevronRight, LuGitCompareArrows,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { useCopy } from '@/hooks/use-copy'
import { appToast } from '@/lib/app-toast'
import { formatContextLength, formatModelPrice, prettyModelName } from '@/lib/utils'
import type { CatalogModelItem } from '@/types'

const MODALITY_ICON: Record<string, IconType> = { text: LuFileText, image: LuImage, audio: LuMic, video: LuVideo }
const MODALITY_LABEL: Record<'zh' | 'en', Record<string, string>> = {
  zh: { text: '文本', image: '图像', audio: '音频', video: '视频' },
  en: { text: 'Text', image: 'Image', audio: 'Audio', video: 'Video' },
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

const MODALITY_CODES = ['text', 'image', 'audio', 'video']
// 内部/无意义标签：不当用户向能力标签展示
const TAG_DENYLIST = new Set(['modelgo_tool', 'test', 'free', 'internal', 'tool'])

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] font-medium uppercase tracking-wide" style={{ color: 'var(--mg-text-2)' }}>
        {label}
      </span>
      <span
        className="text-[15px] font-bold leading-none tracking-tight"
        style={{ color: accent ? 'var(--brand-base)' : 'var(--mg-text-0)' }}
      >
        {value}
      </span>
    </div>
  )
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

  // 0 / 缺失的 token 指标显示「—」，不堆一排 0
  const fmtTok = (n?: number) => (n && n > 0 ? formatContextLength(n) : '—')
  const currency = model.pricing?.currency
  const isFree =
    Number(model.pricing?.input_per_1m ?? 0) === 0 && Number(model.pricing?.output_per_1m ?? 0) === 0
  const cacheRead = Number(model.pricing?.cache_read_per_1m ?? 0)
  const released = model.released_at?.slice(0, 10)

  const modalities = (model.modalities ?? []).filter((m) => MODALITY_CODES.includes(m))
  const vendorish = new Set([model.provider, model.vendor].filter(Boolean).map((s) => String(s).toLowerCase()))
  const capabilities = (model.tags ?? [])
    .filter((tg) => !MODALITY_CODES.includes(tg))
    .filter((tg) => !TAG_DENYLIST.has(tg.toLowerCase()) && !vendorish.has(tg.toLowerCase()))
    .slice(0, 6)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (await copy(model.model_id)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } else {
      appToast.error(t('modelsCatalog.toast.copyFailed'))
    }
  }

  return (
    <article
      onClick={() => navigate(`/models/${model.id}`)}
      className="catalog-card group relative cursor-pointer overflow-hidden rounded-[14px] border px-5 py-4 transition-all duration-300 ease-out hover:-translate-y-[2px]"
      style={{ background: 'var(--mg-bg-0)' }}
    >
      {/* hover 顶部高光线 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: 'linear-gradient(90deg, transparent, var(--brand-base), transparent)' }}
      />

      <div className="flex flex-col gap-3.5">
        {/* 行1：图标 + 名称 + 免费徽章 + 调用 id */}
        <div className="flex min-w-0 items-center gap-3">
          <ModelIcon model={model} size={36} rounded="rounded-[10px]" className="shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[16px] font-semibold leading-tight tracking-tight" style={{ color: 'var(--mg-text-0)' }} title={prettyModelName(model.display_name, model.model_id)}>
                {prettyModelName(model.display_name, model.model_id)}
              </h3>
              {isFree && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: 'color-mix(in oklab, var(--brand-base) 14%, transparent)', color: 'var(--brand-base)' }}>
                  <span className="h-1 w-1 rounded-full" style={{ background: 'var(--brand-base)' }} />
                  {isZh ? '免费' : 'Free'}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[12px]" style={{ color: 'var(--mg-text-2)' }}>
              <code className="truncate font-mono">{model.model_id}</code>
              <button type="button" onClick={handleCopy} className="shrink-0 cursor-pointer rounded p-0.5 transition-colors hover:text-[color:var(--brand-base)]" aria-label={isZh ? '复制 API ID' : 'Copy API ID'}>
                {copied ? <LuCheck size={11} style={{ color: 'var(--brand-base)' }} /> : <LuCopy size={11} />}
              </button>
            </div>
          </div>
        </div>

        {/* 行2：指标横排 */}
        <div className="flex flex-wrap items-end gap-x-7 gap-y-2.5">
          <Stat label={isZh ? '上下文' : 'Context'} value={fmtTok(model.context_length)} />
          {model.max_output_tokens > 0 && (
            <Stat label={isZh ? '最大输出' : 'Max output'} value={fmtTok(model.max_output_tokens)} />
          )}
          <Stat label={isZh ? '输入' : 'Input'} value={formatModelPrice(model.pricing?.input_per_1m, currency)} accent />
          <Stat label={isZh ? '输出' : 'Output'} value={formatModelPrice(model.pricing?.output_per_1m, currency)} accent />
          {cacheRead > 0 && (
            <Stat label={isZh ? '缓存读取' : 'Cache read'} value={formatModelPrice(model.pricing?.cache_read_per_1m, currency)} accent />
          )}
        </div>

        {/* 行3：模态 + 能力标签 + 发布日期 */}
        {(modalities.length > 0 || capabilities.length > 0 || released) && (
          <div className="flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: 'var(--mg-border)' }}>
            <div className="flex flex-wrap items-center gap-1.5">
              {modalities.map((m) => {
                const Icon = MODALITY_ICON[m]
                return (
                  <span key={`mod-${m}`} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium" style={{ background: 'var(--mg-fill-1)', color: 'var(--mg-text-1)' }}>
                    {Icon && <Icon size={12} />}
                    {MODALITY_LABEL[isZh ? 'zh' : 'en'][m] ?? m}
                  </span>
                )
              })}
              {capabilities.map((tag) => {
                const TagIcon = tagIcon(tag)
                return (
                  <span key={`cap-${tag}`} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium" style={{ borderColor: 'color-mix(in oklab, var(--brand-base) 45%, transparent)', background: 'color-mix(in oklab, var(--brand-base) 12%, transparent)', color: 'var(--brand-base)' }}>
                    <TagIcon size={12} />
                    {tag}
                  </span>
                )
              })}
            </div>
            {released && <span className="shrink-0 text-[11px]" style={{ color: 'var(--mg-text-2)' }}>{released}</span>}
          </div>
        )}

        {/* 行4：操作 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => onTry(model.model_id, e)}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--brand-base)' }}
          >
            {t('modelsCatalog.button.try')}
            <LuChevronRight size={13} />
          </button>
          {canCompare && onCompare && (
            <button
              type="button"
              onClick={onCompare}
              className="inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-[13px] transition-colors hover:bg-[color:var(--mg-fill-1)]"
              style={{ borderColor: 'var(--mg-border)', color: 'var(--mg-text-1)' }}
            >
              <LuGitCompareArrows size={13} />
              {t('modelsCatalog.button.compareShort')}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
