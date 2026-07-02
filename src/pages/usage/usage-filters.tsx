import type { ReactNode } from 'react'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/DateRangePicker'
import Select from '@/components/ui/Select'
import { LuFilter } from 'react-icons/lu'

type WorkspaceOption = {
  workspace_id: string
  name: string
}

type ApiKeyOption = {
  api_key_id: string
  name?: string
  masked?: string
}

type ModelOption = {
  model_id: string
  display_name?: string | null
}

interface UsageFilterPanelProps {
  apiKeyList: ApiKeyOption[]
  effectiveWorkspaceId?: string
  filterApiKeyId: string
  filterModelId: string
  filterWorkspaceId: string
  labels: {
    apiKeys: string
    customRangePlaceholder: string
    description: string
    models: string
    title: string
    workspaces: string
  }
  modelList: ModelOption[]
  onApiKeyChange: (value: string) => void
  onModelChange: (value: string) => void
  onTimeRangeChange: (value: DateRangeValue) => void
  onWorkspaceChange: (value: string) => void
  presets: Array<{ key: string; label: string }>
  rangeLabel: string
  timeRange: DateRangeValue
  workspaceList: WorkspaceOption[]
}

export function UsageFilterPanel({
  apiKeyList,
  effectiveWorkspaceId,
  filterApiKeyId,
  filterModelId,
  filterWorkspaceId,
  labels,
  modelList,
  onApiKeyChange,
  onModelChange,
  onTimeRangeChange,
  onWorkspaceChange,
  presets,
  rangeLabel,
  timeRange,
  workspaceList,
}: UsageFilterPanelProps) {
  return (
    <section className="rounded-md border border-mg-border bg-mg-bg-0 p-[var(--mg-panel-padding-md)]">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-selected-bg text-brand-base">
          <LuFilter size={16} />
        </span>
        <div>
          <h2 className="mg-text-body font-bold text-mg-text-1">{labels.title}</h2>
          <p className="mg-text-caption text-mg-text-3">{labels.description}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(160px,1fr)_minmax(180px,1fr)_minmax(180px,1.1fr)_220px]">
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

        <UsageFilterField label={labels.apiKeys}>
          <Select
            value={filterApiKeyId === '' ? '__all__' : filterApiKeyId}
            onChange={onApiKeyChange}
            placeholder={labels.apiKeys}
            disabled={!effectiveWorkspaceId}
          >
            <Select.Option value="__all__">{labels.apiKeys}</Select.Option>
            {apiKeyList.map((apiKey) => (
              <Select.Option key={apiKey.api_key_id} value={apiKey.api_key_id}>
                {apiKey.name || apiKey.masked}
              </Select.Option>
            ))}
          </Select>
        </UsageFilterField>

        <UsageFilterField label={labels.models}>
          <Select
            value={filterModelId === '' ? '__all__' : filterModelId}
            onChange={onModelChange}
            placeholder={labels.models}
          >
            <Select.Option value="__all__">{labels.models}</Select.Option>
            {modelList.map((model) => (
              <Select.Option key={model.model_id} value={model.model_id}>
                {model.display_name || model.model_id}
              </Select.Option>
            ))}
          </Select>
        </UsageFilterField>

        <UsageFilterField label={rangeLabel}>
          <DateRangePicker
            value={timeRange}
            onChange={onTimeRangeChange}
            presets={presets}
            placeholder={labels.customRangePlaceholder}
          />
        </UsageFilterField>
      </div>
    </section>
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
