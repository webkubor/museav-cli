import { describe, it, expect } from 'vitest'
import { modelDetailPath } from './model-detail-path'

describe('modelDetailPath（prd#983：API ID 带 / 的模型不能撕成两段路径）', () => {
  it('扁平 model_id 原样拼接', () => {
    expect(modelDetailPath({ model_id: 'qwen3.6-flash', id: 'uuid-1' })).toBe('/models/qwen3.6-flash')
  })

  it('vendor/model 形态的 model_id 把 / 编码成 %2F，保持单段 path', () => {
    const path = modelDetailPath({ model_id: 'fakellm/qa-text-v1', id: 'b5c1722d-f7b0-4480-ab18-5db182a78dad' })
    expect(path).toBe('/models/fakellm%2Fqa-text-v1')
    expect(path.slice('/models/'.length)).not.toContain('/')
  })

  it('没有 model_id 时回落 UUID', () => {
    expect(modelDetailPath({ id: 'b5c1722d-f7b0-4480-ab18-5db182a78dad' })).toBe('/models/b5c1722d-f7b0-4480-ab18-5db182a78dad')
    expect(modelDetailPath({ model_id: null, id: 'u' })).toBe('/models/u')
  })

  it('编码后能被 decodeURIComponent 还原成原 model_id（供 useParams 解码后再请求）', () => {
    const raw = 'fakellm/qa-ladder-discount-v1'
    expect(decodeURIComponent(modelDetailPath({ model_id: raw }).slice('/models/'.length))).toBe(raw)
  })
})
