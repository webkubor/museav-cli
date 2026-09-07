/**
 * 调用日志详情 · 缓存命中率（需求方#885）。
 *
 * 守三条容易算错的口径：
 * ① 分母是 input + cache_read + cache_write，不是 input 单项，也不是 total_tokens
 *    （total 含 output，混进去命中率会被系统性算低）；
 * ② 分母为 0（出图/语音等无 token 计量、或模型请求未发起）显「-」，不是 0%——
 *    「读不到」不能渲染成「本来就是 0」，同 #650/#668 的病症；
 * ③ 保留 1 位小数，四舍五入由 toFixed 负责，不额外做取整。
 */
import { describe, expect, it } from 'vitest'

import type { CallLogItem } from '@/types'
import { cacheHitRate, cacheHitRateLabel, cacheTokenState, isCacheCardVisible } from './cache'

function rowWith(usage: Partial<CallLogItem['usage']>): CallLogItem {
  return {
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      ...usage,
    },
  } as CallLogItem
}

describe('cacheHitRate', () => {
  it('分母含 cache_write：600 读 /(200 输入 + 600 读 + 200 写) = 60%', () => {
    expect(cacheHitRate(rowWith({ input_tokens: 200, cache_read_tokens: 600, cache_write_tokens: 200 }))).toBeCloseTo(0.6)
  })

  it('不把 output 计入分母：output 再大也不影响命中率', () => {
    const row = rowWith({ input_tokens: 100, cache_read_tokens: 300, output_tokens: 9999, total_tokens: 10399 })
    expect(cacheHitRate(row)).toBeCloseTo(0.75)
  })

  it('未命中但有输入 → 0（不是 null）', () => {
    expect(cacheHitRate(rowWith({ input_tokens: 500 }))).toBe(0)
  })

  it('三项全 0（出图/语音等无 token 计量）→ null，交由展示层显「-」', () => {
    expect(cacheHitRate(rowWith({ output_tokens: 120 }))).toBeNull()
  })
})

describe('cacheHitRateLabel', () => {
  it('保留 1 位小数', () => {
    expect(cacheHitRateLabel(rowWith({ input_tokens: 3, cache_read_tokens: 5 }))).toBe('62.5%')
  })

  it('未命中显 0.0%', () => {
    expect(cacheHitRateLabel(rowWith({ input_tokens: 500 }))).toBe('0.0%')
  })

  it('无法计算显「-」，不用 0% 冒充（口径同 PRD 详情抽屉字段缺失占位）', () => {
    expect(cacheHitRateLabel(rowWith({}))).toBe('-')
  })
})

describe('缓存卡可见性（需求方#885：只在 cache_supported === true 时展示）', () => {
  it('后端未透传标识（undefined）→ 隐藏', () => {
    expect(isCacheCardVisible(rowWith({ input_tokens: 100, cache_read_tokens: 300 }))).toBe(false)
  })

  it('后端明确回 false（出图/语音/TTS）→ 隐藏', () => {
    expect(isCacheCardVisible({ ...rowWith({}), cache_supported: false })).toBe(false)
  })

  it('后端明确回 true（对话/补全）→ 展示', () => {
    expect(isCacheCardVisible({ ...rowWith({}), cache_supported: true })).toBe(true)
  })
})

describe('cacheTokenState', () => {
  it('有读取 → 报读量', () => {
    expect(cacheTokenState(rowWith({ cache_read_tokens: 800, cache_write_tokens: 200 }))).toEqual({ key: 'read', count: 800 })
  })

  it('只写未读 → 报写量，不能退化成「读 0」（PRD 原型三态）', () => {
    expect(cacheTokenState(rowWith({ input_tokens: 400, cache_write_tokens: 300 }))).toEqual({ key: 'write', count: 300 })
  })

  it('读写都没有 → none，展示层显「未读取缓存」', () => {
    expect(cacheTokenState(rowWith({ input_tokens: 400 }))).toEqual({ key: 'none', count: 0 })
  })
})
