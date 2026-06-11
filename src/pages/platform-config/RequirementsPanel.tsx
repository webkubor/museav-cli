import { useEffect, useMemo, useState } from 'react'
import { LuExternalLink, LuRefreshCw } from 'react-icons/lu'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { appToast } from '@/lib/app-toast'
import { cn } from '@/lib/utils'

type RequirementStatus = 'pending' | 'done'
type RequirementPriority = 'high' | 'medium' | 'low'

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

const STATUS_LABELS = ['已认领', '进行中', '待验证', '已完成']

function statusText(item: Requirement): string {
  const statusLabel = item.gitlabLabels?.find((label) => STATUS_LABELS.includes(label))
  if (statusLabel) return statusLabel
  return item.status === 'done' ? '已完成' : '待处理'
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

async function syncRequirements(): Promise<void> {
  const response = await fetch('/dev/requirements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'sync' }),
  })
  if (!response.ok) throw new Error(`POST /dev/requirements sync ${response.status}`)
}

export function RequirementsPanel() {
  const [items, setItems] = useState<Requirement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setIsLoading(true)
    setError(null)
    try {
      setItems(await requestRequirements())
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
    requestRequirements()
      .then((nextItems) => {
        if (!cancelled) setItems(nextItems)
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

  const pendingCount = myBugs.filter((item) => item.status !== 'done').length
  const doneCount = myBugs.length - pendingCount

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-mg-border bg-card-bg px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-mg-text-0">我的问题</h2>
            <Badge variant="danger" size="sm">BUG {myBugs.length}</Badge>
          </div>
          <p className="mt-1 text-xs text-mg-text-2">
            来源于 .requirements.json，显示 GitLab QA 看板中指派给 webkubor 的缺陷。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="warning" size="sm">待处理 {pendingCount}</Badge>
          <Badge variant="success" size="sm">已完成 {doneCount}</Badge>
          <Button size="sm" variant="outline" onClick={sync} loading={isSyncing} icon={<LuRefreshCw className="h-3.5 w-3.5" />}>
            同步 GitLab
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-mg-danger/20 bg-mg-danger/10 px-4 py-3 text-sm font-medium text-mg-danger">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-xl border border-mg-border bg-card-bg px-4 py-8 text-center text-sm text-mg-text-2">
          正在读取本地问题列表...
        </div>
      ) : myBugs.length === 0 ? (
        <div className="rounded-xl border border-mg-border bg-card-bg px-4 py-8 text-center text-sm text-mg-text-2">
          暂无指派给你的 BUG。点击同步 GitLab 后再查看。
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-mg-border bg-card-bg">
          <div className="grid grid-cols-[84px_1fr_92px_86px_72px] gap-3 border-b border-mg-border bg-mg-fill-0 px-4 py-2.5 text-[11px] font-bold text-mg-text-2">
            <span>Issue</span>
            <span>标题</span>
            <span>状态</span>
            <span>优先级</span>
            <span className="text-right">操作</span>
          </div>
          <div className="divide-y divide-mg-border">
            {myBugs.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'grid grid-cols-[84px_1fr_92px_86px_72px] items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-mg-fill-0/70',
                  item.status === 'done' && 'opacity-70'
                )}
              >
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
                <div className="flex justify-end">
                  {item.gitlabIid && (
                    <a
                      href={gitlabIssueUrl(item.gitlabIid)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-mg-text-2 transition-colors hover:bg-mg-fill-1 hover:text-mg-text-0"
                      aria-label={`打开 GitLab issue #${item.gitlabIid}`}
                    >
                      <LuExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
