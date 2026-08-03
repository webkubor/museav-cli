import { describe, expect, it } from 'vitest'
import { parseThinkContent } from './experience-think-content'

describe('parseThinkContent', () => {
  it('无 think 标签：正文原样返回', () => {
    const r = parseThinkContent('你好，我是模型。')
    expect(r).toEqual({ think: '', answer: '你好，我是模型。', thinkOpen: false })
  })

  it('闭合 think：思考与正文分离，标签不外露', () => {
    const r = parseThinkContent('<think>用户在打招呼，直接回应即可。</think>你好！有什么可以帮你？')
    expect(r.think).toBe('用户在打招呼，直接回应即可。')
    expect(r.answer).toBe('你好！有什么可以帮你？')
    expect(r.thinkOpen).toBe(false)
    expect(r.answer).not.toContain('<think')
  })

  it('think 前有正文前缀时保留正文', () => {
    const r = parseThinkContent('前言<think>推理</think>结论')
    expect(r.think).toBe('推理')
    expect(r.answer).toBe('前言结论')
  })

  it('多段 think 合并为同一思考块', () => {
    const r = parseThinkContent('<think>第一段</think>回答A<think>第二段</think>回答B')
    expect(r.think).toBe('第一段\n\n第二段')
    expect(r.answer).toBe('回答A回答B')
  })

  it('标签大小写不敏感', () => {
    const r = parseThinkContent('<THINK>推理</Think>答案')
    expect(r.think).toBe('推理')
    expect(r.answer).toBe('答案')
  })

  // —— 流式（SSE delta 跨 chunk）场景 ——

  it('流式：只有开标签未闭合，后续内容整段按思考中处理', () => {
    const r = parseThinkContent('<think>让我想想，这个问题', true)
    expect(r.think).toBe('让我想想，这个问题')
    expect(r.answer).toBe('')
    expect(r.thinkOpen).toBe(true)
  })

  it('流式：开标签本身跨 chunk（末尾半截 "<thi"）不闪现原文', () => {
    const r = parseThinkContent('<thi', true)
    expect(r.answer).toBe('')
    expect(r.think).toBe('')
    expect(r.thinkOpen).toBe(false)
  })

  it('流式：闭标签跨 chunk（think 内末尾半截 "</thin"）暂扣不外露', () => {
    const r = parseThinkContent('<think>推理内容</thin', true)
    expect(r.think).toBe('推理内容')
    expect(r.thinkOpen).toBe(true)
    expect(r.think).not.toContain('</')
  })

  it('流式：跨 chunk 累积补齐后与一次性到达结果一致', () => {
    const chunks = ['<th', 'ink>推理', '过程</th', 'ink>最终', '答案']
    let acc = ''
    for (const c of chunks) {
      acc += c
      const mid = parseThinkContent(acc, true)
      expect(mid.answer).not.toContain('<think')
      expect(mid.answer).not.toContain('</think')
      expect(mid.think).not.toContain('<think')
    }
    const final = parseThinkContent(acc, true)
    expect(final).toEqual({ think: '推理过程', answer: '最终答案', thinkOpen: false })
  })

  it('流式：正文中的普通 "<" 不受影响', () => {
    const r = parseThinkContent('1 < 2 是成立的', true)
    expect(r.answer).toBe('1 < 2 是成立的')
  })

  it('非流式（历史恢复/定稿）：末尾 "<" 不被误剪', () => {
    const r = parseThinkContent('结果是 a <')
    expect(r.answer).toBe('结果是 a <')
  })

  it('历史恢复：完整 content 一次到达同样拆分', () => {
    const r = parseThinkContent('<think>历史推理</think>历史答案')
    expect(r.think).toBe('历史推理')
    expect(r.answer).toBe('历史答案')
  })

  it('只有 think 没正文（闭合）：answer 为空', () => {
    const r = parseThinkContent('<think>只想不说</think>')
    expect(r.think).toBe('只想不说')
    expect(r.answer).toBe('')
    expect(r.thinkOpen).toBe(false)
  })
})
