import { describe, it, expect } from 'vitest'
import { patchLastAssistant, patchMessageById } from './message-patch'

type Msg = { role: string; content: string; error?: string }

describe('patchLastAssistant', () => {
  it('改最后一条 assistant，其余不动', () => {
    const list: Msg[] = [
      { role: 'user', content: '问' },
      { role: 'assistant', content: '答' },
    ]
    const next = patchLastAssistant(list, { content: '答完整' })
    expect(next[1].content).toBe('答完整')
    expect(next[0]).toBe(list[0])
  })

  it('patch 支持按当前值计算（流式累加 delta）', () => {
    const list: Msg[] = [{ role: 'assistant', content: 'ab' }]
    expect(patchLastAssistant(list, (last) => ({ content: last.content + 'c' }))[0].content).toBe('abc')
  })

  it('最后一条不是 assistant 时原样返回同一引用', () => {
    const list: Msg[] = [{ role: 'assistant', content: '答' }, { role: 'user', content: '追问' }]
    expect(patchLastAssistant(list, { content: 'x' })).toBe(list)
  })

  it('空列表原样返回', () => {
    const list: Msg[] = []
    expect(patchLastAssistant(list, { content: 'x' })).toBe(list)
  })

  it('不改动入参数组（不可变）', () => {
    const list: Msg[] = [{ role: 'assistant', content: '答' }]
    patchLastAssistant(list, { content: '改了' })
    expect(list[0].content).toBe('答')
  })

  it('可指定其他角色名', () => {
    const list = [{ role: 'agent', content: '' }]
    expect(patchLastAssistant(list, { content: 'hi' }, 'agent')[0].content).toBe('hi')
  })
})

describe('patchMessageById', () => {
  const list = [
    { id: 'a', content: '1' },
    { id: 'b', content: '2' },
  ]

  it('按 id 改中间某条', () => {
    const next = patchMessageById(list, 'a', { content: '改' })
    expect(next[0].content).toBe('改')
    expect(next[1]).toBe(list[1])
  })

  it('patch 可按当前值计算', () => {
    expect(patchMessageById(list, 'b', (m) => ({ content: `${m.content}尾` }))[1].content).toBe('2尾')
  })

  it('id 不存在时原样返回同一引用', () => {
    expect(patchMessageById(list, 'zzz', { content: 'x' })).toBe(list)
  })
})
