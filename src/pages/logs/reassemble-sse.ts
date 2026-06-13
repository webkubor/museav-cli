/**
 * 流式 SSE 响应合并还原。
 *
 * 日志详情「原始 PAYLOAD → 响应」会把一堆 `data: {...}` chunk 合并成完整回答展示。
 * 多格式兼容：
 * - OpenAI：choices[0].delta/message.content（字符串或内容块数组）、reasoning_content
 * - Anthropic：content_block_delta 的 delta.text / thinking_delta 的 delta.thinking（无 choices）
 *
 * #184：旧实现只认 OpenAI 的 delta.content 字符串，遇到「内容块数组」或「Anthropic 格式」时
 * 17 个 chunk 全解析成功却抽不出正文，展示为空。此处按多路径提取修复。
 */

export interface SSEReassembled {
  reasoning: string
  content: string
  chunkCount: number
  finishReason?: string
  usage?: unknown
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/**
 * 从 content 字段提取文本，兼容：
 * - 字符串：直接用
 * - 内容块数组：[{type:'text',text}] / [{text}] / 纯字符串项 → 拼接其文本
 */
function partsToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (isRecord(part)) {
          if (typeof part.text === 'string') return part.text
          if (typeof part.content === 'string') return part.content
        }
        return ''
      })
      .join('')
  }
  return ''
}

export function reassembleSSE(text: string): SSEReassembled | null {
  if (!/^\s*data:/.test(text)) return null
  let reasoning = ''
  let content = ''
  let chunkCount = 0
  let finishReason: string | undefined
  let usage: unknown
  let sawJson = false

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const data = trimmed.slice(5).trim()
    if (!data || data === '[DONE]') continue
    chunkCount++

    let obj: unknown
    try {
      obj = JSON.parse(data)
    } catch {
      continue // 非 JSON 的 data 行，跳过
    }
    if (!isRecord(obj)) continue
    sawJson = true

    const choices = obj.choices
    const choice = Array.isArray(choices) && isRecord(choices[0]) ? choices[0] : null

    if (choice) {
      // ── OpenAI 风格：choices[0].delta（流式）/ message（非流式）──
      const delta = isRecord(choice.delta)
        ? choice.delta
        : isRecord(choice.message)
          ? choice.message
          : null
      if (delta) {
        reasoning += partsToText(delta.reasoning_content)
        content += partsToText(delta.content)
        if (typeof delta.text === 'string') content += delta.text // 个别 shim 把文本放 delta.text
      }
      if (typeof choice.finish_reason === 'string') finishReason = choice.finish_reason
    } else if (isRecord(obj.delta)) {
      // ── Anthropic 风格：content_block_delta / thinking_delta（无 choices）──
      const delta = obj.delta
      if (typeof delta.text === 'string') content += delta.text
      if (typeof delta.thinking === 'string') reasoning += delta.thinking
      if (!finishReason && typeof delta.stop_reason === 'string') finishReason = delta.stop_reason
    } else if (Array.isArray(obj.content)) {
      // 非流式消息体里的内容块数组
      content += partsToText(obj.content)
    }

    if (obj.usage !== undefined) usage = obj.usage
    else if (isRecord(obj.message) && obj.message.usage !== undefined) usage = obj.message.usage
  }

  if (!sawJson) return null
  return { reasoning, content, chunkCount, finishReason, usage }
}

export function formatSSESummary(s: SSEReassembled): string {
  const blocks: string[] = []
  if (s.reasoning) blocks.push(`【推理 reasoning_content】\n${s.reasoning}`)
  blocks.push(`【回答 content】\n${s.content || '(空)'}`)
  const meta = [`合并 ${s.chunkCount} 个 chunk`]
  if (s.finishReason) meta.push(`finish_reason: ${s.finishReason}`)
  if (s.usage) meta.push(`usage: ${JSON.stringify(s.usage)}`)
  blocks.push(`──\n${meta.join('  ·  ')}`)
  return blocks.join('\n\n')
}
