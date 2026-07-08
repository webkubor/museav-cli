/**
 * localStorage key 统一命名工具
 *
 * 命名规范：
 *   market 隔离 → mg:{market}:{name}   国内/海外在同一 origin（dev/test）时不互串
 *   app 全局    → mg:{name}            与市场无关的偏好/状态
 *
 * 所有业务代码只能通过 storageKeys 访问 localStorage，禁止硬编码字符串 key。
 */

// market 检测内联，避免与 market.ts 形成循环依赖
function detectMarket(): string {
  const env = import.meta.env.VITE_MARKET
  if (env === 'domestic' || env === 'global') return env
  if (typeof window !== 'undefined') {
    const h = window.location.hostname.toLowerCase()
    if (h.includes('modelgo.com') || h.endsWith('.cn')) return 'domestic'
    if (h.includes('modelgo.ai')) return 'global'
  }
  return 'global'
}

type Scope = 'market' | 'app'

function buildKey(name: string, scope: Scope): string {
  return scope === 'market' ? `mg:${detectMarket()}:${name}` : `mg:${name}`
}

// ─── 集中声明所有 key ────────────────────────────────────────────────────────

export const storageKeys = {
  // ── 认证 / 多租户（market 隔离：国内和海外 tenant 体系不同） ──────────────
  activeTenantId: () => buildKey('active_tenant_id', 'market'),
  // 按租户隔离：一个账号多租户时，各租户各记各的上次选中工作空间，
  // 避免跨租户串台（活跃租户 A + 残留 B 的 workspace → 接口 40301）。
  activeWorkspaceId: (tenantId: string) => buildKey(`active_workspace_id:${tenantId}`, 'market'),
  rememberedLogin: () => buildKey('remembered_login', 'market'),
  authGuard:      (scope: string) => buildKey(`auth_guard:${scope}`, 'market'),

  // ── 主题（app 全局，与市场无关） ──────────────────────────────────────────
  theme:           ()           => buildKey('theme', 'app'),
  themeByUser:     (userId: string) => buildKey(`theme:${userId}`, 'app'),
  themeModified:   ()           => buildKey('theme_modified', 'app'),
  brandTheme:      ()           => buildKey('brand_theme', 'app'),

  // ── 语言偏好（app 全局） ──────────────────────────────────────────────────
  lang: () => buildKey('lang', 'app'),

  // ── 时区偏好（app 全局，与市场无关） ──────────────────────────────────────
  timeZone:       ()                 => buildKey('timezone', 'app'),
  timeZoneByUser: (userId: string)   => buildKey(`timezone:${userId}`, 'app'),

  // ── 平台配置缓存（用于 stale-while-revalidate，避免首屏品牌色闪烁） ────────
  platformSite:     () => buildKey('platform_site', 'app'),

  // ── 客服聊天（app 全局，会话数据无需 market 隔离） ────────────────────────
  csHistory:        () => buildKey('cs_history', 'app'),
  csConversationId: () => buildKey('cs_cid', 'app'),
  csTriggerPos:     () => buildKey('cs_pos', 'app'),

  // ── 设备指纹（app 全局，跨市场唯一标识） ─────────────────────────────────
  deviceId:         () => buildKey('device_id', 'app'),
} as const
