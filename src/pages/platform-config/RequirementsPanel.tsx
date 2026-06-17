import { useEffect, useMemo, useState } from 'react'
import {
  LuCheck,
  LuExternalLink,
  LuMessageSquare,
  LuRefreshCw,
  LuSendHorizontal,
  LuUserRoundCheck,
} from 'react-icons/lu'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { appToast } from '@/lib/app-toast'
import { cn } from '@/lib/utils'

type RequirementStatus = 'pending' | 'done'
type RequirementPriority = 'high' | 'medium' | 'low'
type RequirementFilter = 'pending' | 'all' | 'done'

interface Requirement {
  id: string
  title: string
  priority: RequirementPriority
  status: RequirementStatus
  createdAt: string
  note?: string
  gitlabIid?: number
  gitlabLabels?: string[]
  assignee?: string
}

interface GitLabUser {
  id: number
  username: string
  name: string
}

const STATUS_LABELS = ['已认领', '进行中', '待验证', '已完成']

function statusText(item: Requirement): string {
  const statusLabel = item.gitlabLabels?.find((label) => STATUS_LABELS.includes(label))
  if (statusLabel) return statusLabel
  return item.status === 'done' ? '已完成' : '待处理'
}

function isRequirementDone(item: Requirement): boolean {
  return item.status === 'done' || statusText(item) === '已完成'
}

function statusVariant(item: Requirement): 'success' | 'warning' | 'secondary' | 'info' {
  const text = statusText(item)
  if (text === '已完成') return 'success'
  if (text === '待验证') return 'warning'
  if (text === '进行中') return 'info'
  return 'secondary'
}

function priorityText(priority: RequirementPriority): string {
  if (priority === 'high') return '高'
  if (priority === 'low') return '低'
  return '中'
}

function gitlabIssueUrl(iid: number): string {
  return `https://gitlab.ops.modelgo.com/qa/ai-quality-platform/-/issues/${iid}`
}

async function requestRequirements(): Promise<Requirement[]> {
  const response = await fetch('/dev/requirements')
  if (!response.ok) throw new Error(`GET /dev/requirements ${response.status}`)
  return response.json() as Promise<Requirement[]>
}

async function requestUsers(): Promise<GitLabUser[]> {
  const response = await fetch('/dev/requirements/users')
  if (!response.ok) throw new Error(`GET /dev/requirements/users ${response.status}`)
  return response.json() as Promise<GitLabUser[]>
}

async function syncRequirements(): Promise<void> {
  const response = await fetch('/dev/requirements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'sync' }),
  })
  if (!response.ok) throw new Error(`POST /dev/requirements sync ${response.status}`)
}

async function postRequirementAction(action: Record<string, unknown>): Promise<Requirement> {
  const response = await fetch('/dev/requirements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(payload?.error || `POST /dev/requirements ${response.status}`)
  }
  return response.json() as Promise<Requirement>
}

