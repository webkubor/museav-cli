/**
 * TenantClient —— 调「租户自己后台」的只读产品/素材接口，注意不是 Studio 中台。
 *
 * 背景（2026-08-10 架构决策）：租户自己的"产品""素材/资产"数据物理上存在各租户自己
 * 的数据库里（好易美是 hym-admin 的 Supabase，mzmeso 是 manager 的 Supabase），
 * Studio 中台不代理这部分数据——跨库统一存取需要 Studio 保管每个租户数据库的连接
 * 信息，风险和复杂度远超"选产品参考图 + 模板 组合出图"这一个使用场景本身的收益，
 * 这次没有做。维持现状：数据在哪个租户后台，只读接口就长在那个后台上，
 * studio-cli 直接调租户自己的域名，不经过 Studio。
 *
 * 鉴权复用同一把 apiKey：租户后台反过来调用 Studio（出图/查模板）时，本来就要在自己
 * 环境变量里存这把 sk-studio-xxx（业务中台服务 key），所以它可以原样再拿来当"调用自己只读接口"
 * 的凭证用，不用为这一件事再签发一套新 key。这把 key 已经能触发出图消费（更高价值的
 * 操作），只读产品/素材不构成新的越权面。
 *
 * 已知局限：只支持"租户 apiKey"身份，不支持个人登录（login token）—— 产品/素材
 * 是组织级数据，跟个人账号无关。
 *
 * 后台域名怎么定（2026-08-14 统一形态后）：key 不再携带租户名段（统一 sk-studio-<24hex>），
 * 新格式 key 无法从 key 解析租户名 → 必须显式配置 --tenantBaseUrl；旧格式 key
 * （sk-studio-<租户名>-<24hex>）仍能解析租户名，走内置 KNOWN_TENANT_BACKENDS 映射。
 */

/** 已知租户名 → 该租户自己后台的域名。仅 hym / mzmeso 两个已接入的租户，其他租户
 *  需要用 `studio-cli config --tenantBaseUrl <后台域名>` 显式配置。
 *  这份映射维护在 CLI 本地是权宜之计——见任务报告里的"开放问题"：
 *  长期是否应该让 Studio 的 api_tenants 表补一个 portal_base_url 字段，
 *  由服务端下发而不是 CLI 硬编码，需要人确认后再决定。 */
const KNOWN_TENANT_BACKENDS: Record<string, string> = {
  hym: 'https://manager.hympro.cn',
  mzmeso: 'https://mzmeso.webkubor.online',
}

/** 从旧格式 key（sk-studio-<租户名>-<24位十六进制>）里解析出租户名；新统一形态 sk-studio-<24hex> 解析不出（返回 null，需显式 tenantBaseUrl） */
function parseTenantName(apiKey: string): string | null {
  const m = apiKey.match(/^sk-studio-(.+)-[0-9a-f]{24}$/i)
  return m ? m[1] : null
}

export class TenantClient {
  private baseUrl: string
  private apiKey: string

  constructor(opts: { apiKey: string; tenantBaseUrl?: string }) {
    if (!opts.apiKey.startsWith('sk-studio-')) {
      throw new Error(
        'products / assets 需要配置「租户 API Key」（业务中台服务 key，sk-studio-<24位>）。\n' +
        '个人登录（login）是个人 token，查不了组织级的产品/素材数据。',
      )
    }
    this.apiKey = opts.apiKey
    const tenant = parseTenantName(opts.apiKey)
    const known = tenant ? KNOWN_TENANT_BACKENDS[tenant] : undefined
    const resolved = opts.tenantBaseUrl || known
    if (!resolved) {
      throw new Error(
        `无法确定「${tenant || '该'}」租户自己后台的域名。\n` +
        `（统一形态 key sk-studio-<24位> 不再携带租户名，需显式配置后台域名）\n` +
        `请先用 studio-cli config --tenantBaseUrl <你的租户后台域名> 显式配置一次\n` +
        `（目前内置已知租户：${Object.keys(KNOWN_TENANT_BACKENDS).join(', ')}）。`,
      )
    }
    this.baseUrl = resolved.replace(/\/+$/, '')
  }

  async get<T = unknown>(path: string): Promise<T> {
    const resp = await fetch(`${this.baseUrl}/api/${path}`, {
      headers: { 'X-API-Key': this.apiKey, 'X-Studio-Client': 'studio-cli-tenant' },
    })
    const text = await resp.text()
    let body: any
    try { body = JSON.parse(text) } catch { body = { raw: text } }
    if (!resp.ok) {
      const msg = body?.error || body?.raw || `HTTP ${resp.status}`
      throw new Error(
        `租户后台 API /api/${path} 失败: ${msg}\n` +
        `（该租户后台可能尚未开通这个只读端点，或域名配置不对：${this.baseUrl}）`,
      )
    }
    return body as T
  }
}
