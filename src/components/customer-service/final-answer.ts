/**
 * 智能客服最终答复的结构化 <think> 抽取（#1124，前端显示侧防线）。
 *
 * 后端 modelgo-agent 已在答案边界做同一件事 ——
 * `pkg/support/loop/reasoning.go` 的 `ExtractFinalAnswer`（commit 32d4a47）：
 * 模型把推理用 <think>…</think> 内联在正文里返回时，标签与推理内容绝不能上屏。
 * 前端再兜一层：历史消息、旧版本后端、以及任何绕过后端边界的路径，
 * 在渲染助手回答前都要按同一套语义清一遍。
 *
 * 语义刻意是**纯结构**的：只认 <think 标签本身，绝不匹配 "I'll help you"
 * 这类自然语言短语（它们可能是合法正文）。与后端逐条对齐：
 * - 完整块，一条消息里多块；
 * - 嵌套块；
 * - 带属性的开标签（<think type="reasoning">）；
 * - 畸形 / 被截断的开标签 —— 其后内容全部丢弃。
 *
 * 标签之外的文本原样保留（仅裁掉首尾空白）。整条只有 think 块时抽取为空串。
 */

const THINK_OPEN_TAG = '<think'
const THINK_CLOSE_TAG = '</think'

/** ASCII 大小写不敏感的前缀判断；标签只含 ASCII，故 lower-case 比较与后端 EqualFold 等价。 */
function hasPrefixFold(s: string, prefix: string): boolean {
  return s.length >= prefix.length && s.slice(0, prefix.length).toLowerCase() === prefix
}

/** 词字符判断：`<thinking>` / `<thinker>` 不是要抽取的标签。 */
function isWordChar(c: string): boolean {
  return c === '_' || (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
}

/**
 * s 从 i 起是否为开标签 `<think…>`；是则返回刚过 `>` 的下标。
 * 没有 `>` 的视为畸形开标签，吞掉剩余全部（返回 s.length）。
 */
function matchThinkOpen(s: string, i: number): number | null {
  if (!hasPrefixFold(s.slice(i), THINK_OPEN_TAG)) return null
  const j = i + THINK_OPEN_TAG.length
  if (j < s.length && isWordChar(s[j])) return null
  for (let k = j; k < s.length; k++) {
    if (s[k] === '>') return k + 1
  }
  return s.length
}

/** s 从 i 起是否为闭标签 `</think>`（`>` 前允许空白）；是则返回刚过 `>` 的下标。 */
function matchThinkClose(s: string, i: number): number | null {
  if (!hasPrefixFold(s.slice(i), THINK_CLOSE_TAG)) return null
  const j = i + THINK_CLOSE_TAG.length
  if (j < s.length && isWordChar(s[j])) return null
  for (let k = j; k < s.length; k++) {
    const c = s[k]
    if (c === '>') return k + 1
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') continue
    return null
  }
  return null
}

export function extractFinalAnswer(raw: string): string {
  const s = raw.trim()
  if (s === '' || !s.toLowerCase().includes('think')) return s

  let out = ''
  let depth = 0
  for (let i = 0; i < s.length;) {
    const openEnd = matchThinkOpen(s, i)
    if (openEnd !== null) {
      depth++
      i = openEnd
      continue
    }
    const closeEnd = matchThinkClose(s, i)
    if (closeEnd !== null) {
      if (depth > 0) depth--
      i = closeEnd
      continue
    }
    if (depth === 0) out += s[i]
    i++
  }
  return out.trim()
}
