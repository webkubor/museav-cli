import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { navConfig, type NavVisibilityContext } from '@/config/nav'
import { CONSOLE_ROUTES } from '@/config/console-routes'
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
          <h2 className="text-base font-bold text-mg-text-1">路由权限设计方案</h2>
          <p className="mt-1 text-xs text-mg-text-3">
            单一真源 <code className="font-mono text-brand-base">config/console-routes.ts</code>：菜单、路由、权限守卫三者同源，永不漂移。
          </p>
        </div>
        <ul className="space-y-1.5 rounded-md border border-mg-border bg-mg-fill-0/30 p-4 text-xs text-mg-text-2">
          <li><strong className="text-mg-text-1">权威来源</strong>：后端 <code className="font-mono">/auth/session</code> 的 <code className="font-mono">permissions.granted</code>（按 租户×工作区 解析，≤30s 生效）；前端无本地权限矩阵。</li>
          <li><strong className="text-mg-text-1">三层门禁</strong>：① RequireAuth（登录）→ ② RequirePermission（路由级 view 权限，堵「敲 URL 绕过菜单」）→ ③ 后端 API（数据权威闸，前端隐藏≠安全）。</li>
          <li><strong className="text-mg-text-1">fail-closed（避误伤）</strong>：granted 缺权限→403；<code className="font-mono">granted===null</code>（加载/切组织过渡窗）→放行不重定向，否则会把合法用户踢走。</li>
          <li><strong className="text-mg-text-1">粒度分层</strong>：<code className="font-mono">*_VIEW</code> 管「能否进页」（路由守卫）；<code className="font-mono">*_CREATE/EDIT/…</code> 管「进页后能否操作」（页面内 hasPermission，不在路由层）。</li>
          <li><strong className="text-mg-text-1">scope</strong>：tenant 挂 <code className="font-mono">/xxx</code>；workspace 挂 <code className="font-mono">/workspace/:workspaceId/xxx</code>（随工作区选择器变化）。</li>
        </ul>

        <div className="overflow-x-auto rounded-md border border-mg-border">
          <table className="w-full text-xs">
            <caption className="px-3 py-2 text-left text-[11px] font-bold text-mg-text-1 bg-mg-fill-0/40">
              API 契约（权限系统 · 前端 ↔ 后端）
            </caption>
            <tbody>
              {[
                { k: '现在有什么', tone: 'text-mg-text-2', v: '/auth/session 已下发 permissions.granted（string[]）+ permissions.menus；角色×权限权威矩阵在 modelgo-permissions（controller-web 运营可编辑）。' },
                { k: '应该是什么', tone: 'text-mg-success', v: 'granted 按「当前激活 租户 × 工作区」解析，含该上下文全部 *_VIEW 与操作级权限；写入 ≤30s 生效；deny 优先、fail-closed。' },
                { k: 'API 需要提供什么', tone: 'text-brand-base', v: '① 切换 租户/工作区 后 session 重拉能返回对应上下文的 granted；② 新增页面的 *_VIEW 权限须先在矩阵登记并下发；③ 数据接口自身按角色裁剪（如 #357 usage/logs 按空间负责人、#359 api-keys 按角色）。' },
                { k: '不需要什么', tone: 'text-mg-text-3', v: '不需要前端本地权限回退矩阵（#344 已下线）；不需要「每个页面一个权限查询接口」（session 一次性给全）；不需要前端做数据级过滤兜底（后端权威闸）。' },
                { k: '前端做了什么', tone: 'text-mg-text-2', v: 'RequireAuth + RequirePermission 路由守卫、菜单按 granted 过滤、路由/菜单/权限收敛到 console-routes 单一真源；操作级按钮用 hasPermission 就地控制。' },
              ].map((row) => (
                <tr key={row.k} className="border-t border-mg-border/60 align-top">
                  <td className="px-3 py-2 font-semibold text-mg-text-1 whitespace-nowrap w-28">{row.k}</td>
                  <td className={`px-3 py-2 ${row.tone}`}>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto rounded-md border border-mg-border">
          <table className="w-full text-xs">
            <thead className="bg-mg-fill-0/40 text-mg-text-3">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">页面 key</th>
                <th className="px-3 py-2 text-left font-semibold">完整路由</th>
                <th className="px-3 py-2 text-left font-semibold">层级</th>
                <th className="px-3 py-2 text-left font-semibold">所需权限（view）</th>
                <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">当前可进</th>
              </tr>
            </thead>
            <tbody>
              {CONSOLE_ROUTES.map((r) => {
                const fullPath = r.scope === 'workspace' ? `/workspace/:workspaceId/${r.path}` : `/${r.path}`
                const accessible = r.permission ? grantedSet.has(r.permission) : true
                return (
                  <tr key={r.key} className="border-t border-mg-border/60">
                    <td className="px-3 py-2 font-mono text-[11px] text-mg-text-1 whitespace-nowrap">{r.key}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-mg-text-2 whitespace-nowrap">{fullPath}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Badge variant={r.scope === 'workspace' ? 'info' : 'secondary'} className="text-[10px]">{r.scope}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {r.permission
                        ? <code className="font-mono text-[11px] text-brand-base">{r.permission}</code>
                        : <span className="text-mg-text-4">仅需登录</span>}
                    </td>
                    <td className={`px-3 py-2 text-center font-bold ${accessible ? 'text-mg-success' : 'text-mg-text-4'}`}>
                      {accessible ? '✓' : '✕ 403'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

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
