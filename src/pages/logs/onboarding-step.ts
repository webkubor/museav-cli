/**
 * 新手指南第 ⑤ 步「查看对应请求日志」的判据（纯函数）
 * 路由：/logs
 * API：无（消费 GET /model-logs 已归一化的行）
 *
 * 规格：2026-08-06-onboarding-guide-reward-design.md §7.2
 * 缺陷：shared/modelgo_prd#1036（模型体验那条请求不该点亮 ⑤）
 *
 * 抽成模块而不是留在页面里，是为了能单测 —— 这条判据背后是真金白银（凑满五步即发
 * ¥10 赠送余额，规格 §11「每租户每版一笔、发出不可回收」）。
 */

import type { CallLogItem } from '@/types'
import { isAsyncCall } from './async-call'

/**
 * 模型体验（Playground）跑在系统托管的隐藏试用 Key 上，网关给这类行打
 * `metadata.api_key_type = 'trial'`（后端 `/model-logs` 的 `api_key_type` 筛选枚举里
 * 那个「trial(模型体验)」；⚠️ 与仓内三值的 `ApiKeyType` 不是同一个枚举，见 types/logs）。
 */
const TRIAL_API_KEY_TYPE = 'trial'

/**
 * 这条日志能不能作为第 ⑤ 步的证据。
 *
 * 三条否决，都来自 §7.2「失败、取消、未开始和异步任务不计入本步」与 #1036：
 *   1. **没成功的调用不算** —— §7.2 要的是「成功调用 + 打开它的详情」。
 *   2. **异步任务不算** —— §7.2 明写。异步任务行和同步调用混在同一张调用日志列表里
 *      （qa#719），点开的也是同一个详情面板，判据不看就会把它算进来。
 *   3. **模型体验那条不算** —— 它已经是第 ② 步的证据（第 ② 步上报的 evidenceId 是
 *      modelId、不是 request_id，两步在服务端看不出同源，只能在这里挡）。**同一次用户
 *      动作**点亮两步，五步任务就塌成四个动作：用户没走通「建 Key → 复制接入配置 →
 *      自己发起调用」也能凑满领奖（#1036 实测：测试环境近四次人工完成 ⑤ 用的全是
 *      trial 那条）。⑤ 要的是**用户自己那把 Key 打出去的调用**。
 *
 * 未知类型（空串）放行。未知有两种来源，风险差很远：
 *   · 历史行 —— 网关 2026-07-14 才开始打 `metadata.api_key_type`（observer qa#469）。
 *     跑新手指南的租户不会有两个月前的日志，可忽略。
 *   · **契约没透传** —— 若 BFF 哪天不带 metadata，会让**所有**行变未知、判据整体退化
 *     成修复前，且全绿无信号。这条靠发布前实打一次 `/model-logs` 响应排除，代码不兜底。
 * 选放行不选堵死：堵死会让每个新手都永远卡在 ⑤（代价确定且大），放行最坏是退回修复前。
 */
export function canCompleteRequestLogStep(row: CallLogItem): boolean {
  if (row.status !== 'succeeded') return false
  if (isAsyncCall(row)) return false
  if (row.api_key_type === TRIAL_API_KEY_TYPE) return false
  return true
}
