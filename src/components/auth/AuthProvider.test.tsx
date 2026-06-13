import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { RequireAuth } from './AuthProvider'

function resetAuth(partial: Partial<ReturnType<typeof useAuthStore.getState>>) {
  useAuthStore.setState({
    account: null, activeTenantId: null, activeWorkspaceId: null,
    tenants: [], permissions: null, menus: [],
    isAuthenticated: false, isLoading: false, ...partial,
  })
}

function renderGate() {
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/login" element={<div>LOGIN</div>} />
        <Route path="/app" element={<RequireAuth><div>PROTECTED</div></RequireAuth>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('RequireAuth', () => {
  it('加载中渲染占位（不跳转、不渲染子内容）', () => {
    resetAuth({ isLoading: true })
    renderGate()
    expect(screen.queryByText('PROTECTED')).toBeNull()
    expect(screen.queryByText('LOGIN')).toBeNull()
  })
  it('未登录跳登录', () => {
    resetAuth({ isLoading: false, isAuthenticated: false })
    renderGate()
    expect(screen.getByText('LOGIN')).toBeInTheDocument()
  })
  it('已登录有组织渲染子内容', () => {
    resetAuth({ isLoading: false, isAuthenticated: true, activeTenantId: 'ten_1' })
    renderGate()
    expect(screen.getByText('PROTECTED')).toBeInTheDocument()
  })
  it('已登录但无组织渲染 403（不跳登录）', () => {
    resetAuth({ isLoading: false, isAuthenticated: true, activeTenantId: null })
    renderGate()
    expect(screen.queryByText('LOGIN')).toBeNull()
    expect(screen.queryByText('PROTECTED')).toBeNull()
  })
})
