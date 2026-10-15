/**
 * 控制台旧路径 → 官网（shared/modelgo_prd#1272 收尾；父单 #1269 硬约束 3「旧链接不能 404」）
 * 路由：/models、/models/discovery、/models/:modelId（公开，免登录）
 * API：无
 *
 * 三页已拆到两站官网，这里不再渲染页面，按当前市场把访客送到对应官网的同一页：
 * /models → 官网 /models；/models/discovery → 官网 /models/rankings；/models/:modelId → 官网 /models/:modelId。
 * 历史书签、已投放的广告链接、搜索引擎收录、控制台内残留的站内跳转都落到这里。
 *
 * 两道保险：
 * 1. 目标地址带 `from=console`：两站官网旧版本对 /models* 回的是**无缓存头的 301 → 控制台**，
 *    浏览器会永久缓存。老访客若直接跳回原地址，浏览器不发请求、按缓存又弹回控制台，原地死循环。
 *    query 不同即另一条缓存键，绕开它。
 * 2. 同一标签页 15 秒内已经跳过一次又回到这里 —— 说明官网那头还在往回指（配置错、官网回滚）——
 *    不再自动跳，停在本页给手动入口，别让用户在两个站之间被无限弹来弹去。
 *
 * 新手引导第 1 步「浏览模型广场」原来由广场页在登录态访问时上报（规格 §16.2：挂真实节点，不挂点击）。
 * 广场搬走后，登录用户在控制台里「访问广场」的节点就是这条路由（引导气泡、顶栏都是站内跳到 /models），
 * 所以在这里补报、等它落地再整页跳走 —— 不等的话请求会随页面卸载被掐掉，这一步永远亮不了。
 * 官网是另一个域、没有登录态，那边报不了。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LuArrowUpRight } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { useMarket } from '@/hooks/useMarket'
import { officialModelsUrl, type OfficialModelsPage } from '@/lib/official-models-url'
import { useAuthStore } from '@/store/auth'
import { reportOnboardingStep } from '@/store/use-onboarding-store'

const LOOP_GUARD_KEY = 'mg_official_models_redirect_at'
const LOOP_GUARD_WINDOW_MS = 15_000
/** 等新手引导上报的上限：接口慢也不能把人卡在中转页，超时照跳（这一步下次访问再报） */
const ONBOARDING_REPORT_WAIT_MS = 1_500

/** 本标签页窗口期内是否刚自动跳过一次。只读，渲染期调用安全；sessionStorage 不可用（隐私模式）时没法防环，照常跳 */
function redirectedRecently(now = Date.now()): boolean {
  try {
    return now - Number(sessionStorage.getItem(LOOP_GUARD_KEY) || 0) < LOOP_GUARD_WINDOW_MS
  } catch {
    return false
  }
}

function markRedirected(now = Date.now()) {
  try {
    sessionStorage.setItem(LOOP_GUARD_KEY, String(now))
  } catch {
    /* 存不了就不防环：宁可多跳一次，也不把正常访客挡在中转页 */
  }
}

export function OfficialModelsRedirect({ kind }: { kind: 'catalog' | 'rankings' | 'detail' }) {
  const { t, i18n } = useTranslation()
  const market = useMarket()
  const { modelId = '' } = useParams()
  const { search, hash } = useLocation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const startedRef = useRef(false)
  // 挂载时判一次就定：跳走之前本页不会重渲染出别的结论
  const [blocked] = useState(() => redirectedRecently())

  const target = useMemo(() => {
    const page: OfficialModelsPage = kind === 'detail' ? { kind, modelId } : { kind }
    const url = new URL(officialModelsUrl(market, i18n.language, page, { search, hash }))
    url.searchParams.set('from', 'console')
    return url.toString()
  }, [kind, modelId, market, i18n.language, search, hash])

  useEffect(() => {
    // StrictMode 下 effect 会跑两遍，别让第二遍再报一次、再跳一次
    if (blocked || startedRef.current) return
    startedRef.current = true
    markRedirected()
    // 没有引导数据（整页直开、未登录、无权限角色）时 reportOnboardingStep 立即返回，不耽误跳转
    const reported =
      kind === 'catalog' && isAuthenticated
        ? reportOnboardingStep('marketplace', 'page_visit', 'marketplace')
        : Promise.resolve()
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, ONBOARDING_REPORT_WAIT_MS))
    // replace：不在历史里留这一跳，官网上点「后退」直接回到来源页
    void Promise.race([reported, timeout]).then(() => window.location.replace(target))
  }, [blocked, target, kind, isAuthenticated])

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
          <a href={target}>{t('common.officialModels.go')}</a>
        </Button>
      </div>
    </div>
  )
}
