import type { ReactNode } from 'react'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/DateRangePicker'
import Select from '@/components/ui/Select'

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
}

export function UsageFilterPanel({
  filterWorkspaceId,
  labels,
  onTimeRangeChange,
  onWorkspaceChange,
  presets,
  timeRange,
  workspaceList,
}: UsageFilterPanelProps) {
  return (
    <div className="usage-filter-line">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_minmax(180px,240px)]">
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
