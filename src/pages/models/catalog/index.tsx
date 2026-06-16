/**
 * 模型目录页
 * 路由：/models/catalog
 * API：GET /api/v1/catalog/models、GET /api/v1/catalog/model-tags、GET /api/v1/usage/rankings/models
 */

import { useMemo, useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  LuArrowUpRight,
  LuBookOpen,
  LuCheck,
  LuChevronRight,
  LuCopy,
  LuGift,
  LuLockKeyhole,
  LuGitCompareArrows,
  LuSparkles,
  LuZap,
} from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { getMarketConfig } from '@/config/market'
import { useModels } from '@/features/models/hooks/useModels'
import { ModelIcon, type ModelIconLike } from '@/features/models/components/ModelIcon'
import { resolveVendorBrand } from '@/features/models/components/vendor-icons'
import { FlameIcon } from '@/components/ui/FlameIcon'
import { ModalityBadge } from '@/features/models/components/ModalityBadge'
import { useCopy } from '@/hooks/use-copy'
import { useMarket } from '@/hooks/useMarket'
import { useCurrency } from '@/hooks/use-platform-config'
import { appToast } from '@/lib/app-toast'
import { cn, formatContextLength, formatModelPrice } from '@/lib/utils'
import { listModelTags, listModelFamilies } from '@/services/catalog'
import { getUsageRankingsModels } from '@/services/usage'
import { useAuthStore } from '@/store/auth'
import type { CatalogModelItem, UsageRankingItem } from '@/types'
import { ModelsCompareModal } from '../components/ModelsCompareModal'
import { ModelCatalogFilters } from './ModelCatalogFilters'
import { FirstChargeLockGate } from '@/components/ui/FirstChargeLockGate'
import {
  DEFAULT_ADVANCED_FILTERS,
  matchesAdvancedFilters,
  type AdvancedFilterState,
} from './modelCatalogFilterLogic'
import './catalog.css'
import './catalog-card.css'

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

