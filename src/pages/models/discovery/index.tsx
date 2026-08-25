/**
 * 模型发现（公开页 /models/discovery）
 *
 * 模型广场的**分析视图**，不是独立产品入口 —— 入口只在 /models 标题行右侧一个次级
 * 按钮，不进左侧菜单、不进顶栏（plans/2026-08-24-v1.0.6-model-discovery-ui-flow §2.1）。
 *
 * 视觉真源是现状控制台不是 PRD 原型视觉：布局照 /models 与 /usage 的现有骨架排
 * （标题区 + .mg-tile 实心卡 + underline Tabs），原型只给功能与交互。
 *
 * 数据当前走 discovery-mock（§8 第 2 步）。第 6 步接真实接口时只换 adapter，
 * 本文件的状态机与 URL 契约不动。
 *
 * URL 契约（§4.1）—— 只有「可分享、刷新后该保留」的状态进 query：
 *   modality / task / scope / ranking / page
 * 短生命周期的展示状态（散点勾选、优选区开关、Agent 榜展开、各卡周期）留在组件内，
 * 刷新回默认，不污染 URL。
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LuArrowLeft } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { trackEvent, trackPageView } from '@/lib/track'
import { SegmentedToggle } from '@/features/dashboard/workbench/SegmentedToggle'
import { DiscoveryTopFive } from './DiscoveryTopFive'
import { DiscoverySpecialties } from './DiscoverySpecialties'
import { DiscoveryScatter } from './DiscoveryScatter'
import { DiscoveryLeaderboard } from './DiscoveryLeaderboard'
import { DiscoveryAgentRanking } from './DiscoveryAgentRanking'
import {
  DISCOVERY_CONFIGS,
  DISCOVERY_SNAPSHOT_AT,
  MODALITY_OPTIONS,
  RANKING_METRIC_OPTIONS,
  filterByScope,
  sortByMetric,
  type DiscoveryModel,
  type ModalityKey,
  type RankingMetric,
  type ScopeKey,
} from './discovery-mock'
// 复用广场样式链：本页用到 .catalog-title（标题）与 .mg-metric 三件套（摘要格），
// 二者分别定义在 catalog-hero.css / catalog-card-row.css，由 catalog.css 按序 @import
import '../catalog/catalog.css'

const SCOPE_OPTIONS: Array<{ value: ScopeKey; label: string }> = [
  { value: 'all', label: '全部行业模型' },
  { value: 'supported', label: '仅看已接入' },
]

/** 参数非法一律静默归一到该模态的首个合法值并 replace URL，不弹错误 toast（§4.1 规则 3） */
function normalizeModality(raw: string | null): ModalityKey {
  return MODALITY_OPTIONS.some((m) => m.key === raw) ? (raw as ModalityKey) : 'agent'
}

