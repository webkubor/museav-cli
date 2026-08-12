/**
 * API Key 列表表格（PRD v1.0.3）：名称 / 类型 / 负责人 / 安全护栏 / 状态 / 本期消费·限额 / 最近调用 / 到期时间 / 操作
 * 行点击开详情抽屉；治理动作（停用/启用/删除）行内直达，轮转在抽屉；
 * 「删除」对所有状态的 Key 开放（含已过期/已撤销，需求方#485→#554），后端为软删除。
 */
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { TruncatedText } from '@/components/ui/TruncatedText'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/Table'
import { LuCopy, LuFilterX, LuKeyRound, LuLoaderCircle, LuPlus, LuShieldCheck } from 'react-icons/lu'
import { formatDateTimeYMD } from '@/lib/format-date'
import { formatMoney } from '@/lib/utils'
import type { ApiKeyItem, ApiKeyType } from '@/types'
import {
  deriveKeyType,
  keyTypeLabel,
  responsibleOf,
  periodSpendOf,
  lastCalledOf,
  isExpiringSoon,
  isExpiredKey,
  cap,
  formatLimit,
  statusLabel,
  type ApiKeyAction,
} from './derive'

const KEY_TYPE_CLASS: Record<string, string> = {
  personal: 'bg-mg-fill-0 border-mg-border text-mg-text-2',
  member: 'bg-brand-base/10 border-brand-base/25 text-brand-base',
  service: 'bg-blue-500/10 border-blue-500/25 text-blue-600 dark:text-blue-400',
}

type Props = {
  isLoading: boolean
  items: ApiKeyItem[]
  /** 行级动作权限（需求方#68）：按该行 Key 类型 × 动作取权限码 */
  canAction: (type: ApiKeyType, action: ApiKeyAction) => boolean
  canReveal: boolean
  onOpenDetail: (item: ApiKeyItem) => void
  onToggleStatus: (item: ApiKeyItem) => void
  /** 行内「删除」（需求方#485→#554 扩到全部状态）：走父组件删除确认弹窗 */
  onRevoke: (target: { id: string; name: string }) => void
  /** 复制完整明文（#298）：父组件调 reveal → 剪贴板 */
  onCopyKey: (item: ApiKeyItem) => void
  /** 正在 reveal 的 key id（行内 loading） */
  copyingKeyId: string | null
  /** 正在启用的 key id（行内 loading/disabled 反馈；停用走确认弹窗，弹窗自带 loading，此处无需重复） */
  enablePendingId: string | null
  /** 空态分型（PRD §7.4）：当前空间是否有任意 Key（用于区分「无 Key」vs「筛选无结果」） */
  hasKeys: boolean
  /** 是否处于筛选/搜索态 */
  isFiltered: boolean
  /** 是否可创建（无 Key 空态展示创建引导按钮） */
  canCreate: boolean
  /** 可见范围仅限自己（普通 Member，后端只回自己的行）：无 Key 空态显 Member 专属文案（#444） */
  selfScopeOnly: boolean
  /** 无 Key 空态点创建 */
  onCreate: () => void
  /** 筛选无结果空态点清空筛选 */
  onClearFilters: () => void
}

