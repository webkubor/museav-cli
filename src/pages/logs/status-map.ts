import type { StatusConfig } from '@/components/ui/StatusBadge'
import type { DerivedLogStatus } from './guardrail'

/** 派生三态 → StatusBadge 配置。i18n 文案在此注入。
 *  调用日志状态语义的唯一真源，日志列表/详情、总览「最近调用」共用同一份映射（需求方#174）。
 *  独立成非组件模块，避免混在 *.tsx 里触发 react-refresh/only-export-components。 */
export function buildStatusMap(t: (key: string) => string): Record<DerivedLogStatus, StatusConfig> {
  return {
    success: { label: t('logs.status.success'), variant: 'success' },
    guarded: { label: t('logs.status.guarded'), variant: 'warning' },
    error: { label: t('logs.status.error'), variant: 'danger' },
  }
}
