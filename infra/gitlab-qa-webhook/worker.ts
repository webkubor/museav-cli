/**
 * GitLab QA Issue 状态通知中转。
 * 校验 GitLab webhook、过滤 project 1 的状态标签变化，并转发到 ModelGo 飞书群。
 */

interface Env {
  readonly FEISHU_WEBHOOK_URL: string
  readonly GITLAB_WEBHOOK_TOKEN: string
}

interface StatusNotification {
  readonly iid: number
  readonly title: string
  readonly from: string
  readonly to: string
  readonly username: string
  readonly url: string
}

const QA_PROJECT_ID = 1
const STATUS_LABELS = new Set([
  '待处理',
  '已认领',
  '进行中',
  '待验证',
  '已完成',
  '待澄清',
])

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
)

const readString = (record: Record<string, unknown>, key: string): string | null => (
  typeof record[key] === 'string' ? record[key] : null
)

const readNumber = (record: Record<string, unknown>, key: string): number | null => (
  typeof record[key] === 'number' ? record[key] : null
)

const readStatusLabels = (value: unknown): ReadonlySet<string> => {
  if (!Array.isArray(value)) return new Set()

  const labels = value.flatMap((item) => {
    if (!isRecord(item)) return []
    const title = readString(item, 'title')
    return title && STATUS_LABELS.has(title) ? [title] : []
  })

  return new Set(labels)
}

const findStatusDiff = (
  previous: ReadonlySet<string>,
  current: ReadonlySet<string>,
): Pick<StatusNotification, 'from' | 'to'> | null => {
  const removed = [...previous].filter((label) => !current.has(label))
  const added = [...current].filter((label) => !previous.has(label))
  if (removed.length === 0 && added.length === 0) return null

  return {
    from: removed.join('、') || '未标记',
    to: added.join('、') || '未标记',
  }
}

/** 从 GitLab Issue Hook 载荷中提取状态变更通知。 */
export const extractStatusNotification = (payload: unknown): StatusNotification | null => {
  if (!isRecord(payload) || payload.object_kind !== 'issue') return null

  const project = payload.project
  const attributes = payload.object_attributes
  const changes = payload.changes
  const user = payload.user
  if (
    !isRecord(project)
    || !isRecord(attributes)
    || !isRecord(changes)
    || !isRecord(user)
  ) return null
  if (readNumber(project, 'id') !== QA_PROJECT_ID || attributes.action !== 'update') return null

  const labelChange = changes.labels
  if (!isRecord(labelChange)) return null
  const diff = findStatusDiff(
    readStatusLabels(labelChange.previous),
    readStatusLabels(labelChange.current),
  )
  if (!diff) return null

  const iid = readNumber(attributes, 'iid')
  const title = readString(attributes, 'title')
  const url = readString(attributes, 'url')
  const username = readString(user, 'username')
  if (iid === null || !title || !url || !username) return null

  return { iid, title, url, username, ...diff }
}

const buildMessage = (notification: StatusNotification): string => [
  '📋 QA 任务状态变更',
  `#${notification.iid} ${notification.title}`,
  `${notification.from} → ${notification.to}`,
  `操作人：${notification.username}`,
  notification.url,
].join('\n')

const sendFeishuNotification = async (
  webhookUrl: string,
  notification: StatusNotification,
): Promise<boolean> => {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msg_type: 'text',
      content: { text: buildMessage(notification) },
    }),
  })
  if (!response.ok) return false

  const result: unknown = await response.json().catch(() => null)
  if (!isRecord(result)) return false
  return result.code === 0 || result.StatusCode === 0
}

const handleRequest = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/health') {
    return Response.json({ status: 'ok' })
  }
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  if (!env.GITLAB_WEBHOOK_TOKEN || request.headers.get('X-Gitlab-Token') !== env.GITLAB_WEBHOOK_TOKEN) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const notification = extractStatusNotification(payload)
  if (!notification) return new Response(null, { status: 204 })
  if (!env.FEISHU_WEBHOOK_URL) return new Response('Missing notification target', { status: 500 })

  const sent = await sendFeishuNotification(env.FEISHU_WEBHOOK_URL, notification)
  return new Response(null, { status: sent ? 204 : 502 })
}

export default { fetch: handleRequest }
