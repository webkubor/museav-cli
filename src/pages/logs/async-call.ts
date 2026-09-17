/**
 * 调用日志异步判据：统一列表、Token 与详情的分支。
 * 路由：/logs；契约来源 qa#719，本地未实测。
 */
import type { CallLogItem } from '@/types'

/** 任一后端标记为异步即成立；均缺失时走原有同步分支。 */
export function isAsyncCall(row: Pick<CallLogItem, 'call_mode' | 'call_kind'>): boolean {
  return row.call_mode === 'async' || row.call_kind === 'async_task'
}
