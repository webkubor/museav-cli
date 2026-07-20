import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, keepPreviousData } from '@tanstack/react-query'
import { LuArrowRight, LuClipboardList, LuDownload } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { StatusConfig } from '@/components/ui/StatusBadge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table'
import { useCursorPager } from '@/hooks/use-cursor-pager'
import { useMediaQuery } from '@/hooks/use-media-query'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { appToast } from '@/lib/app-toast'
import { formatDateTimeWithSeconds } from '@/lib/format-date'
import { isApiErrorCode } from '@/lib/request-error-message'
import { cn } from '@/lib/utils'
import { trackEvent } from '@/lib/track'
import { exportTenantAuditLogs, getTenantAuditLog, listTenantAuditLogs } from '@/services/tenants'
import { auditActionLabel } from '../audit-labels'
import { listWorkspaces } from '@/services/workspaces'
import type { TenantAuditLog } from '@/types'

const PAGE_SIZE = 20

function todayStamp() {
  return new Date().toISOString().slice(0, 10)
}

function triggerCsvDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** 详情面板的单行字段（复用 logs/detail.tsx 的排布风格） */
function AuditFieldRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-center justify-between gap-4 border-b border-mg-border/60 px-3 py-2 last:border-b-0">
      <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-mg-text-3">{label}</span>
      <strong className={cn('min-w-0 break-all text-right text-xs font-semibold text-mg-text-1', mono && 'font-mono')}>
        {value}
      </strong>
    </div>
  )
}

