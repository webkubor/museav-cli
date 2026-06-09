import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { Badge } from '@/components/ui/Badge'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/Table'
import { LuSettings } from 'react-icons/lu'
import type { GuardrailDetail } from '@/interfaces/guardrails'
import { formatDateTime } from '@/lib/format-date'

export function guardrailMetadataList(row: GuardrailDetail, key: 'model_blacklist' | 'ip_whitelist') {
  const value = row.metadata?.[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

export function boundApiKeyCount(row: GuardrailDetail) {
  return row.assignments.filter((item) => item.subject_type === 'api_key' && item.api_key_id).length
}

function LimitCell({ values, emptyLabel }: { values: string[]; emptyLabel: string }) {
  if (values.length === 0) {
    return <span className="text-xs text-mg-text-2">{emptyLabel}</span>
  }

  return (
    <div className="flex max-w-[280px] flex-wrap gap-1.5">
      {values.slice(0, 3).map((value) => (
        <span
          key={value}
          className="rounded-full border border-mg-border bg-mg-fill-0 px-2 py-0.5 font-mono text-[11px] font-semibold text-mg-text-1"
        >
          {value}
        </span>
      ))}
      {values.length > 3 && (
        <span className="rounded-full bg-mg-fill-1 px-2 py-0.5 text-[11px] font-bold text-mg-text-2">
          +{values.length - 3}
        </span>
      )}
    </div>
  )
}

export function GuardrailTable({
  guardrails,
  isLoading,
  canEdit,
  canDelete,
  onOpenDetail,
  onToggle,
  onDelete,
}: {
  guardrails: GuardrailDetail[]
  isLoading: boolean
  canEdit: boolean
  canDelete: boolean
  onOpenDetail: (id: string) => void
  onToggle: (args: { id: string; status: 'active' | 'inactive' }) => void
  onDelete: (target: { id: string; name: string }) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="card-shadow-adaptive bg-card-bg rounded-xl border border-mg-border overflow-hidden">
      {isLoading ? (
        <div className="p-10 space-y-4 animate-pulse">
          <div className="h-6 bg-mg-fill-0 rounded w-1/4" />
          <div className="h-4 bg-mg-fill-0 rounded w-full" />
        </div>
      ) : guardrails.length === 0 ? (
        <div className="py-20 text-center text-xs italic text-mg-text-2">{t('guardrails.empty')}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('guardrails.table.name')}</TableHead>
              <TableHead>{t('guardrails.table.modelBlacklist')}</TableHead>
              <TableHead>{t('guardrails.table.ipWhitelist')}</TableHead>
              <TableHead>{t('guardrails.table.boundKeys')}</TableHead>
              <TableHead>{t('guardrails.table.status')}</TableHead>
              <TableHead>{t('guardrails.table.createdAt')}</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {guardrails.map((row) => {
              const modelBlacklistValues = guardrailMetadataList(row, 'model_blacklist')
              const ipWhitelistValues = guardrailMetadataList(row, 'ip_whitelist')
              const apiKeyCount = boundApiKeyCount(row)

              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => onOpenDetail(row.id)}
                      className="group flex max-w-[260px] items-center gap-2 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-bold text-mg-text-0 group-hover:text-brand-base">
                          {row.name}
                        </span>
                        {row.description && (
                          <span className="mt-0.5 block truncate text-[11px] font-medium text-mg-text-2">
                            {row.description}
                          </span>
                        )}
                      </span>
                      {row.is_default && (
                        <Badge variant="warning" className="shrink-0">
                          {t('guardrails.table.defaultBadge')}
                        </Badge>
                      )}
                    </button>
                  </TableCell>
                  <TableCell>
                    <LimitCell values={modelBlacklistValues} emptyLabel={t('guardrails.table.unlimited')} />
                  </TableCell>
                  <TableCell>
                    <LimitCell values={ipWhitelistValues} emptyLabel={t('guardrails.table.unlimited')} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={apiKeyCount > 0 ? 'info' : 'outline'}>
                      {apiKeyCount} {t('guardrails.table.keyUnit')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.status === 'active'}
                      disabled={!canEdit}
                      onChange={(checked) =>
                        onToggle({ id: row.id, status: checked ? 'active' : 'inactive' })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-xs text-mg-text-2">{formatDateTime(row.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {canEdit && (
                        <Button size="sm" variant="outline" onClick={() => onOpenDetail(row.id)} className="h-7 text-xs font-semibold">
                          <LuSettings className="w-3.5 h-3.5 mr-1" />
                          {t('guardrails.table.configure')}
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="sm" variant="destructive" onClick={() => onDelete({ id: row.id, name: row.name })} className="h-7 text-xs">
                          {t('guardrails.table.delete')}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
