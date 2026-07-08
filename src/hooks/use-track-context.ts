/**
 * 埋点公共属性收集器：tenant_id / tenant_type / role / workspace_id / page。
 *
 * 供总览/导航等多处 trackEvent 调用点复用，避免每处手动拼 useAuthStore + useTenantRole +
 * useLocation。不改 track.ts 的核心实现——只是调用侧的公共属性拼装，拿不到的字段直接跳过
 * （不写假数据）。view_mode 是页面自身状态（如企业视图/我的视图），不在此收集，由调用点按需附加。
 */
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { useTenantRole } from '@/hooks/use-tenant-role'

export function useTrackContext(): Record<string, string> {
  const location = useLocation()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const tenants = useAuthStore((s) => s.tenants)
  const { role } = useTenantRole()
  const tenantType = tenants.find((t) => t.tenant_id === activeTenantId)?.type

  const props: Record<string, string> = { page: location.pathname }
  if (activeTenantId) props.tenant_id = activeTenantId
  if (tenantType) props.tenant_type = tenantType
  if (role) props.role = role
  if (activeWorkspaceId) props.workspace_id = activeWorkspaceId
  return props
}
