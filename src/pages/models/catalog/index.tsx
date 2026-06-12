/**
 * 模型目录页
 * 路由：/models/catalog
 * API：GET /api/v1/catalog/models、GET /api/v1/catalog/model-tags、GET /api/v1/usage/rankings/models
 */

import { useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  LuArrowUpRight,
  LuBookOpen,
  LuBoxes,
  LuBuilding2,
  LuCheck,
  LuChevronRight,
  LuCopy,
  LuFileText,
  LuGitCompareArrows,
  LuImage,
  LuSearch,
  LuSlidersHorizontal,
  LuSparkles,
  LuTag,
  LuVideo,
  LuZap,
} from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getMarketConfig } from '@/config/market'
import { useModels } from '@/features/models/hooks/useModels'
import { ModelIcon, type ModelIconLike } from '@/features/models/components/ModelIcon'
import { ModalityBadge } from '@/features/models/components/ModalityBadge'
import { useCopy } from '@/hooks/use-copy'
import { useMarket } from '@/hooks/useMarket'
import { useCurrency } from '@/hooks/use-platform-config'
import { appToast } from '@/lib/app-toast'
import { cn, formatContextLength, formatModelPrice } from '@/lib/utils'
import { listModelTags } from '@/services/catalog'
import { getUsageRankingsModels } from '@/services/usage'
import { useAuthStore } from '@/store/auth'
import type { CatalogModelItem, UsageRankingItem } from '@/types'
import { ModelsCompareModal } from '../components/ModelsCompareModal'
import './catalog.css'

interface ModelMeta {
  descriptionZh: string
  descriptionEn: string
  tagsZh: string[]
  tagsEn: string[]
  scores: {
    speed: number
    reasoning: number
    cost: number
  }
}

type InsightTone = 'emerald' | 'cyan' | 'violet' | 'amber'

interface RankingViewItem {
  rank: string
  name: string
  requests: number
  score: string
  tone: InsightTone
  iconModel: ModelIconLike
}

const MODALITY_FILTERS = [
  { code: 'text', nameZh: '文本生成', nameEn: 'Text' },
  { code: 'image', nameZh: '图像生成', nameEn: 'Image' },
  { code: 'audio', nameZh: '音频生成', nameEn: 'Audio' },
  { code: 'video', nameZh: '视频生成', nameEn: 'Video' },
] as const

const MODEL_META_MAP: Record<string, ModelMeta> = {
  'qwen/qwen3.7-max': {
    descriptionZh: '适合中文长上下文，复杂推理与企业知识库检索。',
    descriptionEn: 'Tailored for long Chinese context, complex reasoning, and enterprise knowledge base retrieval.',
    tagsZh: ['客服知识库', '代码理解', '长文档分析'],
    tagsEn: ['Customer Support', 'Code Analysis', 'Long Document'],
    scores: { speed: 2, reasoning: 3, cost: 2 },
  },
  'qwen/qwen3.6-flash': {
    descriptionZh: '极速响应的轻量级模型，适合高频对话、文本分类及实时交互。',
    descriptionEn: 'Ultra-fast lightweight model, ideal for high-frequency chats, classification, and real-time interactions.',
    tagsZh: ['即时客服', '日常对话', '文本分类'],
    tagsEn: ['Live Chat', 'General Chat', 'Classification'],
    scores: { speed: 4, reasoning: 1, cost: 4 },
  },
  'openai/gpt-5.5': {
    descriptionZh: '前沿的通用智能旗舰模型，在逻辑推理、代码生成与多模态任务中表现卓越。',
    descriptionEn: 'Cutting-edge flagship general model, excelling in logic, code generation, and multimodal tasks.',
    tagsZh: ['复杂逻辑', '智能Agent', '多模态交互'],
    tagsEn: ['Complex Logic', 'AI Agents', 'Multimodal'],
    scores: { speed: 3, reasoning: 4, cost: 1 },
  },
  'anthropic/claude-opus-4.7-fast': {
    descriptionZh: '长文本理解与精细逻辑的代表作，适合深度阅读、学术分析及复杂指令遵循。',
    descriptionEn: 'Masterpiece of long context and fine-grained logic, perfect for reading comprehension and complex instructions.',
    tagsZh: ['论文精读', '长文本分析', '高精指令'],
    tagsEn: ['Paper Reading', 'Long Text', 'Fine Instruction'],
    scores: { speed: 3, reasoning: 4, cost: 1 },
  },
  'mistralai/mistral-medium-3-5': {
    descriptionZh: '欧洲明星大模型，平衡了出色的推理能力与合理的运行成本。',
    descriptionEn: 'European star model balancing outstanding reasoning capabilities with reasonable operation costs.',
    tagsZh: ['内容创作', '逻辑分析', '多语言翻译'],
    tagsEn: ['Content Creation', 'Logic Analysis', 'Translation'],
    scores: { speed: 3, reasoning: 3, cost: 3 },
  },
}

