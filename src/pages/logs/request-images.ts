/**
 * 从调用日志的请求体里抽出图片（#1266）。
 *
 * 只认 OpenAI 风格多模态的图片块：`messages[].content[]` 里 `type === 'image_url'`，
 * 地址在 `image_url.url`（字符串或 `{ url }` 对象）。只接受 `data:image/*` 与 http(s) 地址，
 * 其他协议一律丢弃，避免把任意 scheme 塞进 `<img src>`。
 *
 * 解析不了（非 JSON、没有 messages、没有图片块）一律返回空数组，调用方回退到原文展示。
 */
export interface RequestImage {
  /** 所在消息序号（从 0 起），用于在卡片里标注「第几条消息」。 */
  messageIndex: number
  /** 所在消息角色，如 user / system。 */
  role: string
  /** 可直接用于 <img src> 的地址。 */
  src: string
}

function safeImageSrc(raw: unknown): string | null {
  const url = typeof raw === 'string' ? raw : (raw as { url?: unknown } | null)?.url
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return null
}

export function extractRequestImages(text: string): RequestImage[] {
  if (!text) return []
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    return []
  }
  const messages = (obj as { messages?: unknown })?.messages
  if (!Array.isArray(messages)) return []

  const out: RequestImage[] = []
  messages.forEach((m, messageIndex) => {
    const msg = m as { role?: unknown; content?: unknown }
    if (!Array.isArray(msg?.content)) return
    const role = typeof msg.role === 'string' && msg.role ? msg.role : 'user'
    for (const part of msg.content) {
      const block = part as { type?: unknown; image_url?: unknown }
      if (block?.type !== 'image_url') continue
      const src = safeImageSrc(block.image_url)
      if (src) out.push({ messageIndex, role, src })
    }
  })
  return out
}
