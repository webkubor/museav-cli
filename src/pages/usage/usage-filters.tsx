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
    workspaces: string
  }
  onTimeRangeChange: (value: DateRangeValue) => void
  onWorkspaceChange: (value: string) => void
  presets: Array<{ key: string; label: string }>
  timeRange: DateRangeValue
  workspaceList: WorkspaceOption[]
}

/**
 * 成本概览筛选条（对齐 PRD）：时间 / 工作空间两枚下拉，无独立字段标签，
 * 下拉当前值自描述（如「本月」「全部工作空间」）。
 */
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
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-full sm:w-auto">
        <DateRangePicker
          value={timeRange}
          onChange={onTimeRangeChange}
          presets={presets}
          placeholder={labels.customRangePlaceholder}
        />
      </div>

      <div className="w-full sm:w-60">
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
      </div>
    </div>
  )
}
