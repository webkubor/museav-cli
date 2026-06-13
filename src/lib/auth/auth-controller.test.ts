import { describe, it, expect, vi, beforeEach } from 'vitest'

const warn = vi.fn()
const clearAuth = vi.fn()
vi.mock('@/lib/toast', () => ({ toast: { warning: warn, error: vi.fn(), info: vi.fn(), success: vi.fn() } }))
vi.mock('@/i18n', () => ({ default: { t: (k: string) => k } }))
vi.mock('@/store/auth', () => ({ useAuthStore: { getState: () => ({ clearAuth }) } }))

beforeEach(() => { warn.mockClear(); clearAuth.mockClear() })

describe('handleSessionExpired', () => {
  it('先 toast 提示再清鉴权态', async () => {
    const { handleSessionExpired } = await import('./auth-controller')
    handleSessionExpired()
    expect(warn).toHaveBeenCalledWith('common.sessionExpired')
    expect(clearAuth).toHaveBeenCalledTimes(1)
  })
})
