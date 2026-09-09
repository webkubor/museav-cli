import { useTranslation } from 'react-i18next'
import Select from '@/components/ui/Select'
import type { ApiKeyItem, TenantMember, WorkspaceItem } from '@/types'
import { artifactStateOptions } from './task-list-utils'

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
  const { t } = useTranslation('tasks')
  const artifactOptions = artifactStateOptions(t)

  return (
    <div className="flex items-end gap-3 flex-wrap border-t border-mg-border pt-4">
      <label className="flex flex-col gap-1.5">
        <span className="mg-text-label text-mg-text-3">{t('artifactState.label')}</span>
        <Select value={artifactFilter} onChange={onArtifactChange} className="w-32">
          <Select.Option value="all">{t('artifactState.all')}</Select.Option>
          {artifactOptions.map((option) => <Select.Option key={option.value} value={option.value}>{option.label}</Select.Option>)}
        </Select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="mg-text-label text-mg-text-3">{t('billingState.label')}</span>
        <Select value={billingFilter} onChange={onBillingChange} className="w-32">
          <Select.Option value="all">{t('billingState.all')}</Select.Option>
          <Select.Option value="settled">{t('billingState.settled')}</Select.Option>
          <Select.Option value="pending">{t('billingState.pending')}</Select.Option>
          <Select.Option value="unbilled">{t('billingState.unbilled')}</Select.Option>
          <Select.Option value="partial">{t('billingState.partial')}</Select.Option>
        </Select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="mg-text-label text-mg-text-3">{t('filters.workspace')}</span>
        <Select value={workspaceFilter} onChange={onWorkspaceChange} className="w-44">
          <Select.Option value="all">{t('filters.allWorkspaces')}</Select.Option>
          {workspaces.map((w) => (
            <Select.Option key={w.workspace_id} value={w.workspace_id}>{w.name}</Select.Option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="mg-text-label text-mg-text-3">{t('filters.apiKey')}</span>
        <Select value={apiKeyFilter} disabled={!apiKeyWorkspaceId} onChange={onApiKeyChange} className="w-44">
          <Select.Option value="all">{apiKeyWorkspaceId ? t('filters.allApiKeys') : t('filters.selectWorkspaceFirst')}</Select.Option>
          {apiKeys.map((k) => (
            <Select.Option key={k.api_key_id} value={k.api_key_id}>{k.name}</Select.Option>
          ))}
        </Select>
      </label>
      {view !== 'mine' && (
        <label className="flex flex-col gap-1.5">
          <span className="mg-text-label text-mg-text-3">{t('filters.member')}</span>
          <Select value={memberFilter} onChange={onMemberChange} className="w-44">
            <Select.Option value="all">{t('filters.allMembers')}</Select.Option>
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
