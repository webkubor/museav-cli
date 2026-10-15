/**
 * 控制台旧路径 → 官网（shared/modelgo_prd#1272 收尾；父单 #1269 硬约束 3「旧链接不能 404」）
 * 路由：/models、/models/discovery、/models/:modelId、/models/*（公开，免登录）
 * API：GET /platform-config（非锁定域名上定市场，与 PlatformLoader 共用同一个请求）
 *
 * 三页已拆到两站官网，这里不再渲染页面，按当前市场把访客送到对应官网的同一页：
 * /models → 官网 /models；/models/discovery → 官网 /models/rankings；/models/:modelId → 官网 /models/:modelId。
 * /models/* 接的是 prd#983 修编码之前发出去的 /models/vendor/model 旧链接，按详情处理。
 * 历史书签、已投放的广告链接、搜索引擎收录、控制台内的站内跳转（顶栏、新手引导）都落到这里。
 *
 * 两道保险：
 * 1. 目标地址带 `from=console`：两站官网旧版本对 /models* 回的是**无缓存头的 301 → 控制台**，
 *    浏览器会永久缓存。老访客若直接跳回原地址，浏览器不发请求、按缓存又弹回控制台，原地死循环。
 *    query 不同即另一条缓存键，绕开它。
 * 2. 同一标签页里同一条路径 15 秒内第 3 次**整页**落地 —— 说明官网那头还在往回指（配置错、官网回滚）——
 *    不再自动跳，停在本页给手动入口，别让用户在两个站之间被无限弹来弹去。
 *    只数整页落地：真正的跳转环一定是官网整页打回来的；站内点顶栏进来的（location.key 不是 'default'）
 *    永远照跳，不然「去官网 → 后退 → 再点排行」这种正常操作会被误拦。门槛放到第 3 次也是同一个原因：
 *    在官网上连点两次指回控制台 /models 的入口是正常的，环则会在几百毫秒内自己撞到第 3 次。
 *
 * 市场要等定下来再算目标：路由在 PlatformLoader 就绪前就渲染了（只是被遮罩盖着），非锁定域名
 * （console.test 这类共享测试域名）第一帧的市场可能还是缓存/默认值。生产域名锁定市场，不用等。
 *
 * 新手引导第 1 步「浏览模型广场」原来由广场页在登录态访问时上报（规格 §16.2：挂真实节点，不挂点击）。
 * 广场搬走后，登录用户在控制台里「访问广场」的节点就是这条路由（引导气泡、顶栏都是站内跳到 /models），
 * 所以在这里补报、等它落地再整页跳走 —— 不等的话请求会随页面卸载被掐掉，这一步永远亮不了。
 * 只覆盖站内跳转：整页直开 /models（含 Cmd+点击新标签页）时引导数据和登录态都还没就位，
 * 这里不会为了这一步去拉引导、也不会为它拖住跳转，这一步留给用户下次从站内进来再亮。
 * 官网是另一个域、没有登录态，那边报不了。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LuArrowUpRight } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { useMarket } from '@/hooks/useMarket'
import { getMarketQueryOverride, marketFromSite, type Market } from '@/lib/market'
import { marketLockedByDomain } from '@/lib/market-domain'
import { officialModelsUrl, type OfficialModelsPage } from '@/lib/official-models-url'
import { getPlatformConfig } from '@/services/platform'
import { useAuthStore } from '@/store/auth'
import { useLangStore } from '@/store/use-brand-store'
import { reportOnboardingStep } from '@/store/use-onboarding-store'

const LOOP_GUARD_KEY = 'mg_official_models_redirect'
const LOOP_GUARD_WINDOW_MS = 15_000
/** 窗口期内同一路径已经整页自动跳过几次之后停下 */
const LOOP_GUARD_MAX_AUTO = 2
/** 等新手引导上报的上限：接口慢也不能把人卡在中转页，超时照跳（这一步下次访问再报） */
const ONBOARDING_REPORT_WAIT_MS = 1_500

interface LoopRecord {
  path: string
  count: number
  at: number
}

/** 本标签页窗口期内这条路径已经整页自动跳了几次。sessionStorage 不可用（隐私模式）时没法防环，按 0 算、照常跳 */
function recentAutoRedirects(path: string, now = Date.now()): number {
  try {
    const record = JSON.parse(sessionStorage.getItem(LOOP_GUARD_KEY) || 'null') as LoopRecord | null
    if (!record || record.path !== path || now - record.at >= LOOP_GUARD_WINDOW_MS) return 0
    return Number(record.count) || 0
  } catch {
    return 0
  }
}

function recordAutoRedirect(path: string, now = Date.now()) {
  const record: LoopRecord = { path, count: recentAutoRedirects(path, now) + 1, at: now }
  try {
    sessionStorage.setItem(LOOP_GUARD_KEY, JSON.stringify(record))
  } catch {
    /* 存不了就不防环：宁可多跳一次，也不把正常访客挡在中转页 */
  }
}

