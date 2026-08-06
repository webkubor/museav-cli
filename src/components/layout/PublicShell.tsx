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
    <div className="mg-public-shell flex min-h-screen flex-col bg-mg-bg-1 text-mg-text-1">
      <div className="sticky top-0 z-40">
        <DashboardHeader />
      </div>
      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-8">
        <Outlet />
      </main>
    </div>
  )
}
