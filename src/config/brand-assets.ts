/**
 * 品牌资产统一入口（按 market 出对应 logo/icon）。
 *
 * 必须在「渲染期」通过 hook 取值——不要把 market 提到模块顶层算一次（会冻死，
 * 且 localStorage/dev 工具条切换市场后不更新；本地 localhost 域名探测不到还会冻成 global，
 * 导致国内站显示海外 logo）。
 * useMarket() 读 use-brand-store 的 market：prod 初始化自 getMarket()（域名）、dev 跟随工具条切换。
 */
import { useMarket } from '@/hooks/useMarket'

const LOGOS = {
  /* 立体渐变版标记（Frame 1399），与官网 modelgo-web、文档站同一份素材。
     海外那份不动。ICONS 是另一套资源（应用图标），也不动。 */
  china: '/brand/modelgo-cn-logo.png',
  global: '/brand/modelgo-global-logo.svg',
} as const

const ICONS = {
  china: '/brand/modelgo-app-icon-dark.svg',
  global: '/brand/modelgo-global-logo.svg',
} as const

/** 当前 market 的站点 logo（响应式）。在组件渲染期调用。 */
export function useSiteLogo(): string {
  return LOGOS[useMarket()]
}

/** 当前 market 的站点 icon（响应式）。在组件渲染期调用。 */
export function useSiteIcon(): string {
  return ICONS[useMarket()]
}
