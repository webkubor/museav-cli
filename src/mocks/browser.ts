import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

/**
 * MSW Worker — 仅 DEV 模式启动。
 * onUnhandledRequest: 'bypass' 确保所有未注册 handler 的请求直接穿透到真实后端。
 */
export const worker = setupWorker(...handlers)