/**
 * 跳转那一刻的市场。优先级与 PlatformLoader 一致：域名锁定 > 共享测试域名的 ?market= > platform-config。
 * 走同一个 query key，PlatformLoader 那个请求还在飞就复用它，已经拿到就直接读缓存，不会多打一次。
 */
async function settledMarket(queryClient: QueryClient): Promise<Market> {
  const forced = marketLockedByDomain(window.location.hostname) ?? getMarketQueryOverride()
  if (forced) return forced
  const config = await queryClient
    .fetchQuery({ queryKey: ['platform-config'], queryFn: getPlatformConfig, staleTime: Infinity })
    .catch(() => null)
  return config?.site ? marketFromSite(config.site) : useLangStore.getState().market
}

function withConsoleMarker(url: string): string {
  const next = new URL(url)
  next.searchParams.set('from', 'console')
  return next.toString()
}

export function OfficialModelsRedirect({ kind }: { kind: 'catalog' | 'rankings' | 'detail' }) {
  const { t, i18n } = useTranslation()
  const market = useMarket()
  const queryClient = useQueryClient()
  const params = useParams()
  const { pathname, search, hash, key } = useLocation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  // 只有整页加载进来的那一跳，location.key 才是 'default'；站内 navigate 都会生成新 key
  const fullPageLoad = key === 'default'
  // 挂载时判一次就定：跳走之前本页不会重渲染出别的结论
  const [blocked] = useState(() => fullPageLoad && recentAutoRedirects(pathname) >= LOOP_GUARD_MAX_AUTO)
  const onboardingReportRef = useRef<Promise<void> | null>(null)
  // replace 发出后到页面真正卸载之间 JS 还在跑：会话请求回来（isAuthenticated 翻成 true）、
  // 语言就位都会让 effect 重跑，没有这个标记就会再跳一次、防环再记一次数
  const firedRef = useRef(false)

  const modelId = params.modelId ?? params['*'] ?? ''
  const page = useMemo<OfficialModelsPage>(
    () => (kind === 'detail' ? { kind, modelId } : { kind }),
    [kind, modelId],
  )
  // 手动入口用渲染期的市场（就绪后会随 store 重渲染）；自动跳转在下面等市场定下来再算
  const manualTarget = useMemo(
    () => withConsoleMarker(officialModelsUrl(market, i18n.language, page, { search, hash })),
    [market, i18n.language, page, search, hash],
  )

  useEffect(() => {
    if (blocked || firedRef.current) return
    let cancelled = false
    // 没有引导数据（未登录、无权限角色、整页直开）时 reportOnboardingStep 立即返回，不耽误跳转。
    // 存进 ref：StrictMode 下 effect 会跑两遍，第二遍复用同一次上报，不再多报一次
    if (kind === 'catalog' && isAuthenticated) {
      onboardingReportRef.current ??= reportOnboardingStep('marketplace', 'page_visit', 'marketplace')
    }
    const reported = Promise.race([
      onboardingReportRef.current ?? Promise.resolve(),
      new Promise<void>((resolve) => setTimeout(resolve, ONBOARDING_REPORT_WAIT_MS)),
    ])
    void Promise.all([settledMarket(queryClient), reported]).then(([resolvedMarket]) => {
      // 等待期间用户后退 / 点了别处：本页已卸载，别再把人拽去官网
      if (cancelled || firedRef.current) return
      firedRef.current = true
      if (fullPageLoad) recordAutoRedirect(pathname)
      const target = withConsoleMarker(officialModelsUrl(resolvedMarket, i18n.language, page, { search, hash }))
      // replace：不在历史里留这一跳，官网上点「后退」直接回到来源页
      window.location.replace(target)
    })
    return () => {
      cancelled = true
    }
  }, [blocked, kind, isAuthenticated, queryClient, fullPageLoad, pathname, i18n.language, page, search, hash])

  return (
    <div className="min-h-screen flex items-center justify-center bg-mg-bg-1 px-6">
      <div className="mg-tile w-full max-w-sm p-8 text-center space-y-5">
        <div className="mx-auto w-14 h-14 rounded-lg bg-mg-fill-1 border border-mg-border flex items-center justify-center">
          <LuArrowUpRight size={26} className="text-mg-text-3" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-bold text-mg-text-1">{t('common.officialModels.title')}</h1>
          <p className="text-sm text-mg-text-3 leading-relaxed">
            {t(blocked ? 'common.officialModels.manual' : 'common.officialModels.redirecting')}
          </p>
        </div>
        <Button variant="brand" asChild className="w-full h-10 rounded-md font-semibold">
          <a href={manualTarget}>{t('common.officialModels.go')}</a>
        </Button>
      </div>
    </div>
  )
}
