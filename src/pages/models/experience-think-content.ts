/**
 * 模型思维链（<think>...</think>）过滤（PRD shared/modelgo_prd#1124）。
 *
 * 模型可能把推理段落用 <think> 标签内联在正文里返回；仅保留标签外的最终答复，
 * 思维链正文与原始标签都不得展示给用户，也不单独保存在解析结果中。
 *
 * 覆盖三条路径（都汇入 ExperienceMessage.content、在 ExperienceMessageList 渲染时解析）：
 * 1. 流式 SSE：标签可能跨 chunk 到达——只有开标签没闭合时，后续内容整段按思考中处理；
 *    末尾出现半截标签（如 "<thi"）时按流式在途暂扣、不闪现原文。
 * 2. 历史会话恢复：完整 content 一次到达，同一解析。
 * 3. 对比页每列：与单模型页共用 ExperienceMessageList，自动生效。
 */

const OPEN_TAG = '<think>'
const OPEN_START_RE = /<think\b/i
const OPEN_TAG_RE = /<think\b[^<>]*>/i
const CLOSE_TAG_RE = /<\/think\s*>/i

export interface ThinkParseResult {
  /** 正文（think 段以外的内容） */
  answer: string
}

/** 末尾半截标签暂扣：流式 chunk 可能停在标签中间（如 "…<thi"），
 *  把匹配到的标签前缀从展示文本里剪掉，等下一个 chunk 补齐再判定。 */
function trimPartialTagTail(text: string, tag: string): string {
  const lower = text.toLowerCase()
  const max = Math.min(tag.length - 1, text.length)
  for (let len = max; len >= 1; len--) {
    if (lower.endsWith(tag.slice(0, len))) return text.slice(0, text.length - len)
  }
  return text
}

/**
 * 过滤含 <think> 标签的模型输出，只返回标签外的正文。
 *
 * @param streaming 该消息是否仍在流式接收中——只有在途时才暂扣末尾的半截标签，
 *                  已定稿的消息若真以 "<" 之类字符结尾（如数学表达式）不能被误剪。
 */
export function parseThinkContent(content: string, streaming = false): ThinkParseResult {
  if (!content.toLowerCase().includes('<think') && !(streaming && content.includes('<'))) {
    return { answer: content }
  }
  let answer = ''
  let thinkDepth = 0
  let rest = content
  for (;;) {
    if (thinkDepth === 0) {
      const openTag = OPEN_TAG_RE.exec(rest)
      const malformedOpenIndex = OPEN_START_RE.exec(rest)?.index
      if (malformedOpenIndex !== undefined && (!openTag || malformedOpenIndex < openTag.index)) {
        answer += rest.slice(0, malformedOpenIndex)
        break
      }
      if (!openTag || openTag.index === undefined) {
        answer += streaming ? trimPartialTagTail(rest, OPEN_TAG) : rest
        break
      }
      answer += rest.slice(0, openTag.index)
      rest = rest.slice(openTag.index + openTag[0].length)
      thinkDepth = 1
    } else {
      const nestedOpenStart = OPEN_START_RE.exec(rest)
      const closeTag = CLOSE_TAG_RE.exec(rest)
      if (nestedOpenStart && (closeTag === null || nestedOpenStart.index < closeTag.index)) {
        const nestedTag = OPEN_TAG_RE.exec(rest.slice(nestedOpenStart.index))
        const nestedLength = nestedTag?.index === 0 ? nestedTag[0].length : '<think'.length
        rest = rest.slice(nestedOpenStart.index + nestedLength)
        thinkDepth += 1
        continue
      }
      if (!closeTag || closeTag.index === undefined) break
      rest = rest.slice(closeTag.index + closeTag[0].length)
      thinkDepth -= 1
    }
  }
  return { answer: answer.trim() }
}
