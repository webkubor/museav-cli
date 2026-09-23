/**
 * 前端版本检测（qa#741）——治「用户开着标签页不刷新，永远拿不到新版」。
 *
 * 这跟 HTTP 缓存是两回事：nginx 的 Cache-Control（qa#740）管的是「用户重新进入
 * 页面时该不该用缓存副本」，而控制台是工作工具，用户挂着标签页几天不关很常见。
 * 页面不刷新，JS 就永远是打开那天的那份 —— 发的还是旧字段、跑的还是旧逻辑，
 * **任何响应头都治不了这个**，只能前端主动发现。
 *
 * 抓手是构建时就有的两样东西，都取自 `git rev-parse --short HEAD`，值必然一致：
 *   · `__BUILD_COMMIT__` —— agentVersion() 插件注入进 bundle 的「我是哪个版本」
 *   · `/version.json`    —— emit-version-json 插件产出的「线上现在是哪个版本」
 *
 * ⚠️ 依赖 qa#740 先把 /version.json 设成 no-store。在那之前它同样被浏览器缓存
 * 数小时（实测生产窗口约 9.1 小时），轮询拿到的永远是缓存里的旧版本号。
 */
import { useQuery } from '@tanstack/react-query'

/** 轮询间隔。5 分钟：发版后用户最多等 5 分钟看到提示，也不会把访问日志刷爆。 */
const POLL_MS = 5 * 60 * 1000

type VersionPayload = { commit?: string }

/**
 * 判断线上是否已经换版。
 *
 * 比 commit 不比 version：`version` 取自发版分支名（release/vX.Y.Z），同一版本内
 * 多次 hotfix 发版它不变；commit 每次构建都不同。
 *
 * 任一侧取不到值都判定为「没有新版」——宁可不提示，也不能因为拿不到数据就
 * 一直弹更新提示（无 git 环境构建时 __BUILD_COMMIT__ 会是空串）。
 */
export function hasNewVersion(latest: string | undefined, current: string): boolean {
  if (!latest || !current) return false
  return latest !== current
}

/** 判断自动刷新是否需要执行，避免同一旧页面刷新后因缓存再次陷入重载循环。 */
export function getRefreshAction(
  latest: string | undefined,
  current: string,
  pending: string | null,
): 'none' | 'refresh' | 'already-attempted' {
  if (!hasNewVersion(latest, current)) return 'none'
  return pending === latest ? 'already-attempted' : 'refresh'
}

/** 获取服务器报告的构建 commit，供新版提示组件决定是否自动刷新。 */
export function useLatestVersionCommit(): string | undefined {
  const { data } = useQuery({
    queryKey: ['app-version'],
    queryFn: async (): Promise<VersionPayload> => {
      // cache: 'no-store' 是双保险：qa#740 会在服务端加同名响应头，但本地 dev、
      // 预览环境、以及万一 nginx 配置回滚的情况下，这行仍能保证拿到的是真值。
      const res = await fetch('/version.json', { cache: 'no-store' })
      if (!res.ok) throw new Error(`version.json ${res.status}`)
      return res.json() as Promise<VersionPayload>
    },
    // 失败不弹全局 toast：providers.tsx 的 QueryCache.onError 会把未标记的 query
    // 错误统一弹出来，而版本检测挂了不该让用户看见任何东西。
    meta: { silentError: true },
    refetchInterval: POLL_MS,
    // 页面在后台时用户看不见提示，轮询纯属空耗
    refetchIntervalInBackground: false,
    // 版本检测是锦上添花不是关键路径：拿不到就算了，别重试、别打扰用户
    retry: false,
    staleTime: 0,
  })

  return data?.commit
}
