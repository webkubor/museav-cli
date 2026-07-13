import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/DateRangePicker'
import Select from '@/components/ui/Select'
import {
  KEY_TYPE_ALL,
  API_KEY_TYPE_ORDER,
  API_KEY_TYPE_I18N_KEY,
  type ApiKeyTypeFilter,
} from '@/lib/api-key-type-filter'

type WorkspaceOption = {
  workspace_id: string
  name: string
}

interface UsageFilterPanelProps {
  filterWorkspaceId: string
  labels: {
    customRangePlaceholder: string
    time: string
    title: string
    workspaces: string
  }
  onTimeRangeChange: (value: DateRangeValue) => void
  onWorkspaceChange: (value: string) => void
  presets: Array<{ key: string; label: string }>
  timeRange: DateRangeValue
  workspaceList: WorkspaceOption[]
  /** API Key 类型筛选（需求 #22）；未传 onKeyTypeChange 时不渲染该项 */
  keyTypeFilter?: ApiKeyTypeFilter
  onKeyTypeChange?: (value: ApiKeyTypeFilter) => void
  /** 个人租户无「成员 Key」，隐藏 member 选项 */
  hideMemberType?: boolean
}

export function UsageFilterPanel({
  filterWorkspaceId,
  labels,
  onTimeRangeChange,
  onWorkspaceChange,
  presets,
  timeRange,
  workspaceList,
  keyTypeFilter,
  onKeyTypeChange,
  hideMemberType,
}: UsageFilterPanelProps) {
  const { t } = useTranslation()
  const showKeyType = !!onKeyTypeChange
  const typeOptions = API_KEY_TYPE_ORDER.filter((v) => !(hideMemberType && v === 'member'))
  return (
    <div className="usage-filter-line">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_minmax(180px,240px)_minmax(150px,180px)]">
        <UsageFilterField label={labels.time}>
          <DateRangePicker
            value={timeRange}
            onChange={onTimeRangeChange}
            presets={presets}
            placeholder={labels.customRangePlaceholder}
          />
        </UsageFilterField>

        <UsageFilterField label={labels.workspaces}>
          <Select
            value={filterWorkspaceId === '' ? '__all__' : filterWorkspaceId}
            onChange={onWorkspaceChange}
            placeholder={labels.workspaces}
          >
            <Select.Option value="__all__">{labels.workspaces}</Select.Option>
            {workspaceList.map((workspace) => (
              <Select.Option key={workspace.workspace_id} value={workspace.workspace_id}>
                {workspace.name}
              </Select.Option>
            ))}
          </Select>
        </UsageFilterField>

        {showKeyType && (
          <UsageFilterField label={t('common.keyTypeFilter.label')}>
            <Select
              value={keyTypeFilter ?? KEY_TYPE_ALL}
              onChange={(v) => onKeyTypeChange?.(v as ApiKeyTypeFilter)}
            >
              <Select.Option value={KEY_TYPE_ALL}>{t('common.keyTypeFilter.all')}</Select.Option>
              {typeOptions.map((v) => (
                <Select.Option key={v} value={v}>
                  {t(API_KEY_TYPE_I18N_KEY[v])}
                </Select.Option>
              ))}
            </Select>
          </UsageFilterField>
        )}
      </div>
    </div>
  )
}

function UsageFilterField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="mg-text-label text-mg-text-3">{label}</span>
      {children}
    </label>
  )
}
