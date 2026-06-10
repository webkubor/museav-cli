interface HeaderRow {
  name: string
  source: string
  scope: string
  purpose: string
}

const HEADER_ROWS: HeaderRow[] = [
  { name: 'X-Tenant-Id', source: 'localStorage 当前活跃租户', scope: '所有请求', purpose: '多租户路由 / 鉴权' },
  { name: 'X-CSRF-Token', source: 'cookie modelgo_csrf', scope: '仅非 GET', purpose: '写操作防护，40302 自动刷新后重试' },
  { name: 'Accept-Language', source: 'zh-CN / en-US（按 html lang）', scope: '所有请求', purpose: '后端内容本地化' },
  { name: 'X-Origin', source: 'modelgo.com / modelgo.ai', scope: '所有请求', purpose: '双端品牌 / 区域识别' },
  { name: 'X-App-Version', source: 'package.json 版本号', scope: '所有请求', purpose: '前端版本上报' },
  { name: 'traceparent', source: 'W3C 链路追踪 ID', scope: '所有请求', purpose: 'OpenTelemetry 分布式追踪' },
  { name: 'credentials: include', source: 'session / CSRF cookie', scope: '所有请求', purpose: '跨子域携带凭证' },
]

export function HeadersPanel() {
  return (
    <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-mg-border bg-mg-bg-1/40">
        <div className="text-sm font-bold text-mg-text-0">自动注入请求头</div>
        <div className="text-[11px] text-mg-text-2 mt-0.5">request-headers.ts 在 beforeRequest 钩子统一注入，业务代码无需手动携带</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-mg-border bg-mg-bg-1/40">
              <th className="py-2.5 px-5 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">请求头</th>
              <th className="py-2.5 px-5 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">值来源</th>
              <th className="py-2.5 px-5 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">范围</th>
              <th className="py-2.5 px-5 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">作用</th>
            </tr>
          </thead>
          <tbody>
            {HEADER_ROWS.map((row) => (
              <tr key={row.name} className="border-b border-mg-border/40 hover:bg-mg-fill-0/20 transition-colors align-top">
                <td className="py-3 px-5 font-mono text-xs text-brand-base whitespace-nowrap">{row.name}</td>
                <td className="py-3 px-5 text-xs text-mg-text-1">{row.source}</td>
                <td className="py-3 px-5 text-xs text-mg-text-2 whitespace-nowrap">{row.scope}</td>
                <td className="py-3 px-5 text-xs text-mg-text-0 leading-relaxed">{row.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