/** 右侧常驻面板 / 移动端 Modal 共用的详情内容（对齐 PRD EnterpriseAuditTab 详情区）。 */
function AuditDetailContent({
  detail,
  isLoading,
  scopeText,
}: {
  detail: TenantAuditLog | null
  isLoading: boolean
  scopeText: string
}) {
  const { t } = useTranslation()

  // 集合字段折叠：默认展示前 10 项，超出可展开/收起；切换审计条目时重置为折叠态
  // （渲染期对比上次 id，避免 effect 内 setState）
  const COLLAPSE_LIMIT = 10
  const [showAllChanges, setShowAllChanges] = useState(false)
  const [observedDetailId, setObservedDetailId] = useState(detail?.id)
  if (detail?.id !== observedDetailId) {
    setObservedDetailId(detail?.id)
    setShowAllChanges(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-mg-border border-t-brand-base" />
      </div>
    )
  }
  if (!detail) return null

  const changesOverLimit = detail.changes.length > COLLAPSE_LIMIT
  const visibleChanges = showAllChanges ? detail.changes : detail.changes.slice(0, COLLAPSE_LIMIT)

  const errorCode = detail.result === 'failure'
    ? (detail.metadata?.error_code as string | number | undefined)
    : undefined
  const changesTitle = detail.result === 'failure'
    ? t('enterprise.audit.detailAttemptedChanges')
    : t('enterprise.audit.detailChanges')

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-mg-border/60">
        <AuditFieldRow label={t('enterprise.audit.detailAction')} value={auditActionLabel(detail.action)} />
        <AuditFieldRow label={t('enterprise.audit.detailActor')} value={detail.actor_display || '—'} />
        <AuditFieldRow label={t('enterprise.audit.colTarget')} value={detail.target_label || detail.target_id} />
        <AuditFieldRow label={t('enterprise.audit.detailScope')} value={scopeText} />
        <AuditFieldRow label={t('enterprise.audit.detailRequestId')} value={detail.request_id} mono />
        {errorCode != null && (
          <AuditFieldRow label={t('enterprise.audit.detailErrorCode')} value={String(errorCode)} mono />
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-mg-text-3">{changesTitle}</p>
        {detail.changes.length === 0 ? (
          <p className="text-xs text-mg-text-3">{t('enterprise.audit.detailNoChanges')}</p>
        ) : (
          <>
            <ul className="space-y-2">
              {visibleChanges.map((change) => (
                <li key={change.field} className="rounded-md border border-mg-border/50 bg-mg-fill-0/30 p-2.5">
                  <div className="mb-1 text-xs font-bold text-mg-text-3">{change.field}</div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <s className="min-w-0 truncate text-mg-text-4">{change.before || '—'}</s>
                    <LuArrowRight className="h-3 w-3 shrink-0 text-mg-text-4" />
                    <strong className="min-w-0 truncate font-bold text-mg-text-1">{change.after || '—'}</strong>
                  </div>
                </li>
              ))}
            </ul>
            {changesOverLimit && (
              <button
                type="button"
                onClick={() => setShowAllChanges((v) => !v)}
                className="mt-2 text-xs font-bold text-brand-base hover:text-brand-base/80 bg-transparent border-none p-0 cursor-pointer transition-colors"
              >
                {showAllChanges
                  ? t('enterprise.audit.changesCollapse')
                  : t('enterprise.audit.changesShowAll', { count: detail.changes.length })}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * 操作审计页签（#389，对齐后端 #342）。
 * 列表游标翻页 + 右侧常驻详情面板（窄屏退化为 Modal），导出走 CSV 下载。
 * 详情不用列表行自带的 changes/metadata——按 #342 约定单独拉 /audit-logs/:id
 * 拿权威详情，列表行仅作为详情加载前的即时占位，避免空白闪烁。
 */
export function AuditTab({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()
  const canExport = hasPermission(PERMS.ORG_AUDIT_EXPORT)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const pager = useCursorPager()

  // 切换组织后回到第一页并清空选中行——用「渲染期调整状态」模式（React 官方推荐），
  // 不用 useEffect，避免 setState 触发级联渲染（react-hooks/set-state-in-effect）。
  const [observedTenantId, setObservedTenantId] = useState(tenantId)
  if (tenantId !== observedTenantId) {
    setObservedTenantId(tenantId)
    setSelectedId(null)
    pager.reset()
  }

  const listQuery = useQuery({
    queryKey: ['tenant-audit-logs', tenantId, pager.page, pager.cursor],
    queryFn: () => listTenantAuditLogs(tenantId, { cursor: pager.cursor, limit: PAGE_SIZE }),
    enabled: Boolean(tenantId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })
  const items = listQuery.data?.items ?? []
  const hasMore = Boolean(listQuery.data?.next_cursor)

  // 工作空间名称反查（作用范围列）——与 MembersTab 共享同一 queryKey，天然复用缓存。
  const workspacesQuery = useQuery({
    queryKey: ['workspaces', tenantId],
    queryFn: () => listWorkspaces().then((res) => res.items ?? []),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const workspaceNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const ws of workspacesQuery.data ?? []) map.set(ws.workspace_id, ws.name)
    return map
  }, [workspacesQuery.data])

  function scopeText(workspaceId: string | null | undefined) {
    if (!workspaceId) return t('enterprise.audit.scopeTenant')
    const name = workspaceNameById.get(workspaceId) || workspaceId
    return t('enterprise.audit.scopeWorkspace', { name })
  }

  const selectedListRow = items.find((item) => item.id === selectedId) ?? null
  const detailQuery = useQuery({
    queryKey: ['tenant-audit-log', tenantId, selectedId],
    queryFn: () => getTenantAuditLog(tenantId, selectedId as string),
    enabled: Boolean(tenantId && selectedId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const detail = detailQuery.data ?? selectedListRow
  const detailLoading = detailQuery.isLoading && !selectedListRow

  const RESULT_STATUS_MAP: Record<string, StatusConfig> = {
    success: { label: t('enterprise.audit.resultSuccess'), variant: 'success', dot: true },
    failure: { label: t('enterprise.audit.resultFailure'), variant: 'danger', dot: true },
    denied: { label: t('enterprise.audit.resultDenied'), variant: 'danger', dot: true },
  }

  const exportMutation = useMutation({
    mutationFn: () => exportTenantAuditLogs(tenantId),
    onSuccess: (blob) => {
      triggerCsvDownload(blob, `audit-logs-${tenantId}-${todayStamp()}.csv`)
      appToast.success(t('enterprise.audit.exportSuccess'))
    },
    onError: (err: unknown) => {
      if (isApiErrorCode(err, 40301)) {
        appToast.error(t('enterprise.audit.exportNoPermission'))
        return
      }
      appToast.requestError(err, t('enterprise.audit.exportError'))
    },
  })

  function goPrev() {
    setSelectedId(null)
    pager.prev()
  }
  function goNext() {
    setSelectedId(null)
    pager.next(listQuery.data?.next_cursor)
  }

  const tableHead = (
    <TableHeader>
      <TableRow>
        <TableHead>{t('enterprise.audit.colTime')}</TableHead>
        <TableHead>{t('enterprise.audit.colActor')}</TableHead>
        <TableHead>{t('enterprise.audit.colAction')}</TableHead>
        <TableHead>{t('enterprise.audit.colTarget')}</TableHead>
        <TableHead>{t('enterprise.audit.colScope')}</TableHead>
        <TableHead>{t('enterprise.audit.colResult')}</TableHead>
      </TableRow>
    </TableHeader>
  )

  const detailBody = (
    <AuditDetailContent
      detail={detail}
      isLoading={detailLoading}
      scopeText={detail ? scopeText(detail.workspace_id) : ''}
    />
  )

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg overflow-hidden shadow-sm lg:col-span-2">
        <div className="flex items-center justify-between p-4 border-b border-mg-border/50 bg-mg-fill-0/20">
          <span className="text-xs font-bold text-mg-text-1">{t('enterprise.tabs.audit')}</span>
          {canExport && (
            <Button
              variant="outline"
              size="sm"
              loading={exportMutation.isPending}
              onClick={() => { trackEvent('organization:audit_export'); exportMutation.mutate() }}
              className="h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5"
            >
              <LuDownload size={13} />
              {t('enterprise.audit.export')}
            </Button>
          )}
        </div>

        <div className="overflow-x-auto w-full p-2">
          {listQuery.isLoading ? (
            <div className="py-12 flex justify-center items-center">
              <div className="w-6 h-6 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
            </div>
          ) : listQuery.isError ? (
            <EmptyState title={t('enterprise.audit.loadError')} />
          ) : items.length === 0 ? (
            <Table>
              {tableHead}
              <TableBody>
                <EmptyState
                  colSpan={6}
                  title={t('enterprise.audit.emptyTitle')}
                  description={t('enterprise.audit.emptyDesc')}
                />
              </TableBody>
            </Table>
          ) : (
            <Table>
              {tableHead}
              <TableBody>
                {items.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={() => setSelectedId(row.id === selectedId ? null : row.id)}
                    data-state={selectedId === row.id ? 'selected' : undefined}
                    className="cursor-pointer"
                  >
                    <TableCell className="whitespace-nowrap font-mono text-xs text-mg-text-2">
                      {formatDateTimeWithSeconds(row.created_at)}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-mg-text-1">{row.actor_display || '—'}</TableCell>
                    <TableCell className="text-xs text-mg-text-2">{auditActionLabel(row.action)}</TableCell>
                    <TableCell className="max-w-[160px] truncate text-xs text-mg-text-2" title={row.target_label}>
                      {row.target_label || row.target_id || '—'}
                    </TableCell>
                    {/* break-keep：作用范围含 CJK 词（如「默认项目」），禁止词中折行，只在「 / 」分隔处换行 */}
                    <TableCell className="break-keep text-xs text-mg-text-3">{scopeText(row.workspace_id)}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.result} statusMap={RESULT_STATUS_MAP} fallback={row.result} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {(pager.page > 1 || hasMore) && (
          <Pagination
            mode="cursor"
            page={pager.page}
            hasMore={hasMore}
            loading={listQuery.isFetching}
            onPrev={goPrev}
            onNext={goNext}
          />
        )}
      </div>

      {/* 桌面：右侧常驻详情面板（对齐 PRD aside 结构）；窄屏隐藏，退化为下方 Modal。 */}
      {isDesktop && (
        <aside className="self-start lg:col-span-1 rounded-lg border border-mg-border/50 bg-mg-bg-0 shadow-sm p-5">
          <div className="mb-4 flex items-center gap-2">
            <LuClipboardList size={14} className="text-brand-base" />
            <span className="text-xs font-bold text-mg-text-1">{t('enterprise.audit.detailTitle')}</span>
          </div>
          {!detail ? (
            <EmptyState icon={<LuClipboardList />} title={t('enterprise.audit.detailPlaceholder')} />
          ) : (
            detailBody
          )}
        </aside>
      )}

      {!isDesktop && (
        <Modal
          open={selectedId !== null}
          onClose={() => setSelectedId(null)}
          size="md"
          title={t('enterprise.audit.detailTitle')}
        >
          {detailBody}
        </Modal>
      )}
    </div>
  )
}
