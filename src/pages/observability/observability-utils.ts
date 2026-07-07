/**
 * 可观测性页面工具函数
 * 路由：/observability；空间详情「日志与转发」页签复用
 * API：无直接请求，仅处理前端展示数据
 */
import type { ForwardItem } from '@/types'

/** 转发平台弹窗选中项。 */
export type PlatformSelection = { id: string; name: string }

/** 从转发配置中提取 Endpoint 展示值。 */
export function getForwardEndpoint(forward: ForwardItem) {
  const endpoint = forward.config?.endpoint
  return typeof endpoint === 'string' && endpoint.trim() ? endpoint : ''
}