export function RequirementsPanel() {
  const [items, setItems] = useState<Requirement[]>([])
  const [users, setUsers] = useState<GitLabUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, string>>({})
  const [assigneeIds, setAssigneeIds] = useState<Record<string, string>>({})
  const [issueFilter, setIssueFilter] = useState<RequirementFilter>('pending')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [nextItems, nextUsers] = await Promise.all([requestRequirements(), requestUsers()])
      setItems(nextItems)
      setUsers(nextUsers)
    } catch (err) {
      const message = err instanceof Error ? err.message : '读取失败'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const sync = async () => {
    setIsSyncing(true)
    setError(null)
    try {
      await syncRequirements()
      await load()
      appToast.success('已同步 GitLab 问题')
    } catch (err) {
      const message = err instanceof Error ? err.message : '同步失败'
      setError(message)
      appToast.error(message)
    } finally {
      setIsSyncing(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([requestRequirements(), requestUsers()])
      .then(([nextItems, nextUsers]) => {
        if (!cancelled) {
          setItems(nextItems)
          setUsers(nextUsers)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : '读取失败'
          setError(message)
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const myBugs = useMemo(() => {
    return items
      .filter((item) => item.assignee === 'webkubor')
      .filter((item) => item.gitlabLabels?.includes('BUG'))
      .sort((a, b) => Number(b.gitlabIid ?? 0) - Number(a.gitlabIid ?? 0))
  }, [items])

  const pendingCount = myBugs.filter((item) => !isRequirementDone(item)).length
  const doneCount = myBugs.length - pendingCount
  const visibleBugs = useMemo(() => {
    if (issueFilter === 'all') return myBugs
    if (issueFilter === 'done') return myBugs.filter(isRequirementDone)
    return myBugs.filter((item) => !isRequirementDone(item))
  }, [issueFilter, myBugs])

  const updateLocalItem = (updated: Requirement) => {
    setItems((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item))
  }

  const finish = async (item: Requirement) => {
    setActiveAction(`finish:${item.id}`)
    setError(null)
    try {
      updateLocalItem(await postRequirementAction({ action: 'finish', id: item.id }))
      appToast.success(`#${item.gitlabIid} 已标记完成`)
    } catch (err) {
      const message = err instanceof Error ? err.message : '操作失败'
      setError(message)
      appToast.error(message)
    } finally {
      setActiveAction(null)
    }
  }

  const comment = async (item: Requirement) => {
    const content = comments[item.id]?.trim()
    if (!content) {
      appToast.error('先输入评论内容')
      return
    }

    setActiveAction(`comment:${item.id}`)
    setError(null)
    try {
      await postRequirementAction({ action: 'comment', id: item.id, content })
      setComments((current) => ({ ...current, [item.id]: '' }))
      appToast.success(`#${item.gitlabIid} 评论已发送`)
    } catch (err) {
      const message = err instanceof Error ? err.message : '评论失败'
      setError(message)
      appToast.error(message)
    } finally {
      setActiveAction(null)
    }
  }

  const assign = async (item: Requirement) => {
    const assigneeId = Number(assigneeIds[item.id])
    if (!Number.isFinite(assigneeId) || assigneeId <= 0) {
      appToast.error('先选择指派人')
      return
    }

    setActiveAction(`assign:${item.id}`)
    setError(null)
    try {
      updateLocalItem(await postRequirementAction({ action: 'assign', id: item.id, assigneeId }))
      const user = users.find((candidate) => candidate.id === assigneeId)
      appToast.success(`#${item.gitlabIid} 已指派给 ${user?.username ?? assigneeId}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : '指派失败'
      setError(message)
      appToast.error(message)
    } finally {
      setActiveAction(null)
    }
  }

  const filterOptions: Array<{ value: RequirementFilter; label: string; count: number }> = [
    { value: 'pending', label: '待处理', count: pendingCount },
    { value: 'all', label: '全部', count: myBugs.length },
    { value: 'done', label: '已完成', count: doneCount },
  ]

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-mg-border bg-card-bg px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-mg-text-0">我的问题</h2>
            <Badge variant="danger" size="sm">BUG {myBugs.length}</Badge>
          </div>
          <p className="mt-1 text-xs text-mg-text-2">
            来源于 .requirements.json，支持完成、评论和重新指派 GitLab QA 缺陷。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-mg-border bg-mg-fill-0 p-0.5">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setIssueFilter(option.value)}
                className={cn(
                  'h-7 rounded-md px-2.5 text-xs font-bold text-mg-text-2 transition-colors hover:text-mg-text-0',
                  issueFilter === option.value && 'bg-card-bg text-brand-base shadow-sm'
                )}
              >
                {option.label} {option.count}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={sync} loading={isSyncing} icon={<LuRefreshCw className="h-3.5 w-3.5" />}>
            同步 GitLab
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-mg-danger/20 bg-mg-danger/10 px-4 py-3 text-sm font-medium text-mg-danger">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-md border border-mg-border bg-card-bg px-4 py-8 text-center text-sm text-mg-text-2">
          正在读取本地问题列表...
        </div>
      ) : myBugs.length === 0 ? (
        <div className="rounded-md border border-mg-border bg-card-bg px-4 py-8 text-center text-sm text-mg-text-2">
          暂无指派给你的 BUG。点击同步 GitLab 后再查看。
        </div>
      ) : visibleBugs.length === 0 ? (
        <div className="rounded-md border border-mg-border bg-card-bg px-4 py-8 text-center text-sm text-mg-text-2">
          当前筛选下没有问题。
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-mg-border bg-card-bg">
          <div className="grid grid-cols-[84px_1fr_92px_86px] gap-3 border-b border-mg-border bg-mg-fill-0 px-4 py-2.5 text-[11px] font-bold text-mg-text-2">
            <span>Issue</span>
            <span>标题</span>
            <span>状态</span>
            <span>优先级</span>
          </div>
          <div className="divide-y divide-mg-border">
            {visibleBugs.map((item) => {
              const currentAssignee = users.find((user) => user.username === item.assignee)
              const selectedAssignee = assigneeIds[item.id] ?? (currentAssignee ? String(currentAssignee.id) : '')

              return (
                <div
                  key={item.id}
                  className={cn('px-4 py-3 text-sm transition-colors hover:bg-mg-fill-0/70', isRequirementDone(item) && 'opacity-70')}
                >
                  <div className="grid grid-cols-[84px_1fr_92px_86px] items-center gap-3">
                    <a
                      href={item.gitlabIid ? gitlabIssueUrl(item.gitlabIid) : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs font-bold text-brand-base hover:text-brand-deep"
                    >
                      #{item.gitlabIid ?? item.id}
                    </a>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-mg-text-0">{item.title}</p>
                      <p className="mt-1 truncate text-xs text-mg-text-2">
                        {item.gitlabLabels?.join(' / ') || '本地问题'}
                      </p>
                    </div>
                    <Badge variant={statusVariant(item)} size="sm">{statusText(item)}</Badge>
                    <Badge variant={item.priority === 'high' ? 'danger' : 'secondary'} size="sm">
                      {priorityText(item.priority)}
                    </Badge>
                  </div>

                  <div className="mt-3 grid gap-2 rounded-lg border border-mg-border bg-mg-fill-0 p-2 md:grid-cols-[auto_1fr_auto_auto_auto] md:items-center">
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={isRequirementDone(item)}
                      loading={activeAction === `finish:${item.id}`}
                      icon={<LuCheck className="h-3.5 w-3.5" />}
                      onClick={() => finish(item)}
                    >
                      已完成
                    </Button>

                    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-mg-border bg-card-bg px-2 py-1.5">
                      <LuMessageSquare className="h-3.5 w-3.5 shrink-0 text-mg-text-2" />
                      <input
                        value={comments[item.id] ?? ''}
                        onChange={(event) => setComments((current) => ({ ...current, [item.id]: event.target.value }))}
                        placeholder="写一条 GitLab 评论"
                        className="min-w-0 flex-1 bg-transparent text-xs text-mg-text-0 outline-none placeholder:text-mg-text-2"
                      />
                    </div>
                    <Button
                      size="xs"
                      variant="outline"
                      loading={activeAction === `comment:${item.id}`}
                      icon={<LuSendHorizontal className="h-3.5 w-3.5" />}
                      onClick={() => comment(item)}
                    >
                      评论
                    </Button>

                    <select
                      value={selectedAssignee}
                      onChange={(event) => setAssigneeIds((current) => ({ ...current, [item.id]: event.target.value }))}
                      className="h-7 rounded-md border border-mg-border bg-card-bg px-2 text-xs font-semibold text-mg-text-1 outline-none transition-colors focus:border-brand-base focus:ring-2 focus:ring-brand-glow"
                      aria-label={`指派 issue #${item.gitlabIid}`}
                    >
                      <option value="">选择指派人</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>{user.username}</option>
                      ))}
                    </select>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="xs"
                        variant="outline"
                        loading={activeAction === `assign:${item.id}`}
                        icon={<LuUserRoundCheck className="h-3.5 w-3.5" />}
                        onClick={() => assign(item)}
                      >
                        指派
                      </Button>
                      {item.gitlabIid && (
                        <a
                          href={gitlabIssueUrl(item.gitlabIid)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-mg-text-2 transition-colors hover:bg-mg-fill-1 hover:text-mg-text-0"
                          aria-label={`打开 GitLab issue #${item.gitlabIid}`}
                        >
                          <LuExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
