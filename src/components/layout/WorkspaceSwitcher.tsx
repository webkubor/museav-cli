import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LuFolderOpen, LuChevronsUpDown, LuCheck, LuSettings } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { listWorkspaces } from '@/services/workspaces'
import type { WorkspaceItem } from '@/types'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/DropdownMenu'

interface WorkspaceSwitcherProps {
  collapsed?: boolean
}

export function WorkspaceSwitcher({ collapsed = false }: WorkspaceSwitcherProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { activeTenantId, activeWorkspaceId, setActiveWorkspaceId } = useAuthStore()

  const { data: workspaces = [] } = useQuery<WorkspaceItem[]>({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces().then(res => res.items || []),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })

  const activeWorkspace =
    workspaces.find((w) => w.workspace_id === activeWorkspaceId) ||
    workspaces.find((w) => w.is_default) ||
    workspaces[0]

  function handleSwitchWorkspace(workspaceId: string) {
    if (workspaceId === activeWorkspaceId) return
    setActiveWorkspaceId(workspaceId)
    queryClient.removeQueries({ queryKey: ['api-keys'] })
    queryClient.removeQueries({ queryKey: ['guardrails'] })
    queryClient.removeQueries({ queryKey: ['observability'] })
    const wsMatch = location.pathname.match(/^\/workspace\/[^/]+\/(.+)$/)
    if (wsMatch) {
      navigate(`/workspace/${workspaceId}/${wsMatch[1]}`, { replace: true })
    }
  }

  if (collapsed) {
    return (
      <div className="px-2 pt-1 pb-0.5">
        <DropdownMenu>
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
          <DropdownMenuContent side="right" align="start" className="w-[220px] modal-glow-flow !overflow-visible">
            <div className="px-2 py-1.5 text-[11px] font-bold text-mg-text-2 uppercase tracking-wider">
              {t('header.switchWorkspace')}
            </div>
            {workspaces.map((ws) => (
              <DropdownMenuItem
                key={ws.workspace_id}
                onClick={() => handleSwitchWorkspace(ws.workspace_id)}
              >
                <LuFolderOpen size={13} className="mr-2 text-mg-text-2 shrink-0" />
                <span className="truncate flex-1">{ws.name}</span>
                {ws.workspace_id === activeWorkspaceId && (
                  <LuCheck size={13} className="ml-2 text-brand-base shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/settings/workspace')}>
              <LuSettings size={13} className="mr-2 text-mg-text-2 shrink-0" />
              <span>{t('header.workspaceMgmt')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  return (
    <div className="px-2 pt-1 pb-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            className={cn(
              'group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer select-none outline-none w-full',
              'border border-mg-border/50 bg-mg-fill-0/20 hover:bg-mg-fill-0/50 hover:border-brand-base/30',
              'text-mg-text-1 hover:text-mg-text-0 transition-all duration-200',
            )}
          >
            <LuFolderOpen
              size={14}
              className="text-brand-base shrink-0 transition-transform duration-200 group-hover:scale-110"
            />
            <span
              className="text-[13px] font-semibold text-mg-text-0 truncate flex-1 min-w-0"
              title={activeWorkspace?.name ?? t('header.defaultWorkspace')}
            >
              {activeWorkspace?.name ?? t('header.defaultWorkspace')}
            </span>
            <LuChevronsUpDown
              size={13}
              className="text-mg-text-3 group-hover:text-mg-text-1 transition-colors shrink-0"
            />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[var(--radix-dropdown-menu-trigger-width)] modal-glow-flow !overflow-visible"
          sideOffset={4}
        >
          <div className="px-2 py-1.5 text-[11px] font-bold text-mg-text-2 uppercase tracking-wider">
            {t('header.switchWorkspace')}
          </div>
          {workspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.workspace_id}
              onClick={() => handleSwitchWorkspace(ws.workspace_id)}
            >
              <LuFolderOpen
                size={13}
                className={cn(
                  'mr-2 shrink-0',
                  ws.workspace_id === activeWorkspaceId ? 'text-brand-base' : 'text-mg-text-2',
                )}
              />
              <span
                className={cn(
                  'truncate flex-1',
                  ws.workspace_id === activeWorkspaceId
                    ? 'font-bold text-brand-base'
                    : 'font-medium',
                )}
              >
                {ws.name}
              </span>
              {ws.is_default && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-mg-fill-1 text-mg-text-2 font-bold tracking-wide uppercase shrink-0 mx-1">
                  {t('header.default')}
                </span>
              )}
              {ws.workspace_id === activeWorkspaceId && (
                <LuCheck size={13} className="ml-1 text-brand-base shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/settings/workspace')}>
            <LuSettings size={13} className="mr-2 text-mg-text-2 shrink-0" />
            <span>{t('header.workspaceMgmt')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
