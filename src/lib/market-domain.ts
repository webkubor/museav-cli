/**
 * 市场判定的唯一真源（SSOT）。零依赖叶子模块——谁都能引，不成环。
 *
 * 第一性原理：生产环境里「域名」就是市场的物理事实，市场是它的纯函数派生。
 * 全线只有两个市场、两个域名：modelgo.ai 系 = 海外(global)，其余（modelgo.com /
 * test / localhost）一律国内(china)。词汇与后端 platform-config 的 site 对齐
 * （'china' | 'global'）。不读任何构建期变量、不做兜底链——
 * 构建配置不得凌驾于域名之上（那正是 console.modelgo.ai 误载 test 构建时
 * 主题/API 全部错乱的根因）。
 *
 * 运行时切换（dev 工具条在单域名测试环境预览另一市场）是 dev-tools 独有关注点，
 * 存活在 store 里，永不进本函数。
 */

export type Market = 'china' | 'global'

/** 唯一真源：主机名 → 市场。 */
export function marketFromHostname(hostname: string): Market {
  return hostname.toLowerCase().includes('modelgo.ai') ? 'global' : 'china'
}

/**
 * 生产域名 → 市场**锁定**（注册入口/主题色/logo 由域名前置决定，秒渲染）。
 * 命中生产域名时返回市场，platform-config 的 site **不得覆盖**——
 * 后端配置错误（如国外站误返 site:china，qa#480）不能把 .ai 翻成国内品牌。
 * 返回 null = 非生产域名（test 单域名/localhost/预览），保持 platform-config
 * 驱动可切两端（#466 验收能力不受影响）。
 */
export function marketLockedByDomain(hostname: string): Market | null {
  const h = hostname.toLowerCase()
  if (h.endsWith('test.modelgo.com') || h.endsWith('test.modelgo.ai')) return null
  if (h.endsWith('modelgo.ai')) return 'global'
  if (h.endsWith('modelgo.com')) return 'china'
  return null
}

/**
 * 共享测试域名上的显式市场覆盖。调用方必须先确认当前不是生产锁定域名，
 * 以避免 URL 参数改变生产域名的市场归属。
 */
export function marketOverrideFromSearch(search: string): Market | null {
  const market = new URLSearchParams(search).get('market')
  return market === 'china' || market === 'global' ? market : null
}

/**
 * 页面入口市场：生产域名锁定优先；共享测试域名才允许 query 显式指定。
 * 保持为纯函数，供首屏市场、语言、主题和 market-scoped storage 使用同一判定。
 */
export function marketFromLocation(hostname: string, search: string): Market {
  const locked = marketLockedByDomain(hostname)
  return locked ?? marketOverrideFromSearch(search) ?? marketFromHostname(hostname)
}
