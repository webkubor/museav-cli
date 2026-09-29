import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { navConfig, type NavVisibilityContext } from '@/config/nav'
import { CONSOLE_ROUTES } from '@/config/console-routes'
import { useAuthStore } from '@/store/auth'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { Badge } from '@/components/ui/Badge'

/**
 * 开发者「权限」视图：把当前侧栏菜单的**角色可见性设计**摊开看。
 * - 角色列 = 前端结构可见性；当前菜单不再按本地角色硬编码裁剪，实际访问统一看 granted。
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
        <ol className="list-decimal space-y-2 rounded-md border border-mg-border bg-mg-fill-0/30 p-4 pl-8 text-xs text-mg-text-2">
          <li><strong className="text-mg-text-1">运营在后台勾权限</strong>：在控制台后台 <code className="font-mono">controller-web「菜单权限管理」</code>，给每个角色（企业 Owner / Admin / Member、工作空间负责人 / 成员）勾「能看哪些菜单、能点哪些操作按钮」。保存后 ≤30 秒对该角色所有人生效。</li>
          <li><strong className="text-mg-text-1">后端把勾的结果算成一个权限码数组</strong>：用户登录、或切换 租户 / 工作空间 时，前端调 <code className="font-mono">/auth/session</code>，后端返回 <code className="font-mono">permissions.granted</code> —— 即「这个人，在他当前所在的 租户 + 工作空间 下，被勾中的所有权限码」。</li>
          <li><strong className="text-mg-text-1">前端照数组显示 / 隐藏</strong>：数组里有 <code className="font-mono">xxx:view</code> → 显示那个菜单、能进那页；有 <code className="font-mono">xxx:create</code> → 显示「新建」按钮；没有就藏起来 / 进页给 403。换租户或工作空间 → 重新调 session 拿新数组。</li>
        </ol>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-mg-text-1">后端 <code className="font-mono">/auth/session</code> 该返回长这样（重点是 permissions）：</p>
          <pre className="overflow-x-auto rounded-md border border-mg-border bg-mg-bg-1 p-3 font-mono text-xs leading-relaxed text-mg-text-2">{`{
  "account": { "account_id": "...", "display_name": "..." },
  "active_tenant_id": "01ks...",       // 当前所在企业/租户
  "active_workspace_id": "01ks...",    // 当前所在工作空间
  "permissions": {
    // ↓ 运营给「这个人 @ 当前租户+工作空间」勾中的权限码全集
    "granted": [
      "dashboard:view", "logs:view", "analytics:view",
      "api_keys:view", "api_keys:create",   // 有 create → 显示"新建"按钮
      "guardrails:view"
      // 没勾的（如 billing:view）就不在数组里 → 账单菜单隐藏 / 进页 403
    ],
    // ↓ 可选：按菜单给操作开关（前端按钮级也可读这个）
    "menus": [
      { "key": "api-keys", "actions": { "create": true, "revoke": false } }
    ]
  }
}`}</pre>
        </div>

        <div className="overflow-x-auto rounded-md border border-mg-border">
          <table className="w-full text-xs">
            <caption className="bg-mg-fill-0/40 px-3 py-2 text-left text-xs font-bold text-mg-text-1">一句话对齐（前端 ↔ 后端）</caption>
            <tbody>
              {[
                { k: '运营编辑什么', tone: 'text-mg-text-2', v: '在 controller-web「菜单权限管理」给角色勾「能看的菜单 + 能点的操作」，保存 ≤30s 生效。' },
                { k: '后端返什么', tone: 'text-brand-base', v: '/auth/session 里 permissions.granted = 该用户在当前租户+工作空间下被勾中的权限码数组（如 dashboard:view、api_keys:create）；切租户/工作空间后重拉要返回新数组。' },
                { k: '现在有没有', tone: 'text-mg-text-2', v: '有：session 已在返 granted + menus，运营矩阵在 controller-web 可编辑。要补的是「新增页面的新权限码先登记进矩阵」+「数据接口自身按角色裁剪」(#357/#359)。' }, // allow-raw-color: #357/#359 是关联工单号（GitLab issue 编号），不是色值
                { k: '不用做什么', tone: 'text-mg-text-3', v: '不用给每个页面单独做权限接口（session 一次给全）；不用前端存权限表（已删）；不用前端兜底数据过滤（后端说了算）。' },
                { k: '前端已做', tone: 'text-mg-success', v: '按 granted：没权限的菜单隐藏、直接敲 URL 也拦成 403；新建/删除等按钮按对应权限码显隐。' },
              ].map((row) => (
                <tr key={row.k} className="border-t border-mg-border/60 align-top">
                  <td className="px-3 py-2 font-semibold text-mg-text-1 whitespace-nowrap w-24">{row.k}</td>
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
                    <td className="px-3 py-2 font-mono text-xs text-mg-text-1 whitespace-nowrap">{r.key}</td>
                    <td className="px-3 py-2 font-mono text-xs text-mg-text-2 whitespace-nowrap">{fullPath}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Badge variant={r.scope === 'workspace' ? 'info' : 'secondary'} className="text-xs">{r.scope}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {r.permission
                        ? <code className="font-mono text-xs text-brand-base">{r.permission}</code>
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
          <h2 className="text-base font-bold text-mg-text-1">开发脉络：新增一个页面 / 一个按钮怎么做</h2>
          <p className="mt-1 text-xs text-mg-text-3">
            全靠一个「英文 key（权限码）」把三端串起来 —— 它是 <strong className="text-mg-text-2">前端代码 ↔ 运营后台 ↔ 后端矩阵</strong> 共用的同一个暗号。
            key 一致，权限就通；key 对不上，就是漂移。
          </p>
        </div>

        <div className="rounded-md border border-mg-border bg-mg-fill-0/30 p-4 text-xs text-mg-text-2">
          <p className="mb-2 font-semibold text-mg-text-1">A. 新增一个「页面」（控制能不能进 / 看见菜单）</p>
          <ol className="list-decimal space-y-1 pl-6">
            <li>写页面组件（如 <code className="font-mono">pages/xxx/index.tsx</code>）。</li>
            <li><code className="font-mono">config/permissions.ts</code> 加权限码：<code className="font-mono text-brand-base">XXX_VIEW: 'xxx:view'</code>。</li>
            <li><code className="font-mono">config/console-routes.ts</code> 加一条 <code className="font-mono">{'{ key, path, scope, permission: PERMS.XXX_VIEW }'}</code>（← 单一真源，路由/守卫/菜单都读它）。</li>
            <li><code className="font-mono">App.tsx</code> 的 <code className="font-mono">CONSOLE_ELEMENTS</code> 加 <code className="font-mono">key → 页面元素</code>。</li>
            <li><code className="font-mono">config/nav.ts</code> 对应分组加菜单项 <code className="font-mono">{'{ itemKey: key, text, icon }'}</code>（权限走 <code className="font-mono">routePermission(key)</code>，不重复写）。</li>
            <li><strong className="text-mg-text-1">运营</strong>在 controller-web「菜单权限管理」给要开放的角色勾这个 <code className="font-mono">xxx:view</code>。</li>
            <li>用户下次 <code className="font-mono">/auth/session</code> 的 granted 里就有 <code className="font-mono">xxx:view</code> → 菜单出现、能进页；没勾的角色菜单隐藏、敲 URL 也 403。<strong className="text-mg-text-1">前端不用再改。</strong></li>
          </ol>
          <p className="mb-2 mt-4 font-semibold text-mg-text-1">B. 新增一个「操作按钮」（控制进页后能不能点）</p>
          <ol className="list-decimal space-y-1 pl-6">
            <li><code className="font-mono">config/permissions.ts</code> 加操作码：<code className="font-mono text-brand-base">XXX_CREATE: 'xxx:create'</code>。</li>
            <li>页面里用 <code className="font-mono">{'const { hasPermission } = usePermissions()'}</code>，按钮包一层：<code className="font-mono">{'hasPermission(PERMS.XXX_CREATE) && <Button/>'}</code>。</li>
            <li><strong className="text-mg-text-1">运营</strong>给角色勾 <code className="font-mono">xxx:create</code> → session granted 含它 → 按钮显示；否则隐藏。<strong className="text-mg-text-1">不走路由层。</strong></li>
          </ol>
          <p className="mt-3 text-xs text-mg-text-3">
            一句话脉络：<strong className="text-mg-text-2">前端登记 key（permissions.ts）→ 挂到页面/按钮 → 运营勾这个 key → 后端 session 吐 granted → 前端照 key 显隐</strong>。
            维护成本就集中在「这套英文 key 要前端登记 + 运营认识 + 后端矩阵有」——三处对齐同一个 key 即可。
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-mg-text-1">菜单 × 角色可见性设计</h2>
          <p className="mt-1 text-xs text-mg-text-3">
            角色列只表示前端结构上存在该菜单；「需要权限」列声明的 Permission ID 必须命中后端 granted 才真正显示。
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
                    <span className="ml-2 font-mono text-xs text-mg-text-3">{row.itemKey}</span>
                  </td>
                  <td className="px-3 py-2">
                    {row.permission
                      ? <code className="font-mono text-xs text-brand-base">{row.permission}</code>
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
              <Badge key={p} variant="secondary" className="font-mono text-xs">{p}</Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-mg-text-3">当前无任何 granted 权限（{granted === null ? 'null' : '空数组'}）。</p>
        )}
        <p className="text-xs text-mg-text-3">
          对照上表：某菜单需要的权限若不在上面 granted 里，则当前角色实际看不到该菜单（即使角色门控 ✓）。
          带门控的菜单当前命中：
          {rows.filter((r) => r.permission && grantedSet.has(r.permission)).map((r) => r.text).join(' / ') || '（无）'}
        </p>
      </section>
    </div>
  )
}