/** 免费模型：标签含 free 或最低价为 0。 */
function isFreeModel(model: CatalogModelItem) {
  const tags = (model.tags ?? []).map((t) => t.toLowerCase())
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
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterState>(() => ({ ...DEFAULT_ADVANCED_FILTERS }))
  // 模型组（family）：官方分组，服务端筛选，替代暴露上游的 vendor
  const [family, setFamily] = useState<string>('all')
  const [isCompareOpen, setIsCompareOpen] = useState(false)
  const [compareInitialIds, setCompareInitialIds] = useState<string[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const { copy } = useCopy()

  const {
    search,
    setSearch,
    modelsQuery,
    filteredModels,
  } = useModels({ family: family !== 'all' ? family : undefined })

  const tagsQuery = useQuery({
    queryKey: ['catalog-model-tags'],
    queryFn: () => listModelTags(true),
    staleTime: 5 * 60_000,
  })

  // 模型组（family）筛选项：官方分组，替代暴露上游的 vendor
  const familiesQuery = useQuery({
    queryKey: ['catalog-model-families'],
    queryFn: () => listModelFamilies(true),
    staleTime: 5 * 60_000,
  })
  const familyOptions = useMemo(() => {
    const items = (familiesQuery.data?.items ?? [])
      .filter((f) => f.enabled)
      .sort((a, b) => a.sort_order - b.sort_order)
    return [
      { code: 'all', label: t('modelsCatalog.filters.all') },
      ...items.map((f) => {
        const label = isZh ? f.name_zh : f.name_en
        // 系列名/code 任一能解析到品牌就在选项前加图标，解析不到则纯文字
        const iconVendor = [f.code, f.name_en, f.name_zh].find((v) => resolveVendorBrand(v))
        return {
          code: f.code,
          label,
          icon: iconVendor
            ? <ModelIcon model={{ display_name: label, vendor: iconVendor }} size={16} rounded="rounded" />
            : undefined,
        }
      }),
    ]
  }, [familiesQuery.data?.items, isZh, t])

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
    return filteredModels.filter((model) =>
      (
        category === 'all' ||
        model.tags?.some((tag) => tag.toLowerCase() === category.toLowerCase()) ||
        model.modalities?.includes(category)
      ) &&
      matchesAdvancedFilters(model, advancedFilters)
    )
  }, [category, advancedFilters, filteredModels])

  // 我们支持的官方厂商（去重的 model.provider）：只保留能解析到 lobehub 品牌图标的，
  // 无法识别的（会回退首字母）不展示，单独收集供补图标映射。
  const { supportedProviders, unknownProviders } = useMemo(() => {
    // 按「规范品牌」去重：deepseek/deepseek-v4、claude/anthropic、seedream/ark 等
    // 都收敛到同一品牌，只展示一个图标
    const known = new Map<string, ModelIconLike>()
    const unknown = new Set<string>()
    for (const model of allModels) {
      const name = model.provider
      if (!name) continue
      const brand = resolveVendorBrand(name)
      if (brand) {
        if (!known.has(brand)) known.set(brand, { vendor: name, display_name: name })
      } else {
        unknown.add(name)
      }
    }
    return { supportedProviders: Array.from(known.values()), unknownProviders: Array.from(unknown) }
  }, [allModels])

  // 无法识别的厂商（无对应 lobehub 图标）→ dev 控制台列出，便于在 vendor-icons 补映射
  useEffect(() => {
    if (import.meta.env.DEV && unknownProviders.length > 0) {
      console.warn('[catalog] 无法识别的厂商（无 lobehub 图标，未展示）:', unknownProviders)
    }
  }, [unknownProviders])

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
    // 热门 = 按调用次数(requests)降序，名次据此重排
    return (rankingsData?.items ?? [])
      .map((item: UsageRankingItem) => {
        const key = item.key ?? ''
        return {
          requests: item.requests ?? 0,
          name: item.name || key || '—',
          score: item.spend?.amount ? `${currencySymbol}${Number.parseFloat(item.spend.amount).toFixed(4)}` : '—',
          iconModel: iconMap.get(key) ?? { display_name: item.name || key, vendor: key.split('/')[0] },
        }
      })
      .sort((a, b) => b.requests - a.requests)
      .map((it, index) => ({
        rank: String(index + 1).padStart(2, '0'),
        name: it.name,
        requests: it.requests,
        score: it.score,
        tone: tones[index % tones.length],
        iconModel: it.iconModel,
      }))
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

  const freeModels = useMemo(
    () => allModels.filter(isFreeModel).slice(0, 4),
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
          {supportedProviders.length > 0 && (
            <div className="models-catalog-providers" aria-label={t('modelsCatalog.stats.vendors')}>
              {supportedProviders.map((provider) => (
                <ModelIcon
                  key={provider.vendor}
                  model={provider}
                  size={26}
                  rounded="rounded-lg"
                  className="models-catalog-provider-icon"
                />
              ))}
            </div>
          )}
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
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className="models-catalog-action models-catalog-action--link"
          >
            <LuBookOpen size={15} />
            {t('modelsCatalog.button.docs')}
            <LuArrowUpRight size={13} />
          </a>
        </div>
      </section>

      <div className="models-catalog-notice" role="note">
        <LuLockKeyhole aria-hidden />
        <div className="models-catalog-notice-body">
          <p>
            <strong>免费模型需首次充值后解锁</strong>：完成任意金额的首次充值即可解锁全部免费模型；付费模型不受此门槛影响。
          </p>
          <p className="models-catalog-notice-sub">
            注：免费模型 ≠ Free Tier 套餐——前者是按模型粒度的限免，后者是账户级套餐机制，两者互不等同。
          </p>
        </div>
      </div>

      <ModelCatalogFilters
        search={search}
        onSearchChange={setSearch}
        category={category}
        onCategoryChange={setCategory}
        advancedFilters={advancedFilters}
        onAdvancedFiltersChange={setAdvancedFilters}
        familyOptions={familyOptions}
        family={family}
        onFamilyChange={setFamily}
        allModels={allModels}
        apiTags={apiTags}
        modalityFilters={modalityFilters}
        isZh={isZh}
      />

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
          freeModels={freeModels}
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
          <span>{model.provider || 'ModelGo'}</span>
          <h3 title={model.display_name}>{model.display_name}</h3>
        </div>
        {model.status && model.status !== 'enabled' && (
          <span className={cn('model-catalog-status', model.status === 'disabled' && 'is-disabled')}>
            {statusLabel}
          </span>
        )}
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

      <div className="model-catalog-specs">
        <div className="model-catalog-spec">
          <span>{t('modelsCatalog.labels.context')}</span>
          <strong>{formatContextLength(model.context_length)}</strong>
        </div>
        <div className="model-catalog-spec">
          <span>{t('modelsCatalog.labels.inputPrice')}</span>
          <strong>{formatModelPrice(model.pricing?.input_per_1m, model.pricing?.currency)}</strong>
        </div>
        <div className="model-catalog-spec">
          <span>{t('modelsCatalog.labels.outputPrice')}</span>
          <strong>{formatModelPrice(model.pricing?.output_per_1m, model.pricing?.currency)}</strong>
        </div>
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

interface CatalogInsightPanelProps {
  rankingItems: RankingViewItem[]
  hasRealRanking: boolean
  freeModels: CatalogModelItem[]
  recentModels: CatalogModelItem[]
}

function CatalogInsightPanel({ rankingItems, hasRealRanking, freeModels, recentModels }: CatalogInsightPanelProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language.startsWith('zh')
  // FR-C2: account.has_recharged 由后端 FR-C1 接入后补全；字段缺失时默认 true（不拦截已有用户）
  const hasRecharged = useAuthStore((s) => (s.account as { has_recharged?: boolean } | null)?.has_recharged ?? true)

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
        <h3 className="catalog-insight-hot-title">
          <FlameIcon size={15} />
          {t('modelsCatalog.insights.hot')}
        </h3>
        <div className="catalog-ranking-list">
          {(() => {
            const top = rankingItems.slice(0, 5)
            const maxReq = Math.max(1, ...top.map((it) => it.requests))
            return top.map((item, idx) => (
              <div
                className={cn('catalog-ranking-row', idx === 0 && hasRealRanking && 'is-top')}
                key={`${item.rank}-${item.name}`}
              >
                {hasRealRanking && (
                  <span
                    className="catalog-ranking-heat"
                    style={{ width: `${Math.max(8, (item.requests / maxReq) * 100)}%` }}
                    aria-hidden
                  />
                )}
                <span className="catalog-ranking-rank">
                  {idx === 0 && hasRealRanking ? <FlameIcon size={16} /> : item.rank}
                </span>
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
            ))
          })()}
        </div>
      </section>

      <section className="catalog-insight-section">
        <h3 className="catalog-insight-stitle catalog-insight-stitle--free">
          <LuGift aria-hidden />
          {t('modelsCatalog.insights.free')}
        </h3>
        <FirstChargeLockGate
          locked={!hasRecharged}
          title={isZh ? '充值后解锁免费模型' : 'Unlock free models'}
          desc={isZh ? '首次充值任意金额，即可免费调用此分类下的模型。' : 'Complete your first top-up to access free-tier models at no cost.'}
          cta={isZh ? '去充值' : 'Top up now'}
          className="rounded-xl border-0"
        >
          <div className="catalog-mini-model-list">
            {freeModels.length === 0 ? (
              <p className="catalog-insight-empty">{t('modelsCatalog.insights.freeEmpty')}</p>
            ) : (
              freeModels.map((model) => (
                <div className="catalog-mini-model" key={model.id}>
                  <ModelIcon model={model} size={24} rounded="rounded-md" />
                  <span title={model.display_name}>{model.display_name}</span>
                  <span className="catalog-mini-badge is-free">{t('modelsCatalog.insights.freeTag')}</span>
                </div>
              ))
            )}
          </div>
        </FirstChargeLockGate>
      </section>

      <section className="catalog-insight-section">
        <h3 className="catalog-insight-stitle catalog-insight-stitle--recent">
          <LuSparkles aria-hidden />
          {t('modelsCatalog.insights.recent')}
        </h3>
        <div className="catalog-mini-model-list">
          {recentModels.map((model) => (
            <div className="catalog-mini-model" key={model.id}>
              <ModelIcon model={model} size={24} rounded="rounded-md" />
              <span title={model.display_name}>{model.display_name}</span>
              <span className="catalog-mini-badge is-date">{model.released_at || '—'}</span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  )
}
