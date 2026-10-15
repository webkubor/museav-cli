/**
 * 新手指南第 ⑤ 步「查看对应请求日志」的判据（纯函数）
 * 路由：/logs
 * API：无（消费 GET /model-logs 已归一化的行）
 *
 * 规格：2026-08-06-onboarding-guide-reward-design.md §7.2
 * 缺陷：shared/modelgo_prd#1036（模型体验那条请求不该点亮 ⑤）
 * 调整：shared/modelgo_prd#1341（需求方改口径：查看**非模型体验来源**的调用日志详情即可，
 *       不再要求调用成功、也不再排除异步任务）
 *
 * 抽成模块而不是留在页面里，是为了能单测 —— 这条判据背后是真金白银（凑满五步即发
 * ¥10 赠送余额，规格 §11「每租户每版一笔、发出不可回收」）。
 */

import type { CallLogItem } from '@/types'

/**
 * 模型体验（Playground）跑在系统托管的隐藏试用 Key 上，网关给这类行打
 * `metadata.api_key_type = 'trial'`（后端 `/model-logs` 的 `api_key_type` 筛选枚举里
 * 那个「trial(模型体验)」；⚠️ 与仓内三值的 `ApiKeyType` 不是同一个枚举，见 types/logs）。
 */
const TRIAL_API_KEY_TYPE = 'trial'

/**
 * 这条日志能不能作为第 ⑤ 步的证据。
 *
 * #1341 起只剩一条否决：**模型体验那条不算** —— 它已经是第 ② 步的证据（第 ② 步上报的
 * evidenceId 是 modelId、不是 request_id，两步在服务端看不出同源，只能在这里挡）。同一次
 * 用户动作点亮两步，五步任务就塌成四个动作（#1036）。失败调用、异步任务的日志详情此前按
 * §7.2 排除，#1341 需求方改为「非模型体验来源即可」，现在都算。
 *
 * ⚠️ 服务端上报第 ⑤ 步时仍校验 evidence_id 属于本租户且**已结算**（services/onboarding.ts），
 * 未结算的失败调用会被 400 挡回 —— 那是后端口径，前端不兜底。
 *
 * 未知类型（空串）放行。未知有两种来源，风险差很远：
 *   · 历史行 —— 网关 2026-07-14 才开始打 `metadata.api_key_type`（observer qa#469）。
 *     跑新手指南的租户不会有两个月前的日志，可忽略。
 *   · **契约没透传** —— 若 BFF 哪天不带 metadata，会让**所有**行变未知、判据整体退化
 *     成修复前，且全绿无信号。这条靠发布前实打一次 `/model-logs` 响应排除，代码不兜底。
 * 选放行不选堵死：堵死会让每个新手都永远卡在 ⑤（代价确定且大），放行最坏是退回修复前。
 */
export function canCompleteRequestLogStep(row: CallLogItem): boolean {
  return row.api_key_type !== TRIAL_API_KEY_TYPE
}
