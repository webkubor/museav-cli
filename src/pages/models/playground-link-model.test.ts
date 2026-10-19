import { describe, expect, it } from 'vitest'
import type { CatalogModelItem } from '@/types'
import { resolvePlaygroundLinkModel } from './playground-link-model'

const models = [
  { id: 'uuid-a', model_id: 'vendor/model-a' },
  { id: 'uuid-b', model_id: 'model-b' },
] as CatalogModelItem[]

describe('官网活动进入模型体验 #1390', () => {
  it('仅根据编码后的 catalog model_id 精确选择存在的模型', () => {
    expect(resolvePlaygroundLinkModel('?model_id=vendor%2Fmodel-a', models)).toBe(models[0])
    expect(resolvePlaygroundLinkModel('?model_id=model-b', models)).toBe(models[1])
  })

  it('拒绝未知 ID、内部 UUID、缺失参数以及过长参数，不做模糊匹配', () => {
    expect(resolvePlaygroundLinkModel('?model_id=model', models)).toBeUndefined()
    expect(resolvePlaygroundLinkModel('?model_id=uuid-a', models)).toBeUndefined()
    expect(resolvePlaygroundLinkModel('?model_id=missing', models)).toBeUndefined()
    expect(resolvePlaygroundLinkModel('', models)).toBeUndefined()
    expect(resolvePlaygroundLinkModel(`?model_id=${'x'.repeat(257)}`, models)).toBeUndefined()
  })
})
