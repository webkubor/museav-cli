/**
 * extractFinalAnswer 的语义守卫，逐条对齐后端
 * modelgo-agent `pkg/support/loop/reasoning_test.go` 的 TestExtractFinalAnswer。
 *
 * 重点是两条互相拉扯的约束：结构化 <think> 块（完整/多条/嵌套/带属性/畸形未闭合）
 * 必须清掉，而合法英文正文（含 "I'll help you"、"I think …"）必须逐字保留。
 */
import { describe, expect, it } from 'vitest'
import { extractFinalAnswer } from './final-answer'

describe('extractFinalAnswer', () => {
  it.each([
    {
      name: 'QA 注入的原样',
      raw: "<think>reasoning</think>I'll help you… Let me check…final answer",
      want: "I'll help you… Let me check…final answer",
    },
    { name: '多条块', raw: '<think>a</think>one<think>b</think>two', want: 'onetwo' },
    { name: '嵌套块', raw: '<think>a<think>b</think>c</think>rest', want: 'rest' },
    { name: '带属性的开标签', raw: '<think type="reasoning" data-x=1>hidden</think>shown', want: 'shown' },
    { name: '大写标签', raw: '<THINK>hidden</THINK>shown', want: 'shown' },
    { name: '畸形未闭合', raw: '进入控制台创建 API Key。<think>仍在思考', want: '进入控制台创建 API Key。' },
    { name: '开标签无闭括号', raw: '答案在此<think still', want: '答案在此' },
    { name: '整条只有 think', raw: '<think>only reasoning</think>', want: '' },
    { name: '游离闭标签', raw: 'answer here</think>', want: 'answer here' },
    {
      name: '合法英文句子',
      raw: "I'll help you reset the key. Let me check the console.",
      want: "I'll help you reset the key. Let me check the console.",
    },
    { name: '正文提到 think 一词', raw: 'I think this is fine.', want: 'I think this is fine.' },
    { name: 'thinking 不是 think', raw: '<thinking>hidden</thinking>shown', want: '<thinking>hidden</thinking>shown' },
    { name: '空串', raw: '', want: '' },
  ])('$name', ({ raw, want }) => {
    expect(extractFinalAnswer(raw)).toBe(want)
  })
})
