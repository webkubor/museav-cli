import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import type { Plugin } from 'vite'

const DATA_FILE = path.resolve(process.cwd(), '.requirements.json')
const GITLAB_HOST = 'gitlab.ops.modelgo.com'
const GITLAB_PROJECT_ID = 1
const GITLAB_USER_ID = 8
const GLAB_BIN_CANDIDATES = [
  process.env.GLAB_BIN,
  'glab',
  '/opt/homebrew/bin/glab',
  '/usr/local/bin/glab',
].filter((candidate): candidate is string => Boolean(candidate))

let resolvedGlabBin: string | null = null

export interface Requirement {
  id: string
  title: string
  priority: 'high' | 'medium' | 'low'
  status: 'pending' | 'done'
  createdAt: string
  note?: string
  gitlabIid?: number
  gitlabState?: string
  gitlabLabels?: string[]
  assignee?: string
}

interface GitLabIssue {
  iid: number
  title: string
  state: string
  labels: string[]
  assignee: { username: string } | null
  created_at: string
}

interface GitLabUser {
  id: number
  username: string
  name: string
}

const STATUS_LABELS = ['已认领', '进行中', '待验证', '已完成']

type Action =
  | { action: 'add'; title: string; priority?: Requirement['priority']; note?: string; gitlabIid?: number }
  | { action: 'toggle'; id: string }
  | { action: 'delete'; id: string }
  | { action: 'update'; id: string; title: string; gitlabIid?: number }
  | { action: 'reorder'; ids: string[] }
  | { action: 'sync' }
  | { action: 'claim'; id: string }
  | { action: 'push'; id: string }
  | { action: 'finish'; id: string }
  | { action: 'comment'; id: string; content: string }
  | { action: 'assign'; id: string; assigneeId: number }

function read(): Requirement[] {
  if (!fs.existsSync(DATA_FILE)) return []
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as Requirement[]
  } catch {
    return []
  }
}

function write(items: Requirement[]): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2))
}

function readBody(req: import('http').IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => resolve(body))
  })
}

function shellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function resolveGlabBin(): string {
  if (resolvedGlabBin) return resolvedGlabBin

  for (const candidate of GLAB_BIN_CANDIDATES) {
    try {
      execSync(`${shellArg(candidate)} --version`, { stdio: 'ignore', timeout: 5_000 })
      resolvedGlabBin = candidate
      return candidate
    } catch {
      // Try the next known install location.
    }
  }

  throw new Error('glab_not_found: install glab or set GLAB_BIN=/path/to/glab')
}

function glab(cmd: string): string {
  return execSync(`${shellArg(resolveGlabBin())} api ${cmd} --hostname ${GITLAB_HOST}`, {
    encoding: 'utf-8',
    timeout: 15_000,
  })
}

function glabJson<T>(cmd: string): T {
  return JSON.parse(glab(cmd)) as T
}

function listGitlabUsers(): GitLabUser[] {
  return glabJson<GitLabUser[]>(`"projects/${GITLAB_PROJECT_ID}/users?per_page=100"`)
}

function gitlabStatusToPriority(labels: string[]): Requirement['priority'] {
  if (labels.some((l) => l === 'BUG')) return 'high'
  return 'medium'
}

function gitlabStatusToLocal(issue: GitLabIssue): Requirement['status'] {
  if (issue.state === 'closed' || issue.labels.includes('已完成')) return 'done'
  return 'pending'
}

// 开发者菜单只服务“当前需要我监控的问题”，不做 GitLab 历史台账。
// 这里仍然分页拉取，避免未关闭事项超过 100 条时被截断。
function fetchOpenGitlabIssues(): GitLabIssue[] {
  const perPage = 100
  const all: GitLabIssue[] = []
  for (let page = 1; ; page += 1) {
    const batch = glabJson<GitLabIssue[]>(
      `"groups/qa/issues?state=opened&per_page=${perPage}&page=${page}"`
    )
    all.push(...batch)
    if (batch.length < perPage) break
  }
  return all
}

