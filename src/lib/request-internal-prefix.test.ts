/**
 * observer（模型发现六接口）接入 get() 的两处契约：
 * 1. `prefix` 选项能把请求打到 `internal/v1` 而不是默认的 `api/v1`；
 * 2. observer 的错误信封用 `message`（web-api 用 `msg`），少了兜底会弹空白提示。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock 会被提升到 import 之前，mock 工厂里引用的变量必须走 vi.hoisted。
const { kyGet } = vi.hoisted(() => ({ kyGet: vi.fn() }))

vi.mock('ky', () => ({
  default: { create: () => ({ get: kyGet }), get: vi.fn() },
}))

import { get, INTERNAL_V1_PREFIX, ModelGoApiError } from '@/lib/request'

function envelope(body: unknown) {
  return {
    headers: { get: () => null },
    json: async () => body,
  }
}

describe('get 的 prefix 选项', () => {
  beforeEach(() => {
    kyGet.mockReset()
  })

  it('默认走 api/v1', async () => {
    kyGet.mockResolvedValue(envelope({ code: 0, data: { ok: true } }))
    await get('catalog/models')
    expect(kyGet.mock.calls[0][0]).toContain('/api/v1/catalog/models')
  })

  it('带 prefix 时走 internal/v1，且不残留 api/v1', async () => {
    kyGet.mockResolvedValue(envelope({ code: 0, data: { ok: true } }))
    await get('model-discovery/overview', { type: 'TEXT_CHAT' }, { prefix: INTERNAL_V1_PREFIX })
    const url = kyGet.mock.calls[0][0] as string
    expect(url).toContain('/internal/v1/model-discovery/overview')
    expect(url).not.toContain('api/v1')
  })
})

describe('observer 错误信封', () => {
  beforeEach(() => {
    kyGet.mockReset()
  })

  it('code 非 0 时取 message（observer 无 msg 字段）', async () => {
    kyGet.mockResolvedValue(
      envelope({
        code: 4001,
        message: 'validation failed',
        errors: [{ field: 'metric', message: 'metric not supported for type STT' }],
      }),
    )

    await expect(
      get('model-discovery/rankings', { type: 'STT', metric: 'VALUE_SCORE' }, { prefix: INTERNAL_V1_PREFIX }),
    ).rejects.toMatchObject({ code: 4001, rawMessage: 'validation failed' })
  })

  it('web-api 的 msg 仍然优先', async () => {
    kyGet.mockResolvedValue(envelope({ code: 40401, msg: 'resource not found', message: '不该用这条' }))

    await expect(get('catalog/models')).rejects.toBeInstanceOf(ModelGoApiError)
    kyGet.mockResolvedValue(envelope({ code: 40401, msg: 'resource not found', message: '不该用这条' }))
    await expect(get('catalog/models')).rejects.toMatchObject({ rawMessage: 'resource not found' })
  })
})
