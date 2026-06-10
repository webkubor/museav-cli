interface UrlParamRow {
  param: string
  module: string
  usage: string
  why: string
}

const URL_PARAM_ROWS: UrlParamRow[] = [
  {
    param: '?redirect=<path>',
    module: '登录回跳（认证守卫 + 登录/注册/OAuth/设备）',
    usage: 'toLoginWithRedirect() 写、getRedirectTarget() 读（默认 /dashboard）；登录/注册/auth-callback 成功后跳到它',
    why: '未登录访问受保护页被拦到 /login，登录后回到原本要去的页，而非固定首页',
  },
  {
    param: '?email=<email>',
    module: '两步登录 → 注册 / 忘记密码',
    usage: 'email/check 返回未注册 → /signup?email=；也用于 /forgot-password?email=，目标页预填邮箱',
    why: '用户已输入邮箱，跳转后不用重输，降低流失',
  },
  {
    param: '?invitation=<token>',
    module: '组织邀请 → 注册',
    usage: '被邀请页"免费注册"链接带 token；注册时作为 register 请求体 invitation_token',
    why: '新用户经邀请注册时，注册即加入邀请所属组织，免去注册后再单独接受',
  },
  {
    param: '?aff=<邀请码>',
    module: '推荐计划（专属邀请链接）',
    usage: '推荐计划「我的专属邀请链接」signup?aff=<邀请码>；注册时作为 register 请求体 referral_code',
    why: '被邀请人经此链接注册后，其后续消费的返佣自动归属邀请人（消费分润）',
  },
  {
    param: '/invitations/:token',
    module: '组织邀请接受页',
    usage: 'path 参数，previewInvitation / acceptInvitation 使用；兼容旧 ?token= query',
    why: '标识具体邀请（组织级）。工作区成员是从组织内现有成员直接添加，不经此链接',
  },
  {
    param: '?user_code=<code>',
    module: 'CLI 设备码登录 /device',
    usage: 'CLI 打开 /device?user_code= 展示码；未登录经 toLoginWithRedirect 回带；登录后 deviceApprove(user_code, tenant_id)',
    why: 'OAuth 设备授权流：用户在浏览器确认 CLI 登录并绑定到某租户',
  },
  {
    param: 'OAuth redirect',
    module: '第三方登录（Google / GitHub / 微信）',
    usage: 'oauthAuthorizeUrl(provider, `${origin}/auth/callback?redirect=<目标>`)；回跳 /auth/callback 拉 session 再落地',
    why: 'OAuth 回调在 API 域处理，必须带完整控制台域 URL 才能跳回；走专用回调页保证 session 落地时序',
  },
]

export function UrlParamsPanel() {
  return (
    <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-mg-border bg-mg-bg-1/40">
        <div className="text-sm font-bold text-mg-text-0">认证 / OAuth URL 透传参数</div>
        <div className="text-[11px] text-mg-text-2 mt-0.5">注册 / 登录 / 邀请 / 设备授权各入口需要兼容携带的 URL 参数（均基于代码核实）</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-mg-border bg-mg-bg-1/40">
              <th className="py-2.5 px-5 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">参数</th>
              <th className="py-2.5 px-5 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">业务 · 模块</th>
              <th className="py-2.5 px-5 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">怎么用</th>
              <th className="py-2.5 px-5 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">为什么</th>
            </tr>
          </thead>
          <tbody>
            {URL_PARAM_ROWS.map((row) => (
              <tr key={row.param} className="border-b border-mg-border/40 hover:bg-mg-fill-0/20 transition-colors align-top">
                <td className="py-3 px-5 font-mono text-xs text-brand-base whitespace-nowrap">{row.param}</td>
                <td className="py-3 px-5 text-xs text-mg-text-1 min-w-[160px]">{row.module}</td>
                <td className="py-3 px-5 text-xs text-mg-text-0 leading-relaxed min-w-[260px]">{row.usage}</td>
                <td className="py-3 px-5 text-xs text-mg-text-2 leading-relaxed min-w-[240px]">{row.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
