/**
 * 第三方品牌主色 SSOT
 * 与 brand-icons.tsx 配套：那边出 logo，这边出色值。单独成文件是因为 brand-icons.tsx 只能
 * 导出组件（react-refresh/only-export-components），常量混在一起会破坏 Fast Refresh。
 * 业务组件禁止再手抄一份色表——需求方#903 就是 TopUpModal 抄了一份、新增渠道时漏同步。
 */
export const BRAND_COLORS = {
  alipay: '#1677FF',
  wechat: '#07C160',
  stripe: '#635BFF',
} as const

export type BrandKey = keyof typeof BRAND_COLORS
