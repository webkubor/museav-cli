/**
 * 模型思维链（<think>...</think>）解析（#334，shared/modelgo_prd#334）。
 *
 * 会输出思维链的模型（如 MiniMax M3）把推理段落用 <think> 标签内联在正文里返回，
 * 渲染层必须把它拆成独立的「思考过程」块，标签本身绝不外露给用户。
 *
 * 覆盖三条路径（都汇入 ExperienceMessage.content、在 ExperienceMessageList 渲染时解析）：
 * 1. 流式 SSE：标签可能跨 chunk 到达——只有开标签没闭合时，后续内容整段按思考中处理；
 *    末尾出现半截标签（如 "<thi"）时按流式在途暂扣、不闪现原文。
 * 2. 历史会话恢复：完整 content 一次到达，同一解析。
 * 3. 对比页每列：与单模型页共用 ExperienceMessageList，自动生效。
 */

const OPEN_TAG = '<think>'
const CLOSE_TAG = '</think>'

export interface ThinkParseResult {
  /** 思考过程文本（多段 think 合并、去掉标签本身），无思维链时为空串 */
  think: string
  /** 正文（think 段以外的内容） */
  answer: string
  /** 是否存在未闭合的 <think>（流式思考进行中，其后内容全部计入 think） */
  thinkOpen: boolean
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
 * 把含 <think> 标签的模型输出拆成 思考过程 / 正文。
 *
 * @param streaming 该消息是否仍在流式接收中——只有在途时才暂扣末尾的半截标签，
 *                  已定稿的消息若真以 "<" 之类字符结尾（如数学表达式）不能被误剪。
 */
export function parseThinkContent(content: string, streaming = false): ThinkParseResult {
  if (!content.toLowerCase().includes('<think') && !(streaming && content.includes('<'))) {
    return { think: '', answer: content, thinkOpen: false }
  }
  let answer = ''
  let think = ''
  let thinkOpen = false
  let rest = content
  for (;;) {
    if (!thinkOpen) {
      const idx = rest.toLowerCase().indexOf(OPEN_TAG)
      if (idx === -1) {
        answer += streaming ? trimPartialTagTail(rest, OPEN_TAG) : rest
        break
      }
      answer += rest.slice(0, idx)
      rest = rest.slice(idx + OPEN_TAG.length)
      thinkOpen = true
    } else {
      const idx = rest.toLowerCase().indexOf(CLOSE_TAG)
      if (idx === -1) {
        const chunk = streaming ? trimPartialTagTail(rest, CLOSE_TAG) : rest
        think += think && chunk ? `\n\n${chunk}` : chunk
        break
      }
      const chunk = rest.slice(0, idx)
      think += think && chunk ? `\n\n${chunk}` : chunk
      rest = rest.slice(idx + CLOSE_TAG.length)
      thinkOpen = false
    }
  }
  return { think: think.trim(), answer: answer.trim(), thinkOpen }
}
