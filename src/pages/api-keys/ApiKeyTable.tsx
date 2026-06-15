/**
 * API Key 列表表格：名称、凭证掩码、作用域、状态、累计消费、创建时间与操作
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
import { LuKeyRound } from 'react-icons/lu'
import { formatDateTime } from '@/lib/format-date'
import type { ApiKeyItem } from '@/types'
import { SCOPE_OPTIONS } from './constants'

type Props = {
  isLoading: boolean
  items: ApiKeyItem[]
  canRevoke: boolean
  onRevoke: (target: { id: string; name: string }) => void
  onEditGuardrail: (item: ApiKeyItem) => void
}

export function ApiKeyTable({ isLoading, items, canRevoke, onRevoke, onEditGuardrail }: Props) {
  const { t } = useTranslation()

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('apiKeys.table.name')}</TableHead>
          <TableHead>{t('apiKeys.table.credentials')}</TableHead>
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
          items.map((record) => (
            <TableRow key={record.api_key_id}>
              <TableCell className="font-semibold text-mg-text-0 text-[13.5px]">{record.name}</TableCell>
              <TableCell>
                <span className="font-mono text-xs bg-mg-bg-1 border border-mg-border px-2.5 py-1 rounded text-mg-text-1">
                  {record.masked}
                </span>
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
                    切换护栏
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
          ))
        )}
      </TableBody>
    </Table>
  )
}