export function ApiKeyTable({
  isLoading,
  items,
  canAction,
  canReveal,
  onOpenDetail,
  onToggleStatus,
  onRevoke,
  onCopyKey,
  copyingKeyId,
  enablePendingId,
  hasKeys,
  isFiltered,
  canCreate,
  selfScopeOnly,
  onCreate,
  onClearFilters,
}: Props) {
  const { t } = useTranslation()
  const colSpan = 9
  const statusMap = {
    active: { label: statusLabel(t, 'active'), variant: 'success' as const, dot: true },
    rotation_required: { label: statusLabel(t, 'rotation_required'), variant: 'info' as const },
    limited: { label: statusLabel(t, 'limited'), variant: 'warning' as const },
    expired: { label: statusLabel(t, 'expired'), variant: 'warning' as const },
    disabled: { label: statusLabel(t, 'disabled'), variant: 'outline' as const },
    revoked: { label: statusLabel(t, 'revoked'), variant: 'danger' as const },
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('apiKeys.table.name')}</TableHead>
          <TableHead>{t('apiKeys.table.type')}</TableHead>
          <TableHead>{t('apiKeys.table.owner')}</TableHead>
          {/* normal-case 覆盖表头 mg-text-label 的 uppercase，保留「Key」首字母大写而非「KEY」 */}
          <TableHead className="normal-case">{t('apiKeys.table.keyGuardrail')}</TableHead>
          <TableHead>{t('apiKeys.table.status')}</TableHead>
          <TableHead>{t('apiKeys.table.periodSpendLimit')}</TableHead>
          <TableHead>{t('apiKeys.table.lastCalled')}</TableHead>
          <TableHead>{t('apiKeys.table.expiresAt')}</TableHead>
          <TableHead className="w-32 text-right">{t('apiKeys.table.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell colSpan={colSpan} className="text-center py-10 text-mg-text-3">{t('common.loading')}</TableCell>
          </TableRow>
        ) : items.length === 0 ? (
          isFiltered && hasKeys ? (
            <EmptyState
              icon={<LuFilterX />}
              title={t('apiKeys.emptyFiltered.title')}
              description={t('apiKeys.emptyFiltered.desc')}
              action={
                <Button variant="outline" size="sm" onClick={onClearFilters}>
                  {t('apiKeys.emptyFiltered.clear')}
                </Button>
              }
              colSpan={colSpan}
            />
          ) : selfScopeOnly ? (
            <EmptyState
              icon={<LuKeyRound />}
              title={t('apiKeys.emptySelfScope.title')}
              description={t('apiKeys.emptySelfScope.desc')}
              action={
                canCreate ? (
                  <Button variant="brand" size="sm" onClick={onCreate}>
                    <LuPlus className="w-4 h-4 mr-1.5" />
                    {t('apiKeys.create')}
                  </Button>
                ) : undefined
              }
              colSpan={colSpan}
            />
          ) : (
            <EmptyState
              icon={<LuKeyRound />}
              title={t('apiKeys.emptyWorkspace.title')}
              description={t('apiKeys.emptyWorkspace.desc')}
              action={
                canCreate ? (
                  <Button variant="brand" size="sm" onClick={onCreate}>
                    <LuPlus className="w-4 h-4 mr-1.5" />
                    {t('apiKeys.create')}
                  </Button>
                ) : undefined
              }
              colSpan={colSpan}
            />
          )
        ) : (
          items.map((record) => {
            // 「Key护栏」列只显示 key 作用域护栏（需求方#246）；全局/个人由 scope 区分不混入
            const guardrailNames = (record.guardrails ?? []).filter((g) => g.scope === 'key').map((g) => g.name).filter(Boolean)
            const keyType = deriveKeyType(record)
            const responsible = responsibleOf(record)
            const creatorDiffers =
              record.owner?.account_id &&
              responsible.account_id &&
              record.owner.account_id !== responsible.account_id
            const periodSpend = periodSpendOf(record)
            // qa#516：限额展示以 effective_limit（含护栏 per_api_key 预算，最严）优先
            const effLimit = record.effective_limit ?? record.limit
            const hasLimit = !!effLimit && Number(effLimit.amount) > 0
            const lastCalled = lastCalledOf(record)
            const isDisabled = record.status === 'disabled'
            const expired = isExpiredKey(record)
            // 行内直达删除对所有状态开放（需求方#554：已过期/已撤销也要能删，后端软删）；权限口径与抽屉 canDelete 一致
            const canDelete = cap(record.capabilities?.can_delete, canAction(keyType, 'revoke'))
            const canToggle = isDisabled
              ? cap(record.capabilities?.can_enable, canAction(keyType, 'disable'))
              : cap(record.capabilities?.can_disable, canAction(keyType, 'disable'))
            const copyDisabledReason =
              !canReveal
                ? t('apiKeys.table.copyForbidden')
                : record.status !== 'active'
                ? t('apiKeys.table.copyUnavailableInactive')
                : record.revealable
                  ? null
                  : t('apiKeys.table.copyUnavailableLegacy')
            return (
              <TableRow
                key={record.api_key_id}
                className="cursor-pointer"
                onClick={() => onOpenDetail(record)}
              >
                <TableCell>
                  <TruncatedText text={record.name} maxWidth={200} className="font-semibold text-mg-text-1 text-[13.5px]" />
                  {/* #298：名称下方掩码 + 复制完整明文按钮 */}
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="font-mono text-xs text-mg-text-3 tracking-tight cursor-help" title={t('apiKeys.table.maskedTitle')}>{record.masked}</span>
                    <button
                      type="button"
                      aria-label={copyDisabledReason ?? t('apiKeys.table.copy')}
                      title={copyDisabledReason ?? t('apiKeys.table.copy')}
                      disabled={copyDisabledReason !== null || copyingKeyId !== null}
                      onClick={(e) => { e.stopPropagation(); onCopyKey(record) }}
                      className="p-0.5 text-mg-text-3 hover:text-brand-base transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-mg-text-3"
                    >
                      {copyingKeyId === record.api_key_id ? (
                        <LuLoaderCircle className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <LuCopy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${KEY_TYPE_CLASS[keyType]}`}>
                    {keyTypeLabel(t, keyType)}
                  </span>
                </TableCell>
                <TableCell>
                  <TruncatedText
                    text={responsible.display_name || responsible.email}
                    maxWidth={140}
                    className="text-xs font-semibold text-mg-text-2"
                  />
                  {creatorDiffers && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-mg-text-3">
                      <span className="shrink-0">{t('apiKeys.table.creator')}</span>
                      <TruncatedText
                        text={record.owner.display_name || record.owner.email}
                        maxWidth={110}
                        className="text-xs text-mg-text-3"
                      />
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {guardrailNames.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {guardrailNames.slice(0, 3).map((name) => (
                        <span
                          key={name}
                          title={name}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-500/10 border border-green-500/25 text-green-600 cursor-help"
                        >
                          <LuShieldCheck className="w-3 h-3 shrink-0" />
                          {name}
                        </span>
                      ))}
                      {guardrailNames.length > 3 && (
                        <span
                          title={guardrailNames.slice(3).join(' / ')}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-mg-fill-0 border border-mg-border text-mg-text-3 cursor-help"
                        >
                          +{guardrailNames.length - 3}
                        </span>
                      )}
                    </div>
                  ) : (
                    // 无 key 作用域护栏（需求方#246）：显示「不使用Key护栏」，与详情抽屉 Key 护栏槽口径一致
                    <span className="text-mg-text-3 text-xs">{t('apiKeys.guardrail.none')}</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={record.status} statusMap={statusMap} fallback={record.status} />
                </TableCell>
                <TableCell>
                  <div className="font-mono text-xs text-mg-text-1 tabular-nums">
                    {periodSpend?.amount
                      ? `${periodSpend.currency} ${formatMoney(periodSpend.amount, '')}`
                      : <span className="text-mg-text-3">—</span>}
                  </div>
                  {/* #148：限额直接带「限额」前缀，一眼区分于上方本期消费，无需额外 Hint */}
                  <div
                    className={`text-xs text-mg-text-3${hasLimit ? ' cursor-help' : ''}`}
                    title={hasLimit ? t('apiKeys.table.effectiveLimitTitle') : undefined}
                  >{hasLimit ? t('apiKeys.table.limitValue', { value: formatLimit(record, t) }) : formatLimit(record, t)}</div>
                </TableCell>
                <TableCell className="text-xs text-mg-text-2">
                  {lastCalled ? formatDateTimeYMD(lastCalled) : <span className="text-mg-text-3">{t('apiKeys.table.notCalled')}</span>}
                </TableCell>
                <TableCell className="text-xs">
                  {!record.expires_at ? (
                    <span className="text-mg-text-3">{t('apiKeys.table.neverExpires')}</span>
                  ) : expired ? (
                    <span className="inline-flex items-center gap-1.5 text-mg-danger font-semibold">
                      {formatDateTimeYMD(record.expires_at)}
                      <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-mg-danger/10 border border-mg-danger/20">
                        {t('apiKeys.table.expired')}
                      </span>
                    </span>
                  ) : (
                    <span className={isExpiringSoon(record) ? 'text-mg-warning font-semibold' : 'text-mg-text-2'}>
                      {formatDateTimeYMD(record.expires_at)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-4 whitespace-nowrap text-xs font-bold">
                    <button
                      onClick={() => onOpenDetail(record)}
                      className="text-brand-base hover:text-brand-deep transition-colors cursor-pointer"
                    >
                      {t('apiKeys.table.detail')}
                    </button>
                    {record.status !== 'revoked' && canToggle && (() => {
                      // 启用无二次确认，直达 mutation：需行内 loading/disabled 反馈，防重复点击（停用走确认弹窗，弹窗自带 loading）
                      const enabling = isDisabled && enablePendingId === record.api_key_id
                      return (
                        <button
                          onClick={() => onToggleStatus(record)}
                          disabled={enabling}
                          className="text-mg-text-2 hover:text-mg-text-1 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {enabling ? (
                            <span className="inline-flex items-center gap-1">
                              <LuLoaderCircle className="w-3 h-3 animate-spin" />
                              {t('apiKeys.table.enabling')}
                            </span>
                          ) : isDisabled ? t('apiKeys.table.enable') : t('apiKeys.table.disable')}
                        </button>
                      )
                    })()}
                    {canDelete && (
                      <button
                        onClick={() => onRevoke({ id: record.api_key_id, name: record.name })}
                        className="text-mg-danger hover:text-mg-danger/80 transition-colors cursor-pointer"
                      >
                        {t('apiKeys.table.delete')}
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
