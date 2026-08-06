/**
 * 公开外壳 —— 免登录页面（模型广场公开版 /models）的布局。
 * 复用控制台公共顶栏 DashboardHeader（同一组导航 + 账户配置）：
 *   登录态 → 显示账户/组织配置；匿名 → 显示登录/注册入口。
 * 不含侧边栏。主题：生产由域名决定（见 lib/market），URL `?market=` 仅作本地预览覆盖。
 */
import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useLangStore } from '@/store/use-brand-store'
import { DashboardHeader } from './DashboardHeader'
import { DecorStarField } from './DecorStarField'
import './public-shell.css'

export function PublicShell() {
  // ponytail: 生产以域名为准，这里只读 ?market 覆盖（本地两主题预览 / 官网显式指定）
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('market')
    if (m === 'china' || m === 'global') {
      document.documentElement.dataset.market = m
      useLangStore.getState().setMarket(m)
    }
  }, [])

  return (
    <div className="mg-public-shell mg-glass-canvas flex min-h-screen flex-col text-mg-text-1">
      {/* 装饰星场：与官网首屏同一份 36 颗星，和固定的渐变画布一起做"大画布"观感。
          纯装饰（aria-hidden + pointer-events:none），落在内容之下。 */}
      <DecorStarField />
      <div className="sticky top-0 z-40">
        <DashboardHeader />
      </div>
      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-8">
        <Outlet />
      </main>
    </div>
  )
}
