/**
 * prd46#1207 评审回归：在**非活跃空间**里改完负责人，权限必须按「所看空间」重解析。
 *
 * 背景：#1207 起「看详情」不再改写活跃空间，于是「活跃空间」和「正在看的空间」可能不是同一个。
 * 此前这里调无参 refreshSession()，它会去解析**活跃空间**——管理员在空间管理里对空间 B
 * 转移负责人成功后，权限被解析成活跃空间 A 的，B 的详情页当场打回「丢 tab」（需求方#255 的症状）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MembersTab } from './members-tab'
import { listWorkspaceMembers, setWorkspaceOwner } from '@/services/workspaces'
import { listTenantMembers } from '@/services/tenants'
import { resolvePermissionsForWorkspace } from '@/lib/auth/refresh-session'

vi.mock('react-i18next', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-i18next')>(),
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission: () => true }) }))
vi.mock('@/hooks/use-tenant-role', () => ({ useTenantRole: () => ({ ownedWorkspaceIds: [] }) }))
vi.mock('@/store/auth', () => ({
  useAuthStore: (sel: (s: { activeTenantId: string }) => unknown) => sel({ activeTenantId: 'tenant-1' }),
}))
vi.mock('@/services/workspaces', () => ({
  listWorkspaceMembers: vi.fn(),
  setWorkspaceOwner: vi.fn(),
  addWorkspaceMember: vi.fn(),
  removeWorkspaceMemberWithStrategy: vi.fn(),
}))
vi.mock('@/services/tenants', () => ({ listTenantMembers: vi.fn() }))
vi.mock('@/lib/app-toast', () => ({ appToast: { success: vi.fn(), requestError: vi.fn() } }))
vi.mock('@/lib/track', () => ({ trackAction: vi.fn() }))
vi.mock('@/lib/auth/refresh-session', () => ({
  resolvePermissionsForWorkspace: vi.fn(),
  refreshSession: vi.fn(),
}))

const VIEWED = 'ws-VIEWED'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listWorkspaceMembers).mockResolvedValue({
    items: [
      {
        account: { account_id: 'acc-2', display_name: '成员二', email: 'm2@x.com' },
        role: 'ws_member',
      },
    ],
  } as never)
  vi.mocked(listTenantMembers).mockResolvedValue({ items: [] } as never)
  vi.mocked(setWorkspaceOwner).mockResolvedValue({} as never)
})

describe('非活跃空间里转移负责人后的权限重解析（prd46#1207 评审回归）', () => {
  it('按所看空间 workspaceId 重解析，而不是无参解析活跃空间', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MembersTab workspaceId={VIEWED} />
      </QueryClientProvider>,
    )

    const setOwnerBtn = await screen.findByRole('button', { name: /workspaces\.detail\.members\.setOwner/ })
    fireEvent.click(setOwnerBtn)

    await waitFor(() => expect(setWorkspaceOwner).toHaveBeenCalledWith(VIEWED, 'acc-2'))
    // 关键断言：带着「所看空间」去重解析
    await waitFor(() => expect(resolvePermissionsForWorkspace).toHaveBeenCalledWith(VIEWED))
  })
})
