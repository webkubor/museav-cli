import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { navConfig, type NavVisibilityContext } from '@/config/nav'
import { useAuthStore } from '@/store/auth'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { Badge } from '@/components/ui/Badge'

/**
 * 开发者「权限」视图：把当前侧栏菜单的**角色可见性设计**摊开看。
 * - 角色列 = nav.ts 的角色门控结果（isOrgManager / isSpaceManager 等），确定性。
 * - 需要权限 = 该菜单声明的 permission（最终可见还需后端 granted 含此权限）。
 * - 底部 = 当前会话真实 granted（权威来源 /auth/session），对照设计看实况。
 * 注：角色×权限的**权威矩阵在后端**（modelgo-permissions，controller-web 运营编辑）；
 * 本页展示前端 nav.ts 的门控设计 + 当前登录角色的实际 granted，不代表其它角色的后端授权。
 */
const ROLES: Array<{ key: string; label: string; ctx: NavVisibilityContext }> = [
  { key: 'owner', label: '企业 Owner', ctx: { isNonPersonal: true, isDomestic: false, isDevTools: true, isOrgManager: true, isSpaceManager: true } },
  { key: 'admin', label: '企业 Admin', ctx: { isNonPersonal: true, isDomestic: false, isDevTools: true, isOrgManager: true, isSpaceManager: true } },
  { key: 'member', label: '企业 Member', ctx: { isNonPersonal: true, isDomestic: false, isDevTools: true, isOrgManager: false, isSpaceManager: false } },
  { key: 'personal', label: '个人租户', ctx: { isNonPersonal: false, isDomestic: false, isDevTools: true, isOrgManager: false, isSpaceManager: true } },
]

export function PermissionsPanel() {
  const { t } = useTranslation()
  const granted = useAuthStore((s) => s.permissions)
  const { role } = useTenantRole()

  // 每角色（按 nav.ts 门控）可见的 itemKey 集合
  const perRoleVisible = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    for (const r of ROLES) {
      const set = new Set<string>()
      for (const g of navConfig.groups(r.ctx, t, {})) for (const it of g.items) set.add(it.itemKey)
      map[r.key] = set
    }
    return map
  }, [t])

  // 全量菜单行（用 Owner 视角拿最全结构 + 分组）
  const rows = useMemo(() => {
    const out: Array<{ group: string; itemKey: string; text: string; permission?: string }> = []
    for (const g of navConfig.groups(ROLES[0].ctx, t, {})) {
      const groupLabel = g.label || '主入口'
      for (const it of g.items) out.push({ group: groupLabel, itemKey: it.itemKey, text: it.text, permission: it.permission })
    }
    return out
  }, [t])

  const grantedList = granted ?? []
  const grantedSet = new Set(grantedList)
  const cell = (visible: boolean) => (visible ? '✓' : '—')

  return (
    <div className="space-y-8 pt-2">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-mg-text-1">菜单 × 角色可见性设计</h2>
          <p className="mt-1 text-xs text-mg-text-3">
            角色列 = nav.ts 角色门控（✓=该角色结构上可见 · —=门控隐藏）；「需要权限」列声明的权限最终还需后端 granted 命中才真正显示。
            角色×权限权威矩阵在后端（controller-web 运营编辑）。
          </p>
        </div>
        <div className="overflow-x-auto rounded-md border border-mg-border">
          <table className="w-full text-xs">
            <thead className="bg-mg-fill-0/40 text-mg-text-3">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">分组</th>
                <th className="px-3 py-2 text-left font-semibold">菜单</th>
                <th className="px-3 py-2 text-left font-semibold">需要权限</th>
                {ROLES.map((r) => (
                  <th key={r.key} className="px-3 py-2 text-center font-semibold whitespace-nowrap">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.itemKey} className="border-t border-mg-border/60">
                  <td className="px-3 py-2 text-mg-text-3 whitespace-nowrap">{row.group}</td>
                  <td className="px-3 py-2 font-semibold text-mg-text-1 whitespace-nowrap">
                    {row.text}
                    <span className="ml-2 font-mono text-[10px] text-mg-text-3">{row.itemKey}</span>
                  </td>
                  <td className="px-3 py-2">
                    {row.permission
                      ? <code className="font-mono text-[11px] text-brand-base">{row.permission}</code>
                      : <span className="text-mg-text-4">无门控</span>}
                  </td>
                  {ROLES.map((r) => {
                    const visible = perRoleVisible[r.key]?.has(row.itemKey)
                    return (
                      <td key={r.key} className={`px-3 py-2 text-center font-bold ${visible ? 'text-mg-success' : 'text-mg-text-4'}`}>
                        {cell(!!visible)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-mg-text-1">当前会话 granted（权威 · /auth/session）</h2>
          <p className="mt-1 text-xs text-mg-text-3">
            当前登录角色：<code className="font-mono text-brand-base">{role ?? '（未知）'}</code>
            {granted === null
              ? ' · granted=null（fail-closed：零权限）'
              : ` · 共 ${grantedList.length} 项权限`}
          </p>
        </div>
        {grantedList.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {grantedList.map((p) => (
              <Badge key={p} variant="secondary" className="font-mono text-[11px]">{p}</Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-mg-text-3">当前无任何 granted 权限（{granted === null ? 'null' : '空数组'}）。</p>
        )}
        <p className="text-[11px] text-mg-text-4">
          对照上表：某菜单需要的权限若不在上面 granted 里，则当前角色实际看不到该菜单（即使角色门控 ✓）。
          带门控的菜单当前命中：
          {rows.filter((r) => r.permission && grantedSet.has(r.permission)).map((r) => r.text).join(' / ') || '（无）'}
        </p>
      </section>
    </div>
  )
}
