/**
 * 调用记录的 Token 用量单元格：总数 + 输入/输出分项。
 *
 * 抽出来是因为调用日志页与总览「最近调用」要求视觉完全一致（需求方 2026-08-19）。
 * 两处各写一份的话，改文案、改配色、改「未开始调用」的兜底都得记得同步两遍，
 * 迟早分叉——所以这里是这块 UI 的单一实现，两边都引它。
 *
 * 三种状态刻意区分开，别合并：
 *   · 模型未开始调用（护栏前置拦截等）→ 「—」+ 说明，不是 0
 *   · 有 token → 总数 + 输入/输出
 *   · 总数为 0 → 同样走「—」，避免展示无意义的 0
 */
import { useTranslation } from 'react-i18next'
import { formatNumber } from '@/lib/utils'
import { isAsyncCall } from '@/pages/logs/async-call'
import { isModelNotStarted } from '@/pages/logs/guardrail'
import type { CallLogItem } from '@/types'

export function TokenUsageCell({ row }: { row: CallLogItem }) {
  const { t } = useTranslation()

  if (isModelNotStarted(row) || !(row.usage?.total_tokens > 0)) {
    return (
      <div className="min-w-0">
        <strong className="block text-mg-text-3">—</strong>
        <span className="block mg-text-caption text-mg-text-3">{t(isAsyncCall(row) ? 'logs.metrics.asyncNotCounted' : 'logs.metrics.noTokens')}</span>
      </div>
    )
  }

  // 两行：T+总数一行、输入/输出一行（需求方定；比原三行紧凑、比一行清晰）
  return (
    <div className="min-w-0 whitespace-nowrap font-mono tabular-nums">
      <div className="flex items-center gap-1">
        {/* 「T」= Token 总量标记，颜色走 success 语义 token。 */}
        <span
          className="inline-flex cursor-default items-center justify-center rounded-sm bg-[var(--mg-success-bg)] px-1 py-0.5 text-[10px] font-bold leading-none text-[var(--mg-success-text)] transition-colors hover:bg-[var(--mg-success-bg-hover)]"
          title={t('logs.table.totalTokenTooltip')}
          aria-label={t('logs.table.totalTokenAria')}
        >T</span>
        <strong className="font-bold text-mg-text-1">{formatNumber(row.usage.total_tokens)}</strong>
      </div>
      <div className="mt-0.5 mg-text-caption text-mg-text-3">
        {t('logs.table.inputOutputTokens', {
          input: formatNumber(row.usage.input_tokens),
          output: formatNumber(row.usage.output_tokens),
        })}
      </div>
    </div>
  )
}
