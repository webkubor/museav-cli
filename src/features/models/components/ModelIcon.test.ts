/**
 * ModelIcon 的厂牌归属回归测试。
 * 路由：所有使用 ModelIcon 的模型展示页。
 * API：GET /catalog/models 返回 provider（公开厂牌）与 vendor（内部上游）。
 */
import { describe, expect, test } from 'vitest'
import { modelIconVendor } from './model-icon-vendor'

describe('modelIconVendor', () => {
  test('公开 provider 必须覆盖内部 vendor', () => {
    expect(modelIconVendor({ provider: 'Z.ai', vendor: 'ChatGLM' })).toBe('Z.ai')
  })

  test('provider 缺失时回退内部 vendor', () => {
    expect(modelIconVendor({ vendor: 'Kling' })).toBe('Kling')
  })

  test('空白字段不产生错误厂牌', () => {
    expect(modelIconVendor({ provider: '  ', vendor: ' ' })).toBeUndefined()
  })
})
