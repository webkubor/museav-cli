import Select from '@/components/ui/Select'
import type { ApiKeyItem, TenantMember, WorkspaceItem } from '@/types'
import { ARTIFACT_STATE_OPTIONS } from './task-list-utils'

interface TaskMoreFiltersProps {
  view: 'enterprise' | 'mine' | 'space'
  artifactFilter: string
  billingFilter: string
  workspaceFilter: string
  apiKeyFilter: string
  memberFilter: string
  apiKeyWorkspaceId?: string
  workspaces: WorkspaceItem[]
  apiKeys: ApiKeyItem[]
  members: TenantMember[]
  onArtifactChange: (v: string) => void
  onBillingChange: (v: string) => void
  onWorkspaceChange: (v: string) => void
  onApiKeyChange: (v: string) => void
  onMemberChange: (v: string) => void
}

/** 「更多筛选」展开区：工作空间 / API Key / 成员 / 产物状态 / 计费状态 */
export function TaskMoreFilters({
  view,
  artifactFilter,
  billingFilter,
  workspaceFilter,
  apiKeyFilter,
  memberFilter,
  apiKeyWorkspaceId,
  workspaces,
  apiKeys,
  members,
  onArtifactChange,
  onBillingChange,
  onWorkspaceChange,
  onApiKeyChange,
  onMemberChange,
}: TaskMoreFiltersProps) {
  return (
    <div className="flex items-end gap-3 flex-wrap border-t border-mg-border pt-4">
      <label className="flex flex-col gap-1.5">
        <span className="mg-text-label text-mg-text-3">产物状态</span>
        <Select value={artifactFilter} onChange={onArtifactChange} className="mg-control-md w-32 mg-text-body">
          <Select.Option value="all">全部产物状态</Select.Option>
          {ARTIFACT_STATE_OPTIONS.map((option) => <Select.Option key={option.value} value={option.value}>{option.label}</Select.Option>)}
        </Select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="mg-text-label text-mg-text-3">计费状态</span>
        <Select value={billingFilter} onChange={onBillingChange} className="mg-control-md w-32 mg-text-body">
          <Select.Option value="all">全部计费状态</Select.Option>
          <Select.Option value="settled">已结算</Select.Option>
          <Select.Option value="pending">待结算</Select.Option>
          <Select.Option value="unbilled">未计费</Select.Option>
          <Select.Option value="partial">部分计费</Select.Option>
        </Select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="mg-text-label text-mg-text-3">工作空间</span>
        <Select value={workspaceFilter} onChange={onWorkspaceChange} className="mg-control-md w-44 mg-text-body">
          <Select.Option value="all">全部工作空间</Select.Option>
          {workspaces.map((w) => (
            <Select.Option key={w.workspace_id} value={w.workspace_id}>{w.name}</Select.Option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="mg-text-label text-mg-text-3">API Key</span>
        <Select value={apiKeyFilter} disabled={!apiKeyWorkspaceId} onChange={onApiKeyChange} className="mg-control-md w-44 mg-text-body">
          <Select.Option value="all">{apiKeyWorkspaceId ? '全部 API Key' : '先选择工作空间'}</Select.Option>
          {apiKeys.map((k) => (
            <Select.Option key={k.api_key_id} value={k.api_key_id}>{k.name}</Select.Option>
          ))}
        </Select>
      </label>
      {view !== 'mine' && (
        <label className="flex flex-col gap-1.5">
          <span className="mg-text-label text-mg-text-3">成员</span>
          <Select value={memberFilter} onChange={onMemberChange} className="mg-control-md w-44 mg-text-body">
            <Select.Option value="all">全部成员</Select.Option>
            {members.map((m) => (
              <Select.Option key={m.account.account_id} value={m.account.account_id}>
                {m.account.display_name || m.account.email}
              </Select.Option>
            ))}
          </Select>
        </label>
      )}
    </div>
  )
}
