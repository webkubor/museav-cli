/**
 * 模块 4：当前任务 Top 5 + 摘要指标卡（§3.4）。
 *
 * 交互要点：
 * - 已接入模型整行可点 / Enter / Space 进详情；未接入行 **不伪装成可点**
 *   （不是点了才报错，而是根本不给 clickable 语义）——§2.3
 * - 导航期间不弹 toast（本期发现页全只读，toast 只留给写操作）
 * - hover 反馈只到现有 .mg-tile-hover 级别，不新造动效
 */
import { LuArrowRight } from 'react-icons/lu'
import { InfoTip } from '@/components/ui/InfoTip'
import { cn } from '@/lib/utils'
import type { DiscoveryConfig, DiscoveryModel } from './discovery-mock'

export function DiscoveryTopFive({
  config,
  models,
  onOpenModel,
  onSeeMore,
}: {
  config: DiscoveryConfig
  models: DiscoveryModel[]
  onOpenModel: (model: DiscoveryModel) => void
  onSeeMore: () => void
}) {
  const top5 = models.slice(0, 5)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* 左：Top 5 */}
      <section className="mg-tile">
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-[14px] font-semibold text-mg-text-0">
            当前任务 Top 5
            <InfoTip text={`按 ${config.scoreLabel} 排序，取前 5 名`} className="ml-1" />
          </h2>
          <button
            type="button"
            onClick={onSeeMore}
            className="text-[12px] font-medium text-brand-base hover:underline"
          >
            查看更多
          </button>
        </header>

        {top5.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-mg-text-3">该任务暂无模型数据</p>
        ) : (
          <ol className="flex flex-col">
            {top5.map((model, index) => {
              const clickable = Boolean(model.id)
              return (
                <li
                  key={`${model.name}-${index}`}
                  className={cn(
                    'flex items-center gap-3 border-b border-mg-border/50 py-2.5 last:border-b-0',
                    clickable && 'mg-tile-hover -mx-2 cursor-pointer rounded-sm px-2',
                  )}
                  {...(clickable
                    ? {
                        role: 'button',
                        tabIndex: 0,
                        onClick: () => onOpenModel(model),
                        onKeyDown: (event: React.KeyboardEvent) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onOpenModel(model)
                          }
                        },
                      }
                    : {})}
                >
                  <span className="w-4 shrink-0 text-[12px] font-bold text-mg-text-3">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-mg-text-0">
                      {model.name}
                    </span>
                    <span className="block truncate text-[11px] text-mg-text-3">
                      {model.provider}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[13px] font-semibold text-mg-text-0">
                      {model.score}
                    </span>
                    <span className="block text-[11px] text-mg-text-3">{config.scoreLabel}</span>
                  </span>
                  {clickable ? (
                    <LuArrowRight size={13} className="shrink-0 text-mg-text-3" aria-hidden />
                  ) : (
                    <span className="shrink-0 rounded-sm bg-mg-fill-1 px-1.5 py-0.5 text-[10px] font-medium text-mg-text-3">
                      暂未接入
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {/* 右：摘要指标卡。不嵌套厚重卡片，用轻分区（§3.1 模块 4） */}
      <section className="mg-tile">
        <h2 className="mb-3 text-[14px] font-semibold text-mg-text-0">当前任务摘要</h2>
        {/* 指标格走现状 .mg-metric 三件套（catalog-card-row.css:51-53），不自己加底色：
            现状的指标格就是无背景的纯布局 + 字号层级，加 fill 底会在卡里再造一层
            视觉层次（§3.1「摘要卡不嵌套厚重卡片」，且 ui-guard 会警告）。 */}
        <dl className="grid gap-3 sm:grid-cols-2">
          {config.summary.map((item) => (
            <div key={item.label} className="mg-metric">
              <dt className="mg-metric-label flex items-center">
                {item.label}
                <InfoTip text={`${item.label}：${item.unit}`} className="ml-1" />
              </dt>
              <dd>
                <span className="mg-metric-value">{item.value}</span>
                <i className="mg-metric-unit ml-1">{item.unit}</i>
                <span className="mg-metric-sub block truncate">{item.model}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
