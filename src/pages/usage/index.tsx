/**
 * 用量分析页
 * 路由：/usage
 * API 来源：GET /usage/summary、GET /usage/series、GET /usage/rankings/*、GET /logs/histogram
 */

import { useTranslation } from 'react-i18next'
import { SegmentedToggle } from '@/features/dashboard/workbench/SegmentedToggle'
import { LuActivity, LuDatabase, LuRefreshCw, LuWallet } from 'react-icons/lu'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  CostSourcePanel,
  DistributionPanel,
  DistributionDonutPanel,
  UsageStatCard,
} from './usage-panels'
import {
  type Metric,
  formatMoney,
  formatNumber,
} from './usage-utils'
import {
  Sparkline,
  MetricTab,
} from './usage-charts'
import { UsageFilterPanel } from './usage-filters'
import { useUsagePage } from './use-usage-page'

/** 用量分析页面入口。 */
export default function UsagePage() {
  const { t } = useTranslation()
  const {
    viewDesc,
    showViewToggle,
    showSpaceViewToggle,
    view,
    handleViewChange,
    summaryQuery,
    seriesQuery,
    rankingsModelsQuery,
    rankingsApiKeysQuery,
    workspaceSourceQuery,
    usagePresets,
    filterWorkspaceId,
    timeRange,
    workspaceList,
    handleTimeRangeChange,
    handleWorkspaceChange,
    refetchUsageData,
    totalSpend,
    totalRequests,
    totalTokens,
    currencySymbol,
    summary,
    costPct,
    inputCostNum,
    outputCostNum,
    cacheCostNum,
    successRequests,
    failedRequests,
    averageLatency,
    reqPct,
    inputTokens,
    outputTokens,
    cacheTokens,
    tokPct,
    metric,
    metricLabels,
    handleMetricChange,
    seriesData,
    drillToLogs,
    sourceSections,
    dimensionButtons,
    effectiveDimension,
    handleDimensionChange,
    dimQuery,
    dimItems,
    dimTotalSpend,
    emptyTitle,
    emptyDesc,
    dimLeading,
    dimSecondary,
    drillFromRanking,
  } = useUsagePage()

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('usage.title')}
        description={viewDesc}
        actions={showViewToggle ? (
          <SegmentedToggle<'enterprise' | 'mine'>
            ariaLabel={t('dashboard.workbench.view.enterprise')}
            value={view === 'space' ? 'mine' : view}
            options={[
              { value: 'enterprise', label: t('dashboard.workbench.view.enterprise') },
              { value: 'mine', label: t('dashboard.workbench.view.mine') },
            ]}
            onChange={handleViewChange}
          />
        ) : showSpaceViewToggle ? (
          <SegmentedToggle<'space' | 'mine'>
            ariaLabel={t('dashboard.workbench.view.space')}
            value={view === 'enterprise' ? 'space' : view}
            options={[
              { value: 'space', label: t('dashboard.workbench.view.space') },
              { value: 'mine', label: t('dashboard.workbench.view.mine') },
            ]}
            onChange={handleViewChange}
          />
        ) : undefined}
      />

      {summaryQuery.isError && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-mg-danger/30 bg-mg-bg-0 px-4 py-3 text-sm text-mg-danger">
          {t('usage.error.summary')}
          <Button variant="outline" size="sm" onClick={() => summaryQuery.refetch()}>
            {t('usage.retry')}
          </Button>
        </div>
      )}

      <Card className="space-y-5 p-5 sm:p-6" id="usage-cost-overview">
        <h2 className="mg-text-title-sm font-bold text-mg-text-1">{t('usage.overview.title')}</h2>

        {/* 对齐 PRD：筛选下拉（时间 / 工作空间）与「刷新」同处一行，筛选无独立字段标签 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <UsageFilterPanel
            filterWorkspaceId={filterWorkspaceId}
            labels={{
              customRangePlaceholder: t('usage.customRange.placeholder'),
              workspaces: t('usage.filter.allWorkspaces'),
            }}
            onTimeRangeChange={handleTimeRangeChange}
            onWorkspaceChange={handleWorkspaceChange}
            presets={usagePresets}
            timeRange={timeRange}
            workspaceList={workspaceList}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={refetchUsageData}
            icon={<LuRefreshCw size={14} className={summaryQuery.isFetching || seriesQuery.isFetching ? 'animate-spin' : ''} />}
          >
            {t('usage.refresh')}
          </Button>
        </div>

        {/* 用量统计三大卡（对齐 PRD）：总费用/请求总量/总Tokens + 分解进度条 */}
        <div className="grid gap-4 md:grid-cols-3">
          <UsageStatCard
            icon={<LuWallet size={16} />}
            label={t('usage.summary.totalSpend')}
            value={totalSpend}
            suffix={currencySymbol === '¥' ? 'CNY' : undefined}
            loading={summaryQuery.isLoading}
            breakdownTitle={t('usage.summary.costStructure')}
            rows={[
              { label: t('usage.summary.inputCost'), value: summary ? formatMoney(summary.total.input_cost ?? '0', currencySymbol) : '—', pct: costPct(inputCostNum), variant: 'emerald' },
              { label: t('usage.summary.outputCost'), value: summary ? formatMoney(summary.total.output_cost ?? '0', currencySymbol) : '—', pct: costPct(outputCostNum), variant: 'amber' },
              { label: t('usage.summary.cacheCost'), value: summary ? formatMoney(summary.total.cache_cost ?? '0', currencySymbol) : '—', pct: costPct(cacheCostNum), variant: 'blue' },
            ]}
          />
          <UsageStatCard
            icon={<LuActivity size={16} />}
            label={t('usage.summary.totalRequests')}
            value={totalRequests}
            loading={summaryQuery.isLoading}
            breakdownTitle={t('usage.summary.requestStatus')}
            rows={[
              { label: t('usage.summary.success'), value: formatNumber(successRequests), pct: reqPct(successRequests), variant: 'emerald' },
              { label: t('usage.summary.failed'), value: formatNumber(failedRequests), pct: reqPct(failedRequests), variant: 'amber' },
              { label: t('usage.summary.avgLatency'), value: averageLatency, bar: false },
            ]}
          />
          <UsageStatCard
            icon={<LuDatabase size={16} />}
            label={t('usage.summary.totalTokens')}
            value={totalTokens}
            loading={summaryQuery.isLoading}
            breakdownTitle={t('usage.summary.tokenUsage')}
            rows={[
              { label: t('usage.summary.inputTokens'), value: formatNumber(inputTokens), pct: tokPct(inputTokens), variant: 'emerald' },
              { label: t('usage.summary.outputTokens'), value: formatNumber(outputTokens), pct: tokPct(outputTokens), variant: 'amber' },
              { label: t('usage.summary.cacheTokens'), value: formatNumber(cacheTokens), pct: tokPct(cacheTokens), variant: 'blue' },
            ]}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="min-w-0 p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-mg-text-1">
                  {t('usage.chart.costTrend')}
                </div>
                <div className="mt-1 text-[12px] text-mg-text-3">{t('usage.chart.filteredAggregation')}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1 rounded-lg bg-mg-fill-0 p-1">
                  {(['spend', 'requests', 'tokens'] as Metric[]).map((item) => (
                    <MetricTab
                      key={item}
                      label={metricLabels[item]}
                      active={metric === item}
                      onClick={() => handleMetricChange(item)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {seriesQuery.isError ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center text-sm text-mg-danger">
                {t('usage.error.series')}
                <Button variant="outline" size="sm" onClick={() => seriesQuery.refetch()}>
                  {t('usage.retry')}
                </Button>
              </div>
            ) : seriesQuery.isLoading ? (
              <div className="flex h-[220px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-mg-border border-t-brand-base" />
              </div>
            ) : (
              <Sparkline
                data={seriesData}
                metric={metric}
                noDataLabel={t('usage.noData')}
                currencySymbol={currencySymbol}
                requestUnitLabel={t('usage.unit.requests')}
                tokenUnitLabel={t('usage.unit.tokens')}
                onPointClick={(bucket) => drillToLogs('trend', { day: bucket })}
              />
            )}
          </Card>

          <CostSourcePanel
            sections={sourceSections}
            currencySymbol={currencySymbol}
            isLoading={rankingsModelsQuery.isLoading || rankingsApiKeysQuery.isLoading || workspaceSourceQuery.isLoading}
            isError={rankingsModelsQuery.isError || rankingsApiKeysQuery.isError || workspaceSourceQuery.isError}
            onRetry={refetchUsageData}
            onDrill={(kind, item) => {
              if (!item) return
              if (kind === 'workspace') drillToLogs('cost_source', { workspace: item.key })
              else if (kind === 'apiKey') drillToLogs('cost_source', { api_key: item.key })
              else if (kind === 'model') drillToLogs('cost_source', { model: item.key })
            }}
          />
        </div>
      </Card>

      <Card className="space-y-5 p-5 sm:p-6" id="usage-breakdown">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="mg-text-title-sm font-bold text-mg-text-1">{t('usage.breakdown.title')}</h2>
            <p className="mg-text-caption text-mg-text-3">{t('usage.breakdown.desc')}</p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-lg border border-mg-border bg-mg-fill-0 p-1">
            {dimensionButtons.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => handleDimensionChange(item.value)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 mg-text-caption font-bold transition-colors',
                  effectiveDimension === item.value ? 'bg-mg-bg-0 text-brand-base shadow-sm' : 'text-mg-text-3 hover:text-mg-text-1',
                ].join(' ')}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <DistributionDonutPanel
            title={t(`usage.distribution.${effectiveDimension}.title`)}
            chartDesc={t(`usage.distribution.${effectiveDimension}.chartDesc`)}
            items={dimItems}
            totalSpendAmount={dimTotalSpend}
            isLoading={dimQuery.isLoading}
            isError={dimQuery.isError}
            onRetry={() => dimQuery.refetch()}
            currencySymbol={currencySymbol}
            emptyTitle={emptyTitle}
            emptyDesc={emptyDesc}
          />
          <DistributionPanel
            title={t(`usage.distribution.${effectiveDimension}.rankTitle`)}
            items={dimItems}
            totalSpendAmount={dimTotalSpend}
            currencySymbol={currencySymbol}
            isLoading={dimQuery.isLoading}
            isError={dimQuery.isError}
            onRetry={() => dimQuery.refetch()}
            emptyTitle={emptyTitle}
            emptyDesc={emptyDesc}
            leading={dimLeading}
            secondary={dimSecondary}
            onDrill={drillFromRanking}
          />
        </div>
      </Card>
    </div>
  )
}