function syncFromGitlab(items: Requirement[]): Requirement[] {
  const issues = fetchOpenGitlabIssues()
  const iidMap = new Map(items.filter((i) => i.gitlabIid).map((i) => [i.gitlabIid!, i]))

  const merged = [...items]

  for (const issue of issues) {
    const existing = iidMap.get(issue.iid)
    if (existing) {
      const idx = merged.indexOf(existing)
      merged[idx] = {
        ...existing,
        title: issue.title.replace(/^\[Console需求\]\s*/, '').replace(/^\[cs:claude\]\s*/, ''),
        status: gitlabStatusToLocal(issue),
        gitlabState: issue.state,
        gitlabLabels: issue.labels,
        assignee: issue.assignee?.username ?? undefined,
      }
    } else {
      merged.push({
        id: `gl-${issue.iid}`,
        title: issue.title.replace(/^\[Console需求\]\s*/, '').replace(/^\[cs:claude\]\s*/, ''),
        priority: gitlabStatusToPriority(issue.labels),
        status: gitlabStatusToLocal(issue),
        createdAt: issue.created_at,
        gitlabIid: issue.iid,
        gitlabState: issue.state,
        gitlabLabels: issue.labels,
        assignee: issue.assignee?.username ?? undefined,
      })
    }
  }

  return merged
}

function claimIssue(items: Requirement[], localId: string): Requirement[] {
  const item = items.find((i) => i.id === localId)
  if (!item?.gitlabIid) throw new Error('no_gitlab_link')

  const issue = glabJson<GitLabIssue>(`"projects/${GITLAB_PROJECT_ID}/issues/${item.gitlabIid}"`)
  const bizLabels = issue.labels.filter((l) => !STATUS_LABELS.includes(l))
  const isClaimed = !!issue.assignee

  if (isClaimed) {
    glab(`-X PUT "projects/${GITLAB_PROJECT_ID}/issues/${item.gitlabIid}" --field "assignee_id=0"`)
    return items.map((i) =>
      i.id === localId ? { ...i, assignee: undefined } : i
    )
  }

  const newLabels = [...bizLabels, '已认领'].join(',')
  glab(`-X PUT "projects/${GITLAB_PROJECT_ID}/issues/${item.gitlabIid}" --field "assignee_id=${GITLAB_USER_ID}" --field "labels=${newLabels}"`)
  return items.map((i) =>
    i.id === localId
      ? { ...i, assignee: 'webkubor', gitlabLabels: [...bizLabels, '已认领'] }
      : i
  )
}

function pushToGitlab(items: Requirement[], localId: string): Requirement[] {
  const item = items.find((i) => i.id === localId)
  if (!item) throw new Error('not_found')
  if (item.gitlabIid) throw new Error('already_linked')

  const created = glabJson<GitLabIssue>(
    `-X POST "projects/${GITLAB_PROJECT_ID}/issues" --field "title=[Console需求] ${item.title}" --field "labels=TASK,已认领" --field "assignee_id=${GITLAB_USER_ID}"`
  )

  return items.map((i) =>
    i.id === localId
      ? { ...i, gitlabIid: created.iid, gitlabLabels: created.labels, assignee: 'webkubor' }
      : i
  )
}

function finishIssue(items: Requirement[], localId: string): Requirement[] {
  const item = items.find((i) => i.id === localId)
  if (!item) throw new Error('not_found')

  if (item.gitlabIid) {
    const issue = glabJson<GitLabIssue>(`"projects/${GITLAB_PROJECT_ID}/issues/${item.gitlabIid}"`)
    const bizLabels = issue.labels.filter((l) => !STATUS_LABELS.includes(l))
    const newLabels = [...bizLabels, '已完成'].join(',')
    glab(`-X PUT "projects/${GITLAB_PROJECT_ID}/issues/${item.gitlabIid}" --field "labels=${newLabels}" --field "state_event=close"`)
  }

  return items.map((i) =>
    i.id === localId
      ? { ...i, status: 'done' as const, gitlabLabels: [...(i.gitlabLabels?.filter((l) => !STATUS_LABELS.includes(l)) ?? []), '已完成'] }
      : i
  )
}

function commentIssue(items: Requirement[], localId: string, content: string): Requirement {
  const item = items.find((i) => i.id === localId)
  if (!item?.gitlabIid) throw new Error('no_gitlab_link')

  const trimmed = content.trim()
  if (!trimmed) throw new Error('empty_comment')

  glab(`-X POST "projects/${GITLAB_PROJECT_ID}/issues/${item.gitlabIid}/notes" --field ${shellArg(`body=${trimmed}`)}`)
  return item
}

function assignIssue(items: Requirement[], localId: string, assigneeId: number): Requirement[] {
  const item = items.find((i) => i.id === localId)
  if (!item?.gitlabIid) throw new Error('no_gitlab_link')

  const users = listGitlabUsers()
  const assignee = users.find((user) => user.id === assigneeId)
  if (!assignee) throw new Error('assignee_not_found')

  const updatedIssue = glabJson<GitLabIssue>(
    `-X PUT "projects/${GITLAB_PROJECT_ID}/issues/${item.gitlabIid}" --field "assignee_id=${assignee.id}"`
  )

  return items.map((i) =>
    i.id === localId
      ? { ...i, assignee: updatedIssue.assignee?.username ?? assignee.username }
      : i
  )
}