function getModelMeta(modelId: string, isZh: boolean) {
  const matched = MODEL_META_MAP[modelId]
  if (matched) {
    return {
      description: isZh ? matched.descriptionZh : matched.descriptionEn,
      tags: isZh ? matched.tagsZh : matched.tagsEn,
      scores: matched.scores,
    }
  }

  const idLower = modelId.toLowerCase()
  const isReasoning = idLower.includes('reason') || idLower.includes('think') || idLower.includes('opus') || idLower.includes('max')
  const isFlash = idLower.includes('flash') || idLower.includes('speed') || idLower.includes('lite') || idLower.includes('mini')

  let speed = 3
  let reasoning = 2
  let cost = 3

  if (isReasoning) {
    speed = 2
    reasoning = 4
    cost = 1
  } else if (isFlash) {
    speed = 4
    reasoning = 1
    cost = 4
  }

  return {
    description: isZh
      ? '支持高并发的多功能通用智能模型，可灵活对接企业级生产业务。'
      : 'A versatile general model supporting high concurrency and flexible business integration.',
    tags: isZh
      ? ['业务对接', '接口测试', '快速集成']
      : ['Business Integration', 'API Testing', 'Fast Setup'],
    scores: { speed, reasoning, cost },
  }
}

function parsePrice(amount: string | number | null | undefined) {
  if (amount == null || amount === '') return 0
  const parsed = typeof amount === 'string' ? Number.parseFloat(amount) : amount
  return Number.isFinite(parsed) ? parsed : 0
}

function getModelMinPrice(model: CatalogModelItem) {
  const input = parsePrice(model.pricing?.input_per_1m)
  const output = parsePrice(model.pricing?.output_per_1m)
  if (input <= 0 && output <= 0) return 0
  if (input <= 0) return output
  if (output <= 0) return input
  return Math.min(input, output)
}

function isFreeModel(model: CatalogModelItem) {
  const tags = (model.tags ?? []).map((tag) => tag.toLowerCase())
  return tags.includes('free') || getModelMinPrice(model) <= 0
}

function isComparableModel(model: CatalogModelItem) {
  const modalities = model.modalities ?? []
  return !modalities.some((modality) => modality === 'image' || modality === 'audio' || modality === 'video')
}

function getReleaseTime(model: CatalogModelItem) {
  const time = Date.parse(model.released_at)
  return Number.isFinite(time) ? time : 0
}

function getStatusLabel(status: string, isZh: boolean) {
  if (status === 'enabled') return isZh ? '可用' : 'Available'
  if (status === 'disabled') return isZh ? '停用' : 'Disabled'
  if (status === 'test') return 'Test'
  return status || (isZh ? '可用' : 'Available')
}

