import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The URL comes from apiBaseUrl() and the auth headers from injectHeaders(); neither
// is under test here, so both are pinned to keep the assertions off .env loading and
// cookie/locale resolution.
vi.mock('@/lib/request', () => ({
  apiBaseUrl: () => 'https://api.example.test',
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  upload: vi.fn(),
}))
vi.mock('@/lib/request-headers', () => ({
  injectHeaders: vi.fn(),
}))

import { fetchExperienceArtifactBlob } from '@/services/experience-sessions'

function requestOf(call: unknown[]): Request {
  return call[0] as Request
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('fetchExperienceArtifactBlob', () => {
  // The whole point of qa#580: bytes must come from OUR API origin (CORS + session
  // ready), not from the CDN URL the artifact is displayed with.
  it('reads image/audio artifacts from the BFF relay by resource_id', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('bytes', { status: 200, headers: { 'Content-Type': 'image/png' } }),
    )

    const blob = await fetchExperienceArtifactBlob({ resourceId: 'oss://bkt/experience/tnt_1/a.png' })

    expect(await blob.text()).toBe('bytes')
    const request = requestOf(vi.mocked(fetch).mock.calls[0])
    expect(request.url).toBe(
      'https://api.example.test/api/v1/experience/attachments/content?resource_id=oss%3A%2F%2Fbkt%2Fexperience%2Ftnt_1%2Fa.png',
    )
    // Session cookie must ride along; without it the relay answers "not logged in".
    expect(request.credentials).toBe('include')
  })

  // Video artifacts live under the gateway's prefix, where the resource_id ownership
  // rule does not apply — they are addressed by task id instead.
  it('addresses video artifacts by async_task_id', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('mp4', { status: 200, headers: { 'Content-Type': 'video/mp4' } }),
    )

    await fetchExperienceArtifactBlob({ asyncTaskId: 'task_1' })

    expect(requestOf(vi.mocked(fetch).mock.calls[0]).url).toBe(
      'https://api.example.test/api/v1/experience/attachments/content?async_task_id=task_1',
    )
  })

  // Business failures answer HTTP 200 with a JSON envelope in this codebase. Saving
  // that as "the file" would hand the user a download named video.mp4 containing
  // `{"code":40401}`, so the content type has to be checked rather than the status.
  it('rejects a JSON envelope instead of saving it as the artifact', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('{"code":40401,"msg":"资源不存在"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(fetchExperienceArtifactBlob({ asyncTaskId: 'task_gone' })).rejects.toThrow(/envelope/)
  })

  it('rejects a transport failure', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 502 }))

    await expect(fetchExperienceArtifactBlob({ resourceId: 'oss://bkt/experience/a.png' })).rejects.toThrow(/502/)
  })
})
