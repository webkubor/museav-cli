/**
 * API Key 列表表格：名称、安全护栏、作用域、状态、累计消费、创建时间与操作
 */
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/Table'
import { LuKeyRound, LuShieldCheck } from 'react-icons/lu'
import { formatDateTime } from '@/lib/format-date'
import type { ApiKeyItem } from '@/types'
import { SCOPE_OPTIONS } from './constants'

type Props = {
  isLoading: boolean
  items: ApiKeyItem[]
  canRevoke: boolean
  onRevoke: (target: { id: string; name: string }) => void
  onEditGuardrail: (item: ApiKeyItem) => void
  guardrailsByKey?: Record<string, string[]>
}

export function ApiKeyTable({ isLoading, items, canRevoke, onRevoke, onEditGuardrail, guardrailsByKey = {} }: Props) {
  const { t } = useTranslation()

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('apiKeys.table.name')}</TableHead>
          <TableHead>
            <span className="inline-flex items-center gap-1">
              <LuShieldCheck className="w-3.5 h-3.5 text-green-500" />
              安全护栏
            </span>
          </TableHead>
          <TableHead>作用域</TableHead>
          <TableHead>{t('apiKeys.table.status')}</TableHead>
          <TableHead>{t('apiKeys.table.totalSpend')}</TableHead>
          <TableHead>{t('apiKeys.table.createdAt')}</TableHead>
          <TableHead className="text-right">{t('apiKeys.table.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center py-10 text-mg-text-2">{t('common.loading')}</TableCell>
          </TableRow>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<LuKeyRound />}
            title={t('apiKeys.table.noData')}
            colSpan={7}
          />
        ) : (
          items.map((record) => {
            const guardrailNames = guardrailsByKey[record.api_key_id] ?? []
            return (
              <TableRow key={record.api_key_id}>
                <TableCell className="font-semibold text-mg-text-0 text-[13.5px]">{record.name}</TableCell>
                <TableCell>
                  {guardrailNames.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {guardrailNames.slice(0, 3).map((name) => (
                        <span
                          key={name}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-500/10 border border-green-500/25 text-green-600"
                        >
                          <LuShieldCheck className="w-3 h-3 shrink-0" />
                          {name}
                        </span>
                      ))}
                      {guardrailNames.length > 3 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-mg-fill-0 border border-mg-border text-mg-text-2">
                          +{guardrailNames.length - 3}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-mg-text-2 text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {record.scope
                    ? (() => {
                        const opt = SCOPE_OPTIONS.find((o) => o.value === record.scope)
                        return opt ? (
                          <span className="inline-flex items-center gap-1 text-xs text-mg-text-1">
                            <span className="text-mg-text-2">{opt.icon}</span>
                            {opt.label}
                          </span>
                        ) : <span className="text-mg-text-2 text-xs">—</span>
                      })()
                    : <span className="text-mg-text-2 text-xs">—</span>
                  }
                </TableCell>
                <TableCell>
                  <StatusBadge
                    status={record.status}
                    statusMap={{
                      active: { label: t('apiKeys.table.active'), variant: 'success', dot: true },
                      inactive: { label: t('apiKeys.table.disabled'), variant: 'outline' },
                    }}
                    fallback={record.status}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs text-mg-text-0 tabular-nums">
                  {record.total_spend?.amount
                    ? `${record.total_spend.currency} ${parseFloat(record.total_spend.amount).toFixed(4)}`
                    : <span className="text-mg-text-2">—</span>}
                </TableCell>
                <TableCell className="text-xs text-mg-text-1">{formatDateTime(record.created_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-4 text-xs font-bold">
                    <button
                      onClick={() => onEditGuardrail(record)}
                      className="text-brand-base hover:text-brand-deep transition-colors cursor-pointer"
                    >
                      编辑
                    </button>
                    {canRevoke && (
                      <button
                        onClick={() => onRevoke({ id: record.api_key_id, name: record.name })}
                        className="text-mg-danger hover:text-mg-danger/80 transition-colors cursor-pointer"
                      >
                        {t('apiKeys.table.revoke')}
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })
        )}
      </TableBody>
    </Table>
  )
}
