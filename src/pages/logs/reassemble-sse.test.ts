import { describe, it, expect } from 'vitest'
import { reassembleSSE } from './reassemble-sse'

/** 把若干 data 行拼成一段 SSE 文本 */
function sse(...lines: string[]): string {
  return lines.map((l) => `data: ${l}`).join('\n') + '\ndata: [DONE]\n'
}

describe('reassembleSSE', () => {
  it('非 SSE 文本返回 null', () => {
    expect(reassembleSSE('{"hello":"world"}')).toBeNull()
    expect(reassembleSSE('plain text')).toBeNull()
  })

  it('OpenAI 字符串 content：逐 chunk 累加', () => {
    const text = sse(
      JSON.stringify({ choices: [{ delta: { content: 'He' } }] }),
      JSON.stringify({ choices: [{ delta: { content: 'llo' } }] }),
      JSON.stringify({ choices: [{ delta: { content: ' world' }, finish_reason: 'stop' }] }),
    )
    const r = reassembleSSE(text)
    expect(r?.content).toBe('Hello world')
    expect(r?.finishReason).toBe('stop')
    expect(r?.chunkCount).toBe(3) // [DONE] 不计
  })

  // #184 形态一：content 是内容块数组，旧实现 typeof==='string' 直接漏掉 → 空
  it('OpenAI 数组 content（内容块）：提取各块 text', () => {
    const text = sse(
      JSON.stringify({ choices: [{ delta: { content: [{ type: 'text', text: '你' }] } }] }),
      JSON.stringify({ choices: [{ delta: { content: [{ type: 'text', text: '好' }] } }] }),
    )
    const r = reassembleSSE(text)
    expect(r?.content).toBe('你好')
  })

  // #184 形态二：Anthropic content_block_delta，无 choices，旧实现完全抽不到
  it('Anthropic content_block_delta：从 delta.text 累加，thinking 进 reasoning', () => {
    const text = sse(
      JSON.stringify({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '想一下' } }),
      JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } }),
      JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: ' there' } }),
    )
    const r = reassembleSSE(text)
    expect(r?.content).toBe('Hi there')
    expect(r?.reasoning).toBe('想一下')
  })

  it('reasoning_content 与 content 分别累加', () => {
    const text = sse(
      JSON.stringify({ choices: [{ delta: { reasoning_content: '推理' } }] }),
      JSON.stringify({ choices: [{ delta: { content: '答案' } }] }),
    )
    const r = reassembleSSE(text)
    expect(r?.reasoning).toBe('推理')
    expect(r?.content).toBe('答案')
  })

  it('提取 usage', () => {
    const text = sse(
      JSON.stringify({ choices: [{ delta: { content: 'x' } }] }),
      JSON.stringify({ choices: [{ delta: {} }], usage: { total_tokens: 42 } }),
    )
    const r = reassembleSSE(text)
    expect(r?.usage).toEqual({ total_tokens: 42 })
  })

  it('非 JSON 的 data 行跳过，但仍计入 chunkCount 后被忽略', () => {
    const text = 'data: not-json\n' + sse(JSON.stringify({ choices: [{ delta: { content: 'ok' } }] }))
    const r = reassembleSSE(text)
    expect(r?.content).toBe('ok')
  })
})
