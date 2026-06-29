import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { appToast } from '@/lib/app-toast'
import { syncMenus } from '@/services/admin'
import { MENUS } from '@/config/menu-sync-data'
import type { Status } from './types'

const SCOPE_LABEL: Record<string, string> = {
  tenant: '组织级',
  workspace: '工作区级',
  settings: '设置级',
}

export function MenusSyncPanel() {
  const [syncStatus, setSyncStatus] = useState<Status>('idle')
  const [result, setResult] = useState<{ upserted: number; skipped: number } | null>(null)

  const handleSync = async () => {
    setSyncStatus('loading')
    setResult(null)
    try {
      const data = await syncMenus(MENUS)
      setResult(data)
      setSyncStatus('success')
      appToast.success(`同步成功 — upserted: ${data.upserted}, skipped: ${data.skipped}`)
    } catch (err) {
      setSyncStatus('error')
      appToast.error(`同步失败：${err instanceof Error ? err.message : '未知错误'}`)
    }
  }

  const groups = ['tenant', 'workspace', 'settings'] as const

  return (
    <div className="space-y-5 pt-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-mg-text-3">
            将下方菜单列表同步到后端（POST /admin/menus/sync）。共 {MENUS.length} 条。
          </p>
          {syncStatus === 'success' && result && (
            <p className="text-xs text-[var(--mg-success)] mt-1 font-semibold">
              ✓ 上次同步成功 — upserted: {result.upserted}, skipped: {result.skipped}
            </p>
          )}
        </div>
        <Button
          onClick={() => { void handleSync() }}
          disabled={syncStatus === 'loading'}
          size="sm"
        >
          {syncStatus === 'loading' ? '同步中…' : '立即同步'}
        </Button>
      </div>

      {groups.map((scope) => {
        const items = MENUS.filter((m) => m.scope === scope)
        return (
          <div key={scope} className="space-y-2">
            <div className="text-[11px] font-bold text-mg-text-3 tracking-widest uppercase">
              {SCOPE_LABEL[scope]}
            </div>
            <div className="space-y-1.5">
              {items.map((m) => (
                <div
                  key={m.key}
                  className="card-shadow-adaptive bg-card-bg rounded-md border border-mg-border px-4 py-2.5 space-y-2"
                >
                  <div className="flex items-center gap-4">
                    <code className="text-xs font-mono text-brand-base shrink-0 w-[180px] truncate">{m.key}</code>
                    <span className="text-xs text-mg-text-2 w-[100px] shrink-0">{m.name}</span>
                    <span className="text-xs text-mg-text-3 shrink-0">{m.name_en}</span>
                    {m.view_permission && (
                      <code className="ml-auto text-[10px] font-mono bg-blue-500/10 text-blue-500 border border-blue-500/20 px-1.5 py-0.5 rounded-sm shrink-0">
                        {m.view_permission}
                      </code>
                    )}
                  </div>
                  {m.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pl-[196px]">
                      {m.actions.map((a) => (
                        <code key={a} className="text-[10px] font-mono bg-amber-500/10 text-amber-600 border border-amber-500/20 px-1.5 py-0.5 rounded-sm">
                          {a}
                        </code>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
