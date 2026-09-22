import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LuFolderOpen, LuChevronsUpDown, LuCheck, LuSearch } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/store/auth'
import { switchActiveWorkspace } from '@/lib/auth/refresh-session'
import { useTrackContext } from '@/hooks/use-track-context'
import { trackEvent } from '@/lib/track'
import { listWorkspaces } from '@/services/workspaces'
import type { WorkspaceItem } from '@/types'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/DropdownMenu'

interface WorkspaceSwitcherProps {
  collapsed?: boolean
}

/** 空间数超过该值时下拉内显示搜索框（多空间场景，见截图反馈） */
const SEARCH_THRESHOLD = 8

export function WorkspaceSwitcher({ collapsed = false }: WorkspaceSwitcherProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { activeTenantId, activeWorkspaceId } = useAuthStore()
  const trackCtx = useTrackContext()
  const [query, setQuery] = useState('')

  const { data: workspaces = [] } = useQuery<WorkspaceItem[]>({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces(),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })

  const activeWorkspace =
    workspaces.find((w) => w.workspace_id === activeWorkspaceId) ||
    workspaces.find((w) => w.is_default) ||
    workspaces[0]

  const keyword = query.trim().toLowerCase()
  const filtered = keyword
    ? workspaces.filter((w) =>
        [w.name, w.slug].some((v) => (v ?? '').toLowerCase().includes(keyword)),
      )
    : workspaces
  const showSearch = workspaces.length > SEARCH_THRESHOLD

  function handleSwitchWorkspace(workspaceId: string) {
    if (workspaceId === activeWorkspaceId) return
    trackEvent('workspace_selector_change', {
      ...trackCtx,
      from_workspace_id: activeWorkspaceId ?? '',
      to_workspace_id: workspaceId,
    })
    // 切空间同时按新空间重拉会话权限（tab/侧栏/按钮 gating 随之更新，需求方#255/#216）
    void switchActiveWorkspace(workspaceId)
    queryClient.removeQueries({ queryKey: ['api-keys'] })
    queryClient.removeQueries({ queryKey: ['guardrails'] })
    queryClient.removeQueries({ queryKey: ['observability'] })
    const wsMatch = location.pathname.match(/^\/workspace\/[^/]+\/(.+)$/)
    if (wsMatch) {
      navigate(`/workspace/${workspaceId}/${wsMatch[1]}`, { replace: true })
    }
  }

  /** 下拉内容：标题 + （超阈值时）搜索 + 限高滚动列表。折叠/展开两态共用。 */
  const menuContent = (
    <>
      <div className="px-2 py-1.5 text-xs font-bold text-mg-text-3 uppercase tracking-wider">
        {t('header.switchWorkspace')}
      </div>
      {showSearch && (
        <div className="px-2 pb-1.5">
          {/* 面板内搜索统一走 ui/Input sm 档（2026-09-04 控件统一）：
              32px 高度 + 13px 字号，与全站下拉面板内搜索同一规格 */}
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('header.searchWorkspace')}
            prefix={<LuSearch className="w-3.5 h-3.5" />}
            size="sm"
            // 阻断 Radix 菜单的 typeahead / 方向键抢焦点，保证输入体验
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      )}
      {/* 多空间场景限高滚动（截图反馈：无上限时列表穿出屏幕） */}
      <div className="max-h-[264px] overflow-y-auto overscroll-contain">
        {filtered.length === 0 ? (
          <div className="px-2 py-3 text-center text-[12px] text-mg-text-3">
            {t('header.noWorkspaceMatch')}
          </div>
        ) : (
          filtered.map((ws) => (
            <DropdownMenuItem
              key={ws.workspace_id}
              onClick={() => handleSwitchWorkspace(ws.workspace_id)}
            >
              <LuFolderOpen
                size={13}
                className={cn(
                  'mr-2 shrink-0',
                  ws.workspace_id === activeWorkspaceId ? 'text-brand-base' : 'text-mg-text-3',
                )}
              />
              <span
                className={cn(
                  'truncate flex-1',
                  ws.workspace_id === activeWorkspaceId
                    ? 'font-bold text-brand-base'
                    : 'font-medium',
                )}
                title={ws.name}
              >
                {ws.name}
              </span>
              {/* DEFAULT 徽标已移除（prd#1097）：与「空间管理」页新增的默认空间开关概念冲突 */}
              {ws.workspace_id === activeWorkspaceId && (
                <LuCheck size={13} className="ml-1 text-brand-base shrink-0" />
              )}
            </DropdownMenuItem>
          ))
        )}
      </div>
    </>
  )

  // 打开/关闭时清空搜索词，避免下次打开残留过滤
  const handleOpenChange = (open: boolean) => {
    if (!open) setQuery('')
  }

  if (collapsed) {
    return (
      <div className="px-2 pt-1 pb-0.5">
        <DropdownMenu onOpenChange={handleOpenChange}>
          <DropdownMenuTrigger asChild>
            <div
              role="button"
              tabIndex={0}
              className="flex items-center justify-center w-full p-2.5 rounded-lg cursor-pointer border border-mg-border/50 bg-mg-fill-0/30 hover:bg-mg-fill-0/60 hover:border-brand-base/30 transition-all duration-200 outline-none"
              title={activeWorkspace?.name ?? t('header.defaultWorkspace')}
            >
              <LuFolderOpen size={15} className="text-brand-base" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="start" className="w-[220px] modal-glow-flow !overflow-visible">
            {menuContent}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  return (
    <div className="px-2 pt-1 pb-0.5">
      <DropdownMenu onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            className={cn(
              'group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer select-none outline-none w-full',
              'border border-mg-border/50 bg-mg-fill-0/20 hover:bg-mg-fill-0/50 hover:border-brand-base/30',
              'text-mg-text-2 hover:text-mg-text-1 transition-all duration-200',
            )}
          >
            <LuFolderOpen
              size={14}
              className="text-brand-base shrink-0 transition-transform duration-200 group-hover:scale-110"
            />
            <span
              className="text-[13px] font-semibold text-mg-text-1 truncate flex-1 min-w-0"
              title={activeWorkspace?.name ?? t('header.defaultWorkspace')}
            >
              {activeWorkspace?.name ?? t('header.defaultWorkspace')}
            </span>
            <LuChevronsUpDown
              size={13}
              className="text-mg-text-4 group-hover:text-mg-text-2 transition-colors shrink-0"
            />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[var(--radix-dropdown-menu-trigger-width)] modal-glow-flow !overflow-visible"
          sideOffset={4}
        >
          {menuContent}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
