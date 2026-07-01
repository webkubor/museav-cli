import { useTranslation } from 'react-i18next'
import { LuDownload } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, TableHeader, TableRow, TableHead, TableBody } from '@/components/ui/Table'

/**
 * 操作审计页签。
 * 后端目前没有管理审计聚合接口 → 全空态，导出按钮 disabled。
 * TODO(后端待接): 管理审计聚合接口（时间/操作人/动作/对象/作用范围/结果 + 行详情 + 导出）
 */
export function AuditTab() {
  const { t } = useTranslation()

  return (
    <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg overflow-hidden shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-mg-border/50 bg-mg-fill-0/20">
        <span className="text-xs font-bold text-mg-text-1">{t('enterprise.tabs.audit')}</span>
        <Button
          variant="outline"
          size="sm"
          disabled
          title={t('enterprise.audit.emptyDesc')}
          className="h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5"
        >
          <LuDownload size={13} />
          {t('enterprise.audit.export')}
        </Button>
      </div>
      <div className="overflow-x-auto w-full p-2">
        <Table>
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
          <TableBody>
            <EmptyState
              colSpan={6}
              title={t('enterprise.audit.emptyTitle')}
              description={t('enterprise.audit.emptyDesc')}
            />
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