export default function ModelsCatalogPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const isZh = i18n.language.startsWith('zh')
  const market = useMarket()
  const docsUrl = getMarketConfig(market).docsUrl

  const [category, setCategory] = useState<string>('all')
  const [isCompareOpen, setIsCompareOpen] = useState(false)
  const [compareInitialIds, setCompareInitialIds] = useState<string[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const { copy } = useCopy()

  const {
    search,
    setSearch,
    modelsQuery,
    filteredModels,
  } = useModels()

  const tagsQuery = useQuery({
    queryKey: ['catalog-model-tags'],
    queryFn: () => listModelTags(true),
    staleTime: 5 * 60_000,
  })

  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''
  const { symbol: currencySymbol } = useCurrency()
  const allModels = useMemo(() => modelsQuery.data?.items ?? [], [modelsQuery.data?.items])
  const comparableModels = useMemo(() => allModels.filter(isComparableModel), [allModels])
  const apiTags = useMemo(() => tagsQuery.data?.items ?? [], [tagsQuery.data?.items])

  const modalityFilters = useMemo(() => {
    const existingTagCodes = new Set(apiTags.map((tag) => tag.code.toLowerCase()))
    const existingModalities = new Set(allModels.flatMap((model) => model.modalities ?? []))
    return MODALITY_FILTERS.filter((item) =>
      existingModalities.has(item.code) && !existingTagCodes.has(item.code)
    )
  }, [allModels, apiTags])

  const visibleModels = useMemo(() => {
    if (category === 'all') return filteredModels
    return filteredModels.filter((model) =>
      model.tags?.some((tag) => tag.toLowerCase() === category.toLowerCase()) ||
      model.modalities?.includes(category)
    )
  }, [category, filteredModels])

  const catalogStats = useMemo(() => {
    const vendorCount = new Set(allModels.map((model) => model.vendor).filter(Boolean)).size
    const countByModality = (modality: string) =>
      allModels.filter((model) => model.modalities?.includes(modality)).length

    return [
      { key: 'models', label: t('modelsCatalog.stats.models'), value: allModels.length, Icon: LuBoxes },
      { key: 'vendors', label: t('modelsCatalog.stats.vendors'), value: vendorCount, Icon: LuBuilding2 },
      { key: 'text', label: t('modelsCatalog.stats.text'), value: countByModality('text'), Icon: LuFileText },
      { key: 'image', label: t('modelsCatalog.stats.image'), value: countByModality('image'), Icon: LuImage },
      { key: 'video', label: t('modelsCatalog.stats.video'), value: countByModality('video'), Icon: LuVideo },
      { key: 'free', label: t('modelsCatalog.stats.free'), value: allModels.filter(isFreeModel).length, Icon: LuTag },
    ]
  }, [allModels, t])

  const { data: rankingsData } = useQuery({
    queryKey: ['usage-rankings', 'models', tenantId],
    queryFn: () => {
      const now = new Date()
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      return getUsageRankingsModels({ from: from.toISOString(), to: now.toISOString(), limit: 5 })
    },
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
  })

  const rankingItems = useMemo<RankingViewItem[]>(() => {
    const tones: InsightTone[] = ['emerald', 'cyan', 'violet', 'amber']
    const iconMap = new Map<string, ModelIconLike>()
    for (const model of allModels) {
      iconMap.set(model.model_id, {
        logo_url: model.logo_url,
        vendor: model.vendor,
        display_name: model.display_name,
      })
    }
    return (rankingsData?.items ?? []).map((item: UsageRankingItem, index: number) => {
      const amount = item.spend?.amount ? `${currencySymbol}${Number.parseFloat(item.spend.amount).toFixed(4)}` : '—'
      const key = item.key ?? ''
      return {
        rank: String(item.rank ?? index + 1).padStart(2, '0'),
        name: item.name || key || '—',
        requests: item.requests ?? 0,
        score: amount,
        tone: tones[index % tones.length],
        iconModel: iconMap.get(key) ?? { display_name: item.name || key, vendor: key.split('/')[0] },
      }
    })
  }, [rankingsData, allModels, currencySymbol])

  const fallbackRankingItems = useMemo<RankingViewItem[]>(() => {
    const tones: InsightTone[] = ['emerald', 'cyan', 'violet', 'amber']
    return allModels.slice(0, 5).map((model, index) => ({
      rank: String(index + 1).padStart(2, '0'),
      name: model.display_name || model.model_id,
      requests: 0,
      score: '—',
      tone: tones[index % tones.length],
      iconModel: model,
    }))
  }, [allModels])

  const lowCostModels = useMemo(
    () => [...allModels].sort((a, b) => getModelMinPrice(a) - getModelMinPrice(b)).slice(0, 3),
    [allModels],
  )

  const recentModels = useMemo(
    () => [...allModels].sort((a, b) => getReleaseTime(b) - getReleaseTime(a)).slice(0, 2),
    [allModels],
  )

  const handleCopyApiId = async (modelId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    const ok = await copy(modelId)
    if (!ok) {
      appToast.error(t('modelsCatalog.toast.copyFailed'))
      return
    }
    setCopiedId(modelId)
    appToast.success(t('modelsCatalog.toast.copied'))
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleGoPlayground = (modelId: string, event?: React.MouseEvent) => {
    event?.stopPropagation()
    navigate('/models/playground', { state: { selectedModelId: modelId } })
  }

  const handleOpenCompare = useCallback((initialIds: string[] = []) => {
    setCompareInitialIds(initialIds)
    setIsCompareOpen(true)
  }, [])

  return (
    <div className="models-catalog-page">
      <section className="models-catalog-hero" aria-labelledby="models-catalog-title">
        <div className="models-catalog-hero-copy">
          <div className="models-catalog-kicker">
            <LuSparkles aria-hidden />
            {t('modelsCatalog.hero.kicker')}
          </div>
          <h1 id="models-catalog-title">{t('modelsCatalog.allModels.title')}</h1>
          <p>{t('modelsCatalog.allModels.desc')}</p>
          <div className="models-catalog-stats" aria-label={t('modelsCatalog.stats.label')}>
            {catalogStats.map(({ key, label, value, Icon }) => (
              <span key={key} className="models-catalog-stat" title={label}>
                <Icon aria-hidden />
                <strong>{value}</strong>
              </span>
            ))}
          </div>
        </div>
        <div className="models-catalog-actions">
          <Button
            variant="outline"
            className="models-catalog-action"
            onClick={() => handleOpenCompare()}
          >
            <LuGitCompareArrows size={15} />
            {t('modelsCatalog.button.compare')}
          </Button>
          <Button asChild variant="ghost" className="models-catalog-action">
            <a href={docsUrl} target="_blank" rel="noreferrer">
              <LuBookOpen size={15} />
              {t('modelsCatalog.button.docs')}
              <LuArrowUpRight size={13} />
            </a>
          </Button>
        </div>
      </section>

      <section className="models-catalog-toolbar" aria-label={t('modelsCatalog.filters.label')}>
        <Input
          variant="search"
          prefix={<LuSearch size={16} className="text-mg-text-2/80" />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('modelsCatalog.placeholder.search')}
          className="models-catalog-search"
        />
        <div className="models-catalog-filter-row">
          <span className="models-catalog-filter-label">
            <LuSlidersHorizontal aria-hidden />
            {t('modelsCatalog.filters.label')}
          </span>
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={cn('models-catalog-filter-chip', category === 'all' && 'is-active')}
          >
            {t('modelsCatalog.filter.all')}
          </button>
          {apiTags.slice(0, 8).map((tag) => (
            <button
              key={tag.code}
              type="button"
              onClick={() => setCategory(tag.code)}
              className={cn('models-catalog-filter-chip', category === tag.code && 'is-active')}
            >
              {isZh ? tag.name_zh : tag.name_en}
            </button>
          ))}
          {modalityFilters.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => setCategory(item.code)}
              className={cn('models-catalog-filter-chip', category === item.code && 'is-active')}
            >
              {isZh ? item.nameZh : item.nameEn}
            </button>
          ))}
        </div>
      </section>

      <div className="models-catalog-layout">
        <section className="models-catalog-results" aria-label={t('modelsCatalog.results.label')}>
          <div className="models-catalog-results-head">
            <div>
              <h2>{t('modelsCatalog.results.title')}</h2>
              <p>
                {t('modelsCatalog.results.count', {
                  visible: visibleModels.length,
                  total: allModels.length,
                })}
              </p>
            </div>
            <span className="models-catalog-results-badge">
              {category === 'all' ? t('modelsCatalog.filter.all') : category}
            </span>
          </div>

          {modelsQuery.isLoading ? (
            <div className="models-catalog-state">
              <div className="models-catalog-spinner" />
              <span>{t('modelsCatalog.loading')}</span>
            </div>
          ) : modelsQuery.isError ? (
            <div className="models-catalog-state">{t('modelsCatalog.error.load')}</div>
          ) : visibleModels.length === 0 ? (
            <div className="models-catalog-state">{t('modelsCatalog.empty')}</div>
          ) : (
            <div className="models-catalog-grid">
              {visibleModels.map((model) => (
                <ModelCatalogCard
                  key={model.id}
                  model={model}
                  isZh={isZh}
                  copied={copiedId === model.model_id}
                  onCopy={handleCopyApiId}
                  onTry={handleGoPlayground}
                  onCompare={(event) => {
                    event.stopPropagation()
                    handleOpenCompare([model.id])
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <CatalogInsightPanel
          rankingItems={rankingItems.length > 0 ? rankingItems : fallbackRankingItems}
          hasRealRanking={rankingItems.length > 0}
          lowCostModels={lowCostModels}
          recentModels={recentModels}
        />
      </div>

      <ModelsCompareModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        allModels={comparableModels}
        initialSelectedIds={compareInitialIds}
        onConfirmCompare={(ids) => {
          if (ids.length > 0) {
            navigate('/models/compare', { state: { selectedIds: ids } })
          }
        }}
      />
    </div>
  )
}

interface ModelCatalogCardProps {
  model: CatalogModelItem
  isZh: boolean
  copied: boolean
  onCopy: (modelId: string, event: React.MouseEvent) => Promise<void>
  onTry: (modelId: string, event: React.MouseEvent) => void
  onCompare: (event: React.MouseEvent<HTMLButtonElement>) => void
}

function ModelCatalogCard({ model, isZh, copied, onCopy, onTry, onCompare }: ModelCatalogCardProps) {
  const { t } = useTranslation()
  const meta = getModelMeta(model.model_id, isZh)
  const scenarioTags = model.tags?.length ? model.tags.slice(0, 3) : meta.tags.slice(0, 3)
  const statusLabel = getStatusLabel(model.status, isZh)
  const canCompare = isComparableModel(model)

  return (
    <article className="model-catalog-card">
      <div className="model-catalog-card-head">
        <ModelIcon model={model} size={42} rounded="rounded-xl" className="model-catalog-card-icon" />
        <div className="model-catalog-card-title">
          <span>{model.vendor || 'ModelGo'}</span>
          <h3 title={model.display_name}>{model.display_name}</h3>
        </div>
        <span className={cn('model-catalog-status', model.status === 'disabled' && 'is-disabled')}>
          {statusLabel}
        </span>
      </div>

      <p className="model-catalog-desc">{meta.description}</p>

      <div className="model-catalog-tags">
        {model.modalities?.slice(0, 2).map((modality) => (
          <ModalityBadge key={modality} modality={modality} />
        ))}
        {scenarioTags.map((tag) => (
          <span key={tag} className="model-catalog-scenario-tag">{tag}</span>
        ))}
      </div>

      <button
        type="button"
        title={isZh ? '点击复制 API ID' : 'Click to copy API ID'}
        onClick={(event) => onCopy(model.model_id, event)}
        className={cn('model-catalog-api', copied && 'is-copied')}
      >
        <span>{t('modelsCatalog.labels.apiId')}</span>
        <code>{model.model_id}</code>
        {copied ? <LuCheck aria-hidden /> : <LuCopy aria-hidden />}
      </button>

      <div className="model-catalog-metrics">
        <MetricItem label={t('modelsCatalog.labels.context')} value={formatContextLength(model.context_length)} />
        <MetricItem
          label={t('modelsCatalog.labels.inputPrice')}
          value={formatModelPrice(model.pricing?.input_per_1m, model.pricing?.currency)}
        />
        <MetricItem
          label={t('modelsCatalog.labels.outputPrice')}
          value={formatModelPrice(model.pricing?.output_per_1m, model.pricing?.currency)}
        />
        <MetricItem label={t('modelsCatalog.labels.releasedAt')} value={model.released_at || '—'} />
      </div>

      <div className="model-catalog-card-actions">
        <Button
          size="sm"
          variant="brand"
          className="model-catalog-primary-action"
          onClick={(event) => onTry(model.model_id, event)}
        >
          {t('modelsCatalog.button.try')}
          <LuChevronRight size={13} />
        </Button>
        {canCompare ? (
          <button type="button" className="model-catalog-compare-action" onClick={onCompare}>
            <LuGitCompareArrows aria-hidden />
            {t('modelsCatalog.button.compareShort')}
          </button>
        ) : (
          <span className="model-catalog-muted-action">
            {t('modelsCatalog.button.compareUnavailable')}
          </span>
        )}
      </div>
    </article>
  )
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="model-catalog-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

interface CatalogInsightPanelProps {
  rankingItems: RankingViewItem[]
  hasRealRanking: boolean
  lowCostModels: CatalogModelItem[]
  recentModels: CatalogModelItem[]
}

function CatalogInsightPanel({ rankingItems, hasRealRanking, lowCostModels, recentModels }: CatalogInsightPanelProps) {
  const { t } = useTranslation()

  return (
    <aside className="catalog-insight-panel" aria-label={t('modelsCatalog.insights.title')}>
      <div className="catalog-insight-header">
        <div>
          <h2>{t('modelsCatalog.insights.title')}</h2>
          <p>{hasRealRanking ? t('modelsCatalog.insights.subtitle') : t('modelsCatalog.insights.noRanking')}</p>
        </div>
        <LuZap aria-hidden />
      </div>

      <section className="catalog-insight-section">
        <h3>{t('modelsCatalog.insights.hot')}</h3>
        <div className="catalog-ranking-list">
          {rankingItems.slice(0, 5).map((item) => (
            <div className="catalog-ranking-row" data-tone={item.tone} key={`${item.rank}-${item.name}`}>
              <span className="catalog-ranking-rank">{item.rank}</span>
              <ModelIcon model={item.iconModel} size={28} rounded="rounded-lg" className="catalog-ranking-icon" />
              <span className="catalog-ranking-copy">
                <strong title={item.name}>{item.name}</strong>
                <small>
                  {hasRealRanking
                    ? t('modelsCatalog.insights.calls', { count: item.requests.toLocaleString() })
                    : t('modelsCatalog.insights.waiting')}
                </small>
              </span>
              <span className="catalog-ranking-score">{item.score}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="catalog-insight-section">
        <h3>{t('modelsCatalog.insights.lowCost')}</h3>
        <div className="catalog-mini-model-list">
          {lowCostModels.map((model) => (
            <div className="catalog-mini-model" key={model.id}>
              <ModelIcon model={model} size={24} rounded="rounded-md" />
              <span title={model.display_name}>{model.display_name}</span>
              <strong>{formatModelPrice(model.pricing?.input_per_1m, model.pricing?.currency)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="catalog-insight-section">
        <h3>{t('modelsCatalog.insights.recent')}</h3>
        <div className="catalog-mini-model-list">
          {recentModels.map((model) => (
            <div className="catalog-mini-model" key={model.id}>
              <ModelIcon model={model} size={24} rounded="rounded-md" />
              <span title={model.display_name}>{model.display_name}</span>
              <strong>{model.released_at || '—'}</strong>
            </div>
          ))}
        </div>
      </section>
    </aside>
  )
}
