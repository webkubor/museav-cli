import type { ReactNode } from 'react'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/DateRangePicker'
import Select from '@/components/ui/Select'
import { cn } from '@/lib/utils'

type WorkspaceOption = {
  workspace_id: string
  name: string
}

interface UsageFilterPanelProps {
  filterWorkspaceId: string
  labels: {
    customRangePlaceholder: string
    time: string
    workspace: string
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
    <div className="flex flex-wrap items-end gap-3">
      <UsageFilterField label={labels.time}>
        <DateRangePicker
          value={timeRange}
          onChange={onTimeRangeChange}
          presets={presets}
          placeholder={labels.customRangePlaceholder}
        />
      </UsageFilterField>

      <UsageFilterField label={labels.workspace} className="w-full sm:w-60">
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
  )
}

function UsageFilterField({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="mg-text-label text-mg-text-3">{label}</span>
      {children}
    </label>
  )
}
