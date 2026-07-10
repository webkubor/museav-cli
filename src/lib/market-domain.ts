/**
 * 市场判定的唯一真源（SSOT）。零依赖叶子模块——谁都能引，不成环。
 *
 * 第一性原理：生产环境里「域名」就是市场的物理事实，市场是它的纯函数派生。
 * 全线只有两个市场、两个域名：modelgo.ai 系 = 海外(global)，其余（modelgo.com /
 * test / localhost）一律国内(domestic)。不读任何构建期变量、不做兜底链——
 * 构建配置不得凌驾于域名之上（那正是 console.modelgo.ai 误载 test 构建时
 * 主题/API 全部错乱的根因）。
 *
 * 运行时切换（dev 工具条在单域名测试环境预览另一市场）是 dev-tools 独有关注点，
 * 存活在 store 里，永不进本函数。
 */

export type Market = 'domestic' | 'global'

/** 唯一真源：主机名 → 市场。 */
export function marketFromHostname(hostname: string): Market {
  return hostname.toLowerCase().includes('modelgo.ai') ? 'global' : 'domestic'
}
