/**
 * `/api-keys` 中转页：把无 workspaceId 的入口解析到默认工作空间。
 *
 * 覆盖四条分支：会话里有当前空间（不请求列表）→ 取 is_default → 退化取第一个 →
 * 一个空间都没有时去 /workspaces（而不是把人留在 404/空页）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'

import type { WorkspaceItem } from '@/types'

const listWorkspaces = vi.fn<() => Promise<WorkspaceItem[]>>()
vi.mock('@/services/workspaces', () => ({
  listWorkspaces: () => listWorkspaces(),
}))

import { useAuthStore } from '@/store/auth'
import ApiKeysRedirectPage from '@/pages/api-keys/redirect'

function ws(id: string, isDefault: boolean): WorkspaceItem {
  return {
    workspace_id: id,
    tenant_id: 't-1',
    name: id,
    slug: id,
    kind: 'team',
    is_default: isDefault,
    description: '',
    owner: { account_id: 'a-1', display_name: 'owner' },
    member_count: 1,
    api_key_count: 0,
    spend_7d: { amount: '0', currency: 'CNY' },
    created_at: '2026-01-01T00:00:00Z',
    my_role: 'ws_owner',
  } as WorkspaceItem
}

/** 落地页把 :workspaceId 打出来 —— 断言的是「跳到了哪个空间」，不只是「跳到了 keys 路由」 */
function KeysProbe() {
  const { workspaceId } = useParams()
  return <div>KEYS PAGE ws={workspaceId}</div>
}

function renderAt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/api-keys']}>
        <Routes>
          <Route path="/api-keys" element={<ApiKeysRedirectPage />} />
          <Route path="/workspace/:workspaceId/api-keys" element={<KeysProbe />} />
          <Route path="/workspaces" element={<div>WORKSPACES PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  listWorkspaces.mockReset()
  useAuthStore.setState({ activeTenantId: 't-1', activeWorkspaceId: null })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('/api-keys 中转到默认工作空间', () => {
  it('会话里已有当前空间：直接跳该空间，不请求 /workspaces', async () => {
    useAuthStore.setState({ activeWorkspaceId: 'ws-active' })
    renderAt()
    await waitFor(() => expect(screen.getByText('KEYS PAGE ws=ws-active')).toBeInTheDocument())
    expect(listWorkspaces).not.toHaveBeenCalled()
  })

  it('会话里没有当前空间：取 is_default 的那个', async () => {
    listWorkspaces.mockResolvedValue([ws('ws-a', false), ws('ws-default', true)])
    renderAt()
    await waitFor(() => expect(screen.getByText('KEYS PAGE ws=ws-default')).toBeInTheDocument())
    expect(listWorkspaces).toHaveBeenCalledTimes(1)
  })

  it('没有 is_default 标记时退化取列表第一个', async () => {
    listWorkspaces.mockResolvedValue([ws('ws-first', false), ws('ws-second', false)])
    renderAt()
    await waitFor(() => expect(screen.getByText('KEYS PAGE ws=ws-first')).toBeInTheDocument())
  })

  it('一个空间都没有：去空间管理页，不停在中转页', async () => {
    listWorkspaces.mockResolvedValue([])
    renderAt()
    await waitFor(() => expect(screen.getByText('WORKSPACES PAGE')).toBeInTheDocument())
  })

  it('列表请求失败也要给出口，去空间管理页', async () => {
    listWorkspaces.mockRejectedValue(new Error('boom'))
    renderAt()
    await waitFor(() => expect(screen.getByText('WORKSPACES PAGE')).toBeInTheDocument())
  })
})