export default function ModelDiscoveryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const leaderboardRef = useRef<HTMLDivElement>(null)

  const modality = normalizeModality(params.get('modality'))
  const config = DISCOVERY_CONFIGS[modality]

  // Agent 无二级任务；其余模态非法 task 归一到首个合法任务
  const taskParam = params.get('task')
  const task = config.tasks.length === 0
    ? ''
    : config.tasks.includes(taskParam ?? '')
      ? (taskParam as string)
      : config.tasks[0]

  const scope: ScopeKey = params.get('scope') === 'supported' ? 'supported' : 'all'
  const rankingParam = params.get('ranking')
  const ranking: RankingMetric = RANKING_METRIC_OPTIONS.some((r) => r.key === rankingParam)
    ? (rankingParam as RankingMetric)
    : 'overall'
  const pageRaw = Number.parseInt(params.get('page') ?? '1', 10)
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1

  /**
   * URL 更新一律 replace、不 push（§4.1 规则 4）——用户在发现页和详情之间往返时
   * 不该堆积十几条 history，否则返回键变成一格一格往回抠。
   */
  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params)
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key)
        else next.set(key, value)
      }
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  useEffect(() => {
    trackPageView('models_discovery', undefined, { view_mode: modality })
    trackEvent('marketplace_discovery_view', { modality, task: task || 'agent' })
    // 只在首次进入与模态切换时上报，不跟 task/scope 变化重复发
  }, [modality, task])

  /** 切模态：任务归一为新模态首个合法值，榜单指标/页码重置，**范围保持**（§3.2） */
  const changeModality = (next: string) => {
    const key = normalizeModality(next)
    const nextConfig = DISCOVERY_CONFIGS[key]
    patchParams({
      modality: key,
      task: nextConfig.tasks[0] ?? null,
      ranking: null,
      page: null,
    })
  }

  const changeTask = (next: string) => {
    // 切任务重置榜单指标与页码（§3.3）
    patchParams({ task: next, ranking: null, page: null })
  }

  const models = useMemo(() => {
    const scoped = filterByScope(config.models, scope)
    return sortByMetric(scoped, ranking)
  }, [config.models, scope, ranking])

  const openModel = (model: DiscoveryModel) => {
    if (!model.id) return
    // 带来源与滚动位置，详情页返回时恢复现场（§2.2）
    navigate(`/models/${model.id}`, {
      state: {
        source: 'discovery',
        fromDiscoverySearch: location.search,
        fromDiscoveryScrollY: window.scrollY,
      },
    })
  }

  const backToCatalog = () => {
    trackEvent('marketplace_discovery_exit_clicked', { target: 'catalog_header' })
    // 不用浏览器 back()：用户可能从外链直达，back() 会把人送出站（§2.2）
    navigate('/models')
  }

  /** 「查看更多」：榜单指标回综合、页码回 1，平滑滚到榜单（§3.4） */
  const jumpToLeaderboard = () => {
    patchParams({ ranking: null, page: null })
    leaderboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const hasActiveFilters = scope !== 'all' || ranking !== 'overall'

  return (
    <div className="mx-auto w-full max-w-[1240px] px-5 py-8">
      {/* 模块 1：页面头。桌面标题与返回同行右对齐，窄屏 flex-wrap 落到下方 */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-mg-text-1 catalog-title text-[34px] font-bold tracking-tight">
            {t('modelsCatalog.discovery.title')}
          </h1>
          <p className="text-mg-text-3 mt-1.5 text-[14px]">
            {t('modelsCatalog.discovery.subtitle')}
          </p>
          {/* mock 阶段只写快照时间，不写「实时」「最新」（§5.2 同口径） */}
          <p className="text-mg-text-3 mt-1 text-[12px]">数据快照：{DISCOVERY_SNAPSHOT_AT}</p>
        </div>
        <Button variant="outline" size="sm" onClick={backToCatalog}>
          <LuArrowLeft size={14} />
          {t('modelsCatalog.discovery.backToCatalog')}
        </Button>
      </div>

      {/* 模块 2：一级模态导航。underline Tabs，不复制原型的自定义按钮条 */}
      <Tabs value={modality} onValueChange={changeModality} className="mb-4">
        <TabsList>
          {MODALITY_OPTIONS.map((option) => (
            <TabsTrigger key={option.key} value={option.key}>
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* 模块 3：二级任务（Agent 无）+ 范围。Agent 时不留一个只有「Agent」的冗余 Tab */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {config.tasks.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {config.tasks.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={item === task}
                onClick={() => changeTask(item)}
                className={
                  item === task
                    ? 'rounded-sm border border-brand-base/40 bg-brand-base/10 px-2.5 py-1 text-[12px] font-medium text-brand-base'
                    : 'rounded-sm border border-mg-border px-2.5 py-1 text-[12px] text-mg-text-2 hover:text-mg-text-1'
                }
              >
                {item}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <SegmentedToggle size="sm"
          options={SCOPE_OPTIONS}
          value={scope}
          onChange={(next) => patchParams({ scope: next === 'all' ? null : next, page: null })}
          ariaLabel="模型范围"
        />
      </div>

      {/* 「仅看已接入」筛空时保留控件状态，给一键切回（§3.3） */}
      {models.length === 0 && scope === 'supported' ? (
        <div className="mg-tile flex flex-col items-center gap-3 py-10">
          <p className="text-[13px] text-mg-text-3">该任务下暂无已接入模型</p>
          <Button variant="outline" size="sm" onClick={() => patchParams({ scope: null })}>
            切换到全部行业模型
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* 模块 4 */}
          <DiscoveryTopFive
            config={config}
            models={models}
            onOpenModel={openModel}
            onSeeMore={jumpToLeaderboard}
          />

          {/* 模块 5 */}
          <DiscoverySpecialties config={config} />

          {/* 模块 6 */}
          <DiscoveryScatter config={config} />

          {/* 模块 7 */}
          <div ref={leaderboardRef}>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {RANKING_METRIC_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={option.key === ranking}
                  onClick={() =>
                    patchParams({
                      ranking: option.key === 'overall' ? null : option.key,
                      page: null,
                    })
                  }
                  className={
                    option.key === ranking
                      ? 'rounded-sm border border-brand-base/40 bg-brand-base/10 px-2.5 py-1 text-[12px] font-medium text-brand-base'
                      : 'rounded-sm border border-mg-border px-2.5 py-1 text-[12px] text-mg-text-2 hover:text-mg-text-1'
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
            <DiscoveryLeaderboard
              config={config}
              models={models}
              page={page}
              onPageChange={(next) => patchParams({ page: next === 1 ? null : String(next) })}
              onOpenModel={openModel}
              onClearFilters={() => patchParams({ scope: null, ranking: null, page: null })}
              hasActiveFilters={hasActiveFilters}
            />
          </div>

          {/* 模块 8：仅 Agent */}
          {modality === 'agent' ? <DiscoveryAgentRanking /> : null}
        </div>
      )}
    </div>
  )
}
