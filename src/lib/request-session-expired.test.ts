import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createMock, getMock, handleSessionExpired } = vi.hoisted(() => ({
  createMock: vi.fn(),
  getMock: vi.fn(),
  handleSessionExpired: vi.fn(),
}))

vi.mock('ky', () => {
  createMock.mockReturnValue({ get: vi.fn() })
  return { default: { create: createMock, get: getMock } }
})
vi.mock('@/lib/auth/auth-controller', () => ({ handleSessionExpired }))

import './request'

type ResponseBody = { code: number }
type ResponseLike = {
  headers: { get: (name: string) => string | null }
  clone: () => { json: () => Promise<ResponseBody> }
}
type ResponseHook = (context: { request: { url: string }; response: ResponseLike }) => Promise<void>
type KyOptions = { hooks: { afterResponse: ResponseHook[] } }

function afterResponseHook(): ResponseHook {
  const options = createMock.mock.calls[0]?.[0] as unknown as KyOptions
  return options.hooks.afterResponse[0]
}

function response(code: number): ResponseLike {
  return {
    headers: { get: (name) => name === 'content-type' ? 'application/json' : null },
    clone: () => ({ json: async () => ({ code }) }),
  }
}

beforeEach(() => {
  getMock.mockClear()
  handleSessionExpired.mockClear()
  getMock.mockReturnValue({ json: vi.fn().mockResolvedValue({ code: 0 }) })
  window.history.replaceState({}, '', '/dashboard')
})

describe('40101 session handling', () => {
  it('keeps the console session when a support endpoint fails but auth/session is valid', async () => {
    await afterResponseHook()({
      request: { url: 'https://api.example.com/api/v1/support/tickets?filter=all' },
      response: response(40101),
    })

    expect(getMock).toHaveBeenCalledWith(expect.stringContaining('/auth/session'), expect.objectContaining({ credentials: 'include' }))
    expect(handleSessionExpired).not.toHaveBeenCalled()
  })

  it('clears the console session when auth/session also returns 40101', async () => {
    getMock.mockReturnValue({ json: vi.fn().mockResolvedValue({ code: 40101 }) })
    await afterResponseHook()({
      request: { url: 'https://api.example.com/api/v1/support/tickets?filter=all' },
      response: response(40101),
    })

    expect(handleSessionExpired).toHaveBeenCalledTimes(1)
  })
})