export function devRequirementsPlugin(): Plugin {
  return {
    name: 'dev-requirements',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/dev/requirements', async (req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'GET') {
          if (req.url?.startsWith('/users')) {
            try {
              res.statusCode = 200
              res.end(JSON.stringify(listGitlabUsers()))
            } catch (e) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: (e as Error).message }))
            }
            return
          }

          res.statusCode = 200
          res.end(JSON.stringify(read()))
          return
        }

        if (req.method === 'POST') {
          let payload: Action
          try {
            payload = JSON.parse(await readBody(req)) as Action
          } catch {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'invalid json' }))
            return
          }

          const items = read()

          if (payload.action === 'sync') {
            try {
              const merged = syncFromGitlab(items)
              write(merged)
              res.statusCode = 200
              res.end(JSON.stringify(merged))
            } catch (e) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: (e as Error).message }))
            }
            return
          }

          if (payload.action === 'claim') {
            try {
              const updated = claimIssue(items, payload.id)
              write(updated)
              res.statusCode = 200
              res.end(JSON.stringify(updated.find((i) => i.id === payload.id)))
            } catch (e) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: (e as Error).message }))
            }
            return
          }

          if (payload.action === 'push') {
            try {
              const updated = pushToGitlab(items, payload.id)
              write(updated)
              res.statusCode = 200
              res.end(JSON.stringify(updated.find((i) => i.id === payload.id)))
            } catch (e) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: (e as Error).message }))
            }
            return
          }

          if (payload.action === 'finish') {
            try {
              const updated = finishIssue(items, payload.id)
              write(updated)
              res.statusCode = 200
              res.end(JSON.stringify(updated.find((i) => i.id === payload.id)))
            } catch (e) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: (e as Error).message }))
            }
            return
          }

          if (payload.action === 'comment') {
            try {
              const item = commentIssue(items, payload.id, payload.content)
              res.statusCode = 200
              res.end(JSON.stringify(item))
            } catch (e) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: (e as Error).message }))
            }
            return
          }

          if (payload.action === 'assign') {
            try {
              const updated = assignIssue(items, payload.id, payload.assigneeId)
              write(updated)
              res.statusCode = 200
              res.end(JSON.stringify(updated.find((i) => i.id === payload.id)))
            } catch (e) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: (e as Error).message }))
            }
            return
          }

          if (payload.action === 'add') {
            const item: Requirement = {
              id: `req-${Date.now()}`,
              title: payload.title.trim(),
              priority: payload.priority ?? 'medium',
              status: 'pending',
              createdAt: new Date().toISOString(),
              note: payload.note,
              gitlabIid: payload.gitlabIid,
            }
            write([...items, item])
            res.statusCode = 201
            res.end(JSON.stringify(item))
            return
          }

          if (payload.action === 'toggle') {
            const updated = items.map((item) =>
              item.id === payload.id
                ? { ...item, status: (item.status === 'done' ? 'pending' : 'done') as Requirement['status'] }
                : item
            )
            write(updated)
            res.statusCode = 200
            res.end(JSON.stringify(updated.find((i) => i.id === payload.id)))
            return
          }

          if (payload.action === 'delete') {
            write(items.filter((item) => item.id !== payload.id))
            res.statusCode = 200
            res.end(JSON.stringify({ ok: true }))
            return
          }

          if (payload.action === 'update') {
            const updated = items.map((item) =>
              item.id === payload.id
                ? { ...item, title: payload.title.trim(), gitlabIid: payload.gitlabIid ?? item.gitlabIid }
                : item
            )
            write(updated)
            res.statusCode = 200
            res.end(JSON.stringify(updated.find((i) => i.id === payload.id) ?? { ok: true }))
            return
          }

          if (payload.action === 'reorder') {
            const map = new Map(items.map((i) => [i.id, i]))
            const ordered = payload.ids.filter((id) => map.has(id)).map((id) => map.get(id)!)
            const rest = items.filter((i) => !payload.ids.includes(i.id))
            write([...ordered, ...rest])
            res.statusCode = 200
            res.end(JSON.stringify({ ok: true }))
            return
          }
        }

        res.statusCode = 405
        res.end(JSON.stringify({ error: 'method not allowed' }))
      })
    },
  }
}
