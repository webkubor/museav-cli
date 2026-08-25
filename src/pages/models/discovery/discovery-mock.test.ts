/**
 * 发现页数据层的条件分支测试（§3.3 / §3.6）。
 *
 * 这些是「不同条件下 UI 显示什么」的判据源头 —— 排序和过滤错了，
 * 上层再怎么渲染都是错的，且错得不显眼（顺序看着像对的）。
 */
import { describe, it, expect } from 'vitest'
import {
  DISCOVERY_CONFIGS,
  MODALITY_OPTIONS,
  filterByScope,
  sortByMetric,
  type DiscoveryModel,
} from './discovery-mock'

describe('filterByScope', () => {
  it('scope=all 保留全部模型（含未接入）', () => {
    const models = DISCOVERY_CONFIGS.text.models
    expect(filterByScope(models, 'all')).toHaveLength(models.length)
  })

  it('scope=supported 只留已接入，未接入被剔除', () => {
    const result = filterByScope(DISCOVERY_CONFIGS.text.models, 'supported')
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((m) => m.supported)).toBe(true)
  })
})

describe('sortByMetric', () => {
  it('overall 按 score 降序', () => {
    const sorted = sortByMetric(DISCOVERY_CONFIGS.text.models, 'overall')
    const scores = sorted.map((m) => Number.parseFloat(m.score))
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })

  it('usage 把 — 排到末尾而不是当 0 混在中间', () => {
    const sorted = sortByMetric(DISCOVERY_CONFIGS.text.models, 'usage')
    const dashIndexes = sorted.map((m, i) => (m.usage === '—' ? i : -1)).filter((i) => i >= 0)
    const lastRealIndex = sorted.map((m, i) => (m.usage !== '—' ? i : -1)).reduce((a, b) => Math.max(a, b), -1)
    // 所有 — 的位置都必须在最后一个有值项之后
    for (const idx of dashIndexes) expect(idx).toBeGreaterThan(lastRealIndex)
  })

  it('识别 B / M / K 量级，不按字面数字比大小', () => {
    const models: DiscoveryModel[] = [
      { name: 'a', provider: 'p', supported: true, score: '1', performance: '', price: '', usage: '900M' },
      { name: 'b', provider: 'p', supported: true, score: '1', performance: '', price: '', usage: '2B' },
      { name: 'c', provider: 'p', supported: true, score: '1', performance: '', price: '', usage: '500K' },
    ]
    // 若按字面 parseFloat，900 会大于 2 —— 那就排错了
    expect(sortByMetric(models, 'usage').map((m) => m.name)).toEqual(['b', 'a', 'c'])
  })

  it('不修改入参数组（避免上层 useMemo 依赖被就地改动）', () => {
    const models = DISCOVERY_CONFIGS.text.models
    const before = models.map((m) => m.name)
    sortByMetric(models, 'usage')
    expect(models.map((m) => m.name)).toEqual(before)
  })
})

describe('模态配置完整性', () => {
  it('五个模态都有配置，且只有 agent 没有二级任务', () => {
    for (const { key } of MODALITY_OPTIONS) {
      const config = DISCOVERY_CONFIGS[key]
      expect(config, `缺 ${key} 配置`).toBeDefined()
      expect(config.models.length).toBeGreaterThan(0)
      expect(config.specialties.length).toBeGreaterThan(0)
      if (key === 'agent') expect(config.tasks).toHaveLength(0)
      else expect(config.tasks.length).toBeGreaterThan(0)
    }
  })

  it('每个模态都同时存在已接入与未接入模型，保证两种行样式都能被看到', () => {
    for (const { key } of MODALITY_OPTIONS) {
      const models = DISCOVERY_CONFIGS[key].models
      expect(models.some((m) => m.supported), `${key} 缺已接入模型`).toBe(true)
      expect(models.some((m) => !m.supported), `${key} 缺未接入模型`).toBe(true)
    }
  })

  it('未接入模型不能带 id —— 带了就会被渲染成可点击进详情', () => {
    for (const { key } of MODALITY_OPTIONS) {
      for (const model of DISCOVERY_CONFIGS[key].models) {
        if (!model.supported) expect(model.id, `${key}/${model.name}`).toBeUndefined()
      }
    }
  })

  it('散点预设的轴序号不越界', () => {
    for (const { key } of MODALITY_OPTIONS) {
      const config = DISCOVERY_CONFIGS[key]
      for (const preset of config.presets) {
        expect(preset.y).toBeLessThan(config.yMetrics.length)
        expect(preset.x).toBeLessThan(config.xMetrics.length)
      }
    }
  })
})
