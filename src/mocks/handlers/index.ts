import type { RequestHandler } from 'msw'

/**
 * 汇总所有 mock handler。
 *
 * 使用规则：
 *   - 只在「真实接口尚未实现」时在此注册 handler
 *   - 真实接口上线后，立即删除对应 handler 文件，不留残余
 *   - onUnhandledRequest: 'bypass' 保证已有真实接口的请求100%穿透到后端
 *
 * 示例（有 API 后删掉）：
 *   import { overviewHandlers } from './overview'
 *   export const handlers: RequestHandler[] = [...overviewHandlers]
 */
export const handlers: RequestHandler[] = [
  // 暂无待 mock 的接口
]
