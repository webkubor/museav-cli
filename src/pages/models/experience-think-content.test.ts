/** #1124：思维链仅过滤，不进入用户可见的解析结果。 */
import { describe, expect, it } from 'vitest'
import { parseThinkContent } from './experience-think-content'

describe('parseThinkContent', () => {
  it('无 think 标签：正文原样返回', () => {
    expect(parseThinkContent('你好，我是模型。')).toEqual({ answer: '你好，我是模型。' })
  })

  it('闭合 think：只保留最终回答', () => {
    const result = parseThinkContent('<think>用户在打招呼</think>你好！有什么可以帮你？')
    expect(result).toEqual({ answer: '你好！有什么可以帮你？' })
    expect(JSON.stringify(result)).not.toContain('用户在打招呼')
  })

  it('think 前有正文前缀时保留正文', () => {
    expect(parseThinkContent('前言<think>推理</think>结论').answer).toBe('前言结论')
  })

  it('多段 think 全部过滤，保留各段正文', () => {
    expect(parseThinkContent('<think>第一段</think>回答A<think>第二段</think>回答B').answer).toBe('回答A回答B')
  })

  it('标签大小写不敏感', () => {
    expect(parseThinkContent('<THINK>推理</Think>答案').answer).toBe('答案')
  })

  it('带属性和空白的 think 标签同样只保留最终回答', () => {
    expect(parseThinkContent('前言<think type="reasoning">私有推理</think >答案').answer).toBe('前言答案')
  })

  it('非流式遇到未闭合或不完整的 think 开标签时失败关闭', () => {
    expect(parseThinkContent('前言<think type="reasoning">私有推理').answer).toBe('前言')
    expect(parseThinkContent('前言<think type="reasoning"').answer).toBe('前言')
    expect(parseThinkContent('前言<think type="reasoning<think>私有推理</think>答案').answer).toBe('前言')
  })

  it('流式遇到不完整的属性标签时隐藏标记后的内容', () => {
    expect(parseThinkContent('前言<think type="reasoning"', true).answer).toBe('前言')
  })

  it('嵌套 think 直到所有层级闭合前都不显示内部内容', () => {
    expect(parseThinkContent('<think>secret <think>secret2</think> secret3</think>answer').answer).toBe('answer')
  })

  it('流式：未闭合思维链不进入用户可见正文', () => {
    expect(parseThinkContent('<think>让我想想，这个问题', true)).toEqual({ answer: '' })
  })

  it('流式：开标签本身跨 chunk 时不闪现原文', () => {
    expect(parseThinkContent('<thi', true)).toEqual({ answer: '' })
  })

  it('流式：闭标签跨 chunk 时思维链仍不进入正文', () => {
    expect(parseThinkContent('<think>推理内容</thin', true)).toEqual({ answer: '' })
  })

  it('流式：跨 chunk 补齐后仅输出标签外最终回答', () => {
    const chunks = ['<th', 'ink>推理', '过程</th', 'ink>最终', '答案']
    let acc = ''
    for (const chunk of chunks) {
      acc += chunk
      expect(parseThinkContent(acc, true).answer).not.toContain('推理')
    }
    expect(parseThinkContent(acc, true)).toEqual({ answer: '最终答案' })
  })

  it('流式：正文中的普通小于号不受影响', () => {
    expect(parseThinkContent('1 < 2 是成立的', true).answer).toBe('1 < 2 是成立的')
  })

  it('非流式（历史恢复/定稿）：末尾小于号不被误剪', () => {
    expect(parseThinkContent('结果是 a <')).toEqual({ answer: '结果是 a <' })
  })

  it('历史恢复：思维链过滤后只显示完整回答', () => {
    expect(parseThinkContent('<think>历史推理</think>历史答案')).toEqual({ answer: '历史答案' })
  })

  it('只有 think 没正文（闭合）：解析结果为空，不保留思维链', () => {
    expect(parseThinkContent('<think>只想不说</think>')).toEqual({ answer: '' })
  })
})
