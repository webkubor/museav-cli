/**
 * 空间管理主工作台（详情面板 + 概览）
 */
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { switchActiveWorkspace } from '@/lib/auth/refresh-session'
import { useTranslation } from 'react-i18next'
import {
  LuChevronRight,
  LuCircleDollarSign,
  LuActivity,
  LuDatabase,
  LuKey
} from 'react-icons/lu'
import { useQuery } from '@tanstack/react-query'
import { getWorkspace } from '@/services/workspaces'
import { useTenantRole } from '@/hooks/use-tenant-role'
import {
  MembersTab,
  LogsForwardingTab,
  SettingsTab
} from '@/pages/settings/workspace-detail'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/format-date'
import { trackEvent } from '@/lib/track'
import { PERMS } from '@/config/permissions'
import { usePermissions } from '@/hooks/use-permissions'
import { useNavigate } from 'react-router-dom'
import type { WorkspaceDetail } from '@/types'
import { renderMoney } from './workspace-utils'

/**
 * 空间详情面板（主工作台概览）
 * PRD 原型 WorkspaceOverviewTab（需求方#67）：4 指标卡 + 资源磁贴两行，无「运行资源/快捷入口」分组框。
 */
export function WorkspaceOverview({ ws, onGoLogs }: { ws: WorkspaceDetail; onGoLogs: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()

  const usageCards = [
    {
      label: t('workspaces.detail.overview.spend'),
      value: renderMoney(ws.usage_7d?.spend),
      hint: t('workspaces.detail.overview.spendHint'),
      icon: <LuCircleDollarSign size={20} className="text-brand-base" />,
      bg: 'bg-brand-base/8'
    },
    {
      label: t('workspaces.detail.overview.requests'),
      value: (ws.usage_7d?.requests ?? 0).toLocaleString(),
      hint: ws.last_request_at ? formatRelativeTime(ws.last_request_at) : t('workspaces.detail.overview.never'),
      icon: <LuActivity size={20} className="text-mg-success" />,
      bg: 'bg-mg-success/8'
    },
    {
      label: t('workspaces.detail.overview.tokens'),
      value: (ws.usage_7d?.tokens ?? 0).toLocaleString(),
      hint: t('workspaces.detail.overview.tokensHint'),
      icon: <LuDatabase size={20} className="text-brand-base" />,
      bg: 'bg-brand-base/8'
    },
    {
      label: 'API Keys',
      value: (ws.api_key_count ?? 0).toLocaleString(),
      hint: t('workspaces.detail.overview.guardrailsHint', { count: ws.guardrail_count ?? 0 }),
      icon: <LuKey size={20} className="text-brand-base" />,
      bg: 'bg-brand-base/8'
    },
  ]

  // 资源磁贴（原型 SpaceResourceCard：小标签 + 资源名 + 描述 + 动作文本）
  const resourceCards = [
    {
      label: t('workspaces.detail.overview.credLabel'),
      value: 'API Keys',
      meta: t('workspaces.detail.overview.keysOwner', { count: ws.api_key_count ?? 0, owner: ws.owner?.display_name || '—' }),
      action: t('workspaces.detail.overview.viewKey'),
      onClick: () => navigate(`/workspace/${ws.workspace_id}/api-keys`),
      visible: hasPermission(PERMS.API_KEYS_VIEW),
    },
    {
      label: t('workspaces.detail.overview.securityLabel'),
      value: t('workspaces.detail.overview.guardrailsValue'),
      meta: t('workspaces.detail.overview.guardrailsActiveHint', { count: ws.guardrail_count ?? 0 }),
      action: t('workspaces.detail.overview.viewGuardrails'),
      onClick: () => navigate(`/workspace/${ws.workspace_id}/guardrails`),
      visible: hasPermission(PERMS.GUARDRAILS_VIEW),
    },
    {
      label: t('workspaces.detail.overview.troubleshootLabel'),
      value: t('workspaces.detail.overview.logsTitle'),
      // 对齐 PRD：「最近请求 {时间}」，无调用记录回落「从未」
      meta: `${t('workspaces.detail.overview.lastRequestPrefix')} ${ws.last_request_at ? formatRelativeTime(ws.last_request_at) : t('workspaces.detail.overview.never')}`,
      action: t('workspaces.detail.overview.viewLogs'),
      onClick: () => navigate(`/logs?workspace=${ws.workspace_id}`),
      visible: hasPermission(PERMS.LOGS_VIEW),
    },
    {
      label: t('workspaces.detail.tabs.logs'),
      value: ws.forward_enabled ? t('workspaces.card.forwardOn') : t('workspaces.card.forwardOff'),
      // 对齐 PRD：「{输入/输出已采集|仅元数据} · {转发开启|未转发}」
      meta: `${ws.logging_enabled ? t('workspaces.detail.overview.capturedFull') : t('workspaces.detail.overview.metaOnly')} · ${ws.forward_enabled ? t('workspaces.card.forwardOn') : t('workspaces.detail.overview.notForwarded')}`,
      action: t('workspaces.detail.overview.configure'),
      onClick: onGoLogs,
      visible: hasPermission(PERMS.OBSERVABILITY_VIEW),
      // 本页内切页签（非外跳）：动作用蓝色内联文本、无外跳箭头（对齐 PRD actionKind="inline"）
      inline: true,
    },
  ]

  return (
    <div className="space-y-4">
      {/* 4项 7天指标（对齐 PRD space-overview-grid：值 + 副行说明） */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {usageCards.map((c) => (
          <div key={c.label} className="flex items-center gap-4 bg-mg-fill-0/10 border border-mg-border/20 rounded-lg p-5">
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", c.bg)}>
              {c.icon}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-mg-text-3">{c.label}</div>
              <div className="text-base font-bold text-mg-text-1 mt-0.5">{c.value}</div>
              <div className="text-xs text-mg-text-3 mt-0.5 truncate">{c.hint}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 资源磁贴（对齐 PRD space-resource-grid：运行凭证/安全策略/排障入口/日志与转发） */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {resourceCards.filter((c) => c.visible).map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={c.onClick}
            className="text-left bg-mg-fill-0/10 border border-mg-border/20 rounded-lg p-5 flex flex-col gap-1 cursor-pointer transition-all hover:border-brand-base/40 hover:bg-mg-fill-0/20 group"
          >
            <span className="text-xs text-mg-text-3">{c.label}</span>
            <span className="text-sm font-bold text-mg-text-1">{c.value}</span>
            <span className="text-xs text-mg-text-3 truncate">{c.meta}</span>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-base group-hover:text-brand-base/80 transition-colors">
              {c.action}
              {!('inline' in c && c.inline) && <LuChevronRight size={12} />}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

interface WorkspaceDashboardProps {
  workspaceId: string
  onDeleted: () => void
  /** 深链初始 Tab（如从日志页「去开启日志与转发」跳转过来），仅影响首次挂载的默认选中项。 */
  initialTab?: 'overview' | 'members' | 'logs' | 'settings'
}

/**
 * 空间管理主工作台组件（包含详情头部、状态以及 4 tabs）
 */
export function WorkspaceDashboard({ workspaceId, onDeleted, initialTab }: WorkspaceDashboardProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'overview' | 'members' | 'logs' | 'settings'>(initialTab ?? 'overview')
  // Option B：进入某空间管理详情即把它设为活跃空间，并按它重解析权限——
  // 使 4 个 tab 显隐 + tab 内成员/设置/日志按钮 gating 都按「所看空间」的角色（如空间负责人）解析（需求方#255）。
  useEffect(() => {
    if (workspaceId && workspaceId !== useAuthStore.getState().activeWorkspaceId) {
      void switchActiveWorkspace(workspaceId)
    }
  }, [workspaceId])
  // 个人租户没有企业成员，空间管理不该有「成员」tab（无人可邀请/管理）；仅企业租户显示。
  const { isEnterprise } = useTenantRole()
  const { hasPermission } = usePermissions()
  const canViewMembers = isEnterprise && hasPermission(PERMS.WORKSPACE_MEMBERS_VIEW)
  const canViewLogs = hasPermission(PERMS.OBSERVABILITY_VIEW)
  // Every workspace member can manage their own default-workspace preference.
  // Administrative actions keep their individual permission gates in SettingsTab.
  const canViewSettings = true
  const activeTab = (
    (tab === 'members' && !canViewMembers)
    || (tab === 'logs' && !canViewLogs)
    || (tab === 'settings' && !canViewSettings)
  ) ? 'overview' : tab

  const detailQuery = useQuery({
    queryKey: ['workspace-detail', workspaceId],
    queryFn: () => getWorkspace(workspaceId),
    enabled: Boolean(workspaceId),
  })

  const ws = detailQuery.data

  if (detailQuery.isLoading) {
    return (
      <div className="bg-mg-bg-0 border border-mg-border/40 rounded-lg p-6 flex flex-col gap-4 animate-pulse">
        <div className="h-6 bg-mg-fill-0 rounded w-1/3" />
        <div className="h-4 bg-mg-fill-0 rounded w-1/4" />
        <div className="h-40 bg-mg-fill-0 rounded w-full mt-4" />
      </div>
    )
  }

  if (!ws) {
    return (
      <div className="bg-mg-bg-0 border border-mg-border/40 rounded-lg p-6 text-center text-mg-text-3">
        {t('workspaces.detail.notFound')}
      </div>
    )
  }

  // 详情页签（PRD 原型 space-detail-tabs：磁贴式，标题 + 说明副行；需求方#67）
  const detailTabs = [
    { value: 'overview', label: t('workspaces.detail.tabs.overview'), desc: t('workspaces.detail.tabs.overviewDesc'), visible: true },
    { value: 'members', label: t('workspaces.detail.tabs.members'), desc: t('workspaces.detail.tabs.membersDesc'), visible: canViewMembers },
    { value: 'logs', label: t('workspaces.detail.tabs.logs'), desc: t('workspaces.detail.tabs.logsDesc'), visible: canViewLogs },
    { value: 'settings', label: t('workspaces.detail.tabs.settings'), desc: t('workspaces.detail.tabs.settingsDesc'), visible: canViewSettings },
  ].filter((item) => item.visible)

  return (
    <div className="bg-mg-bg-0 border border-mg-border/40 rounded-lg p-6 flex flex-col gap-6 animate-in fade-in duration-300">
      {/* 头部（PRD 原型 space-detail-head：名称，其余信息归各页签；需求方#67）；
          slug 展示按需求方反馈删除，覆盖 #67 原方案 (prd#596) */}
      <div className="space-y-1">
        <h3 className="text-lg font-bold text-mg-text-1 tracking-tight m-0">{ws.name}</h3>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => { trackEvent('workspaces:tab_click', { tab: v }); setTab(v as 'overview' | 'members' | 'logs' | 'settings') }}>
        <TabsList
          className={cn(
            'grid w-full gap-px overflow-hidden rounded-lg border border-mg-border bg-mg-border/60 p-0',
            detailTabs.length === 2 && 'grid-cols-2',
            detailTabs.length === 3 && 'grid-cols-3',
            detailTabs.length >= 4 && 'grid-cols-2 lg:grid-cols-4',
          )}
        >
          {detailTabs.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className={cn(
                'flex flex-col items-start gap-0.5 rounded-none border-0 bg-mg-bg-0 px-4 py-3 text-left',
                'data-[state=active]:bg-mg-fill-0/40',
              )}
            >
              <strong className={cn('text-[13px] font-bold', activeTab === item.value ? 'text-brand-base' : 'text-mg-text-1')}>
                {item.label}
              </strong>
              <span className="text-xs font-normal text-mg-text-3">{item.desc}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <WorkspaceOverview ws={ws} onGoLogs={() => { if (canViewLogs) setTab('logs') }} />
        </TabsContent>
        {canViewMembers && (
          <TabsContent value="members">
            <MembersTab workspaceId={workspaceId} />
          </TabsContent>
        )}
        {canViewLogs && (
          <TabsContent value="logs">
            {/* 同 SettingsTab：采集/广播开关是挂载时取一次的本地 state，切回已缓存空间时不重置，
                点开关会把上一个空间的设置写进当前空间（prd46#1206 review 发现，同根因） */}
            <LogsForwardingTab key={workspaceId} workspaceId={workspaceId} />
          </TabsContent>
        )}
        {canViewSettings && (
          <TabsContent value="settings">
            {/* key 按空间重建设置表单：名称/描述是挂载时取一次的本地 state，切到另一张卡片时不重置，
                点「保存」会把 A 空间改成 B 的名字（prd46#1206 QA 复现）。只 key 设置表单，不 key 整个
                dashboard——它挂载时会写回活跃空间（见 prd46#1207）。 */}
            <SettingsTab key={ws.workspace_id} ws={ws} onDeleted={onDeleted} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
