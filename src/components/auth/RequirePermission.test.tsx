import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RequirePermission } from './RequirePermission'
import { useAuthStore } from '@/store/auth'
import { PERMS } from '@/config/permissions'

describe('RequirePermission', () => {
  beforeEach(() => {
    useAuthStore.setState({ permissions: null })
  })

  it('does not render protected content before granted permissions are loaded', () => {
    render(
      <RequirePermission perm={PERMS.API_KEYS_VIEW}>
        <div>protected API Keys</div>
      </RequirePermission>,
    )

    expect(screen.queryByText('protected API Keys')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: '权限加载中' })).toBeInTheDocument()
  })

  it('renders protected content only when the Permission ID is granted', () => {
    useAuthStore.setState({ permissions: [PERMS.API_KEYS_VIEW] })

    render(
      <RequirePermission perm={PERMS.API_KEYS_VIEW}>
        <div>protected API Keys</div>
      </RequirePermission>,
    )

    expect(screen.getByText('protected API Keys')).toBeInTheDocument()
  })
})
