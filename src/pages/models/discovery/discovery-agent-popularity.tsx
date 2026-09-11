/** 模型发现页热门 Agent 榜单及共用加载失败提示。 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuChevronDown } from 'react-icons/lu'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { DiscoveryAgentIcon } from './discovery-charts'
import { useHotAgents } from './use-discovery-query'
import { buildAgentPopularityPeriods, type AgentPopularityPeriod } from './discovery-config'

function compactTokenUsage(value: number) {
  const units = [
    { minimum: 1_000_000_000_000, suffix: "T" },
    { minimum: 1_000_000_000, suffix: "B" },
    { minimum: 1_000_000, suffix: "M" },
    { minimum: 1_000, suffix: "K" },
  ];
  const unit = units.find(({ minimum }) => value >= minimum);
  if (!unit) return `${value}`;
  const amount = value / unit.minimum;
  const precision = amount >= 100 ? 0 : amount >= 10 ? 1 : 2;
  return `${amount.toFixed(precision).replace(/\.0+$|(?<=\.[0-9])0$/, "")}${unit.suffix}`;
}

/**
 * 热门 Agent 排行。数据走 `GET /model-discovery/hot-agents`（接口文档第七节），
 * 原先那份 20×3 条写死的榜单已删。
 *
 * 三条接口口径落在这里，改动前先看清：
 *   1. **`rank` 原值展示，不按数组下标重排** —— 数据源会隐藏未公开的应用，实测名次
 *      散布在 1~229，day / week 榜甚至没有第 1 名。重排会编出不存在的名次。
 *   2. **必须标注数据来源** —— `source` 固定 `openrouter`，是该平台的流量分布，不是
 *      全行业市场份额（Claude Code 真实用量绝大部分直连 Anthropic）。当风向标没问题，
 *      当市场占比就是错的。
 *   3. `description` 是英文原文（产品确认不翻译），空值率约 75%；`favicon_url` 约 97%
 *      为空 —— 都按空隐藏，不占位。
 */
/**
 * 区块级加载失败提示。
 *
 * 补这个的原因：本页 6 个数据 hook 里原先只有 useDiscoveryQuery 吐 isError，而**没有任何
 * 消费端接它**——接口挂了页面就永久停在骨架屏或空态，用户分不清「没数据」和「坏了」
 * （2026-09-08 审计发现）。
 *
 * 视觉跟随本页自有语言（model-discovery-chart-empty-block），不套 mg 体系的 EmptyState：
 * 本页是「1:1 复刻原型」的显式例外，有自己的一套 class 与间距，混进另一套 token 会打架。
 */
export function DiscoveryLoadError({ onRetry, text }: { onRetry: () => void; text?: string }) {
  const { t } = useTranslation()
  const message = text ?? t("modelsDiscovery.error.load")
  return (
    <p className="model-discovery-chart-empty-block model-discovery-load-error">
      {message}
      <button onClick={onRetry} type="button">{t("modelsDiscovery.action.retry")}</button>
    </p>
  );
}

export function AgentPopularityLeaderboard() {
  const { t } = useTranslation()
  const agentPopularityPeriods = useMemo(() => buildAgentPopularityPeriods(t), [t]);
  const [period, setPeriod] = useState<AgentPopularityPeriod>("day");
  const [expanded, setExpanded] = useState(false);
  // total / source 不再解构：PRD §7 要求无副标题，两者原本只喂那条副标题（prd#1004）
  const { apps, isLoading, isError, refetch } = useHotAgents(period, true);
  const visibleAgents = apps.slice(0, expanded ? 20 : 10);
  // Token 量的相对条：以榜首为满格。接口按 Token 降序，apps[0] 即最大值；
  // 兜底 1 防 0 除。条只表达"相对谁多"，精确值仍在右侧数字上。
  const maxTokens = Math.max(apps[0]?.total_tokens ?? 0, 1);
  const columnSize = Math.ceil(visibleAgents.length / 2);
  const agentColumns = [visibleAgents.slice(0, columnSize), visibleAgents.slice(columnSize)];

  return <section className="model-discovery-section model-discovery-agent-popularity" id="model-discovery-agent-rank">
    <div className="model-discovery-section-head model-discovery-agent-popularity-head">
      <div>
        <h2>{t("modelsDiscovery.section.agentRank")}</h2>
        {/* 🔴 不要在这里加副标题（prd#1004）。PRD §7「标题为『热门 Agent 排行』，无副标题和
            说明 Banner」+ §4「对外呈现为 ModelGo 平台数据，不暴露 OpenRouter 来源」。
            原先这里渲染「数据来源 openrouter 平台流量 · 共 200 个应用」，两条都违反。
            口径提示（这是该平台流量分布、不是全行业市场份额）另见组件顶部注释第 2 条。 */}
      </div>
      <div aria-label={t("modelsDiscovery.a11y.agentRange")} className="runtime-range-switch" role="radiogroup">
        {agentPopularityPeriods.map((option) => <button aria-checked={period === option.key} className={period === option.key ? "active" : ""} key={option.key} onClick={() => setPeriod(option.key)} role="radio" type="button">{option.label}</button>)}
      </div>
    </div>
    <div className="mg-tile model-discovery-agent-popularity-card">
      {isLoading && apps.length === 0 ? (
        <div className="model-discovery-agent-popularity-grid" role="presentation">
          {[0, 1].map((column) => (
            <div className="model-discovery-agent-popularity-column" key={column} role="presentation">
              {[0, 1, 2, 3, 4].map((row) => (
                <div className="model-discovery-agent-popularity-row" key={row}>
                  <span className="h-4 w-full animate-pulse rounded-sm bg-mg-fill-2" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : isError ? (
        <DiscoveryLoadError onRetry={refetch} text={t("modelsDiscovery.error.appRank")} />
      ) : apps.length === 0 ? (
        <p className="model-discovery-chart-empty-block">{t("modelsDiscovery.empty.appRank")}</p>
      ) : (
        <div className="model-discovery-agent-popularity-grid" id="agent-popularity-list" role="list">
          {agentColumns.map((column, columnIndex) => <div className="model-discovery-agent-popularity-column" key={columnIndex} role="presentation">
            {column.map((agent) => <div className="model-discovery-agent-popularity-row" key={agent.app_id} role="listitem">
              {/* rank 用接口原值 —— 名次有空洞是正常的，不要用下标 */}
              <span className="model-discovery-agent-popularity-rank">{agent.rank}.</span>
              <DiscoveryAgentIcon id={String(agent.app_id)} name={agent.title} />
              <div className="model-discovery-agent-popularity-copy">
                <strong>{agent.title}</strong>
                {agent.description ? <span title={agent.description}>{agent.description}</span> : null}
                {/* 相对条放在 copy 里而不是新起一列：那四列 grid
                    (28px 34px 1fr auto) 加第五个 item 会把条挤到第二行、行高跳变。 */}
                <ProgressBar flow showGlow={false} size="xs" value={Math.max((agent.total_tokens / maxTokens) * 100, 2)} />
              </div>
              <strong className="model-discovery-agent-popularity-usage">{compactTokenUsage(agent.total_tokens)}<span>Tokens</span></strong>
            </div>)}
          </div>)}
        </div>
      )}
      {apps.length > 10 && (
        <div className="model-discovery-rank-more model-discovery-agent-popularity-more">
          <button aria-controls="agent-popularity-list" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)} type="button">{expanded ? t("modelsDiscovery.action.collapse") : t("modelsDiscovery.action.viewMore")}<LuChevronDown aria-hidden="true" className={expanded ? "flip" : ""} size={13} /></button>
        </div>
      )}
    </div>
  </section>;
}
