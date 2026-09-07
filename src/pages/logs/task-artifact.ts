/**
 * 任务产物模块的展示口径（PRD d5b0352 / d0ddb56）。
 *
 * 单独成文件而不是放进 detail.tsx：组件文件只能导出组件，混着导出纯函数会让
 * react-refresh 失效（eslint react-refresh/only-export-components 直接报错）。
 */

/**
 * 任务产物的引导文案与状态色（PRD d5b0352 / d0ddb56）。
 *
 * 只有「任务状态 / 产物状态」两行数据时，用户不知道下一步该干什么；PRD 给四态各配了
 * 一句引导语，并把状态色从一律 success 改成三态（失败红 / 完成绿 / 生成中中性）。
 * `expired` 走 generating 之外的独立文案 —— 过期不是失败，产物没了但任务信息还在。
 */
const ARTIFACT_GUIDE_KEY: Record<string, string> = {
  available: 'available',
  failed: 'failed',
  expired: 'expired',
  generating: 'generating',
}

export function artifactGuideKey(state: string | null | undefined) {
  return ARTIFACT_GUIDE_KEY[state ?? ''] ?? 'generating'
}

export function artifactTone(state: string | null | undefined) {
  if (state === 'failed') return 'text-mg-danger'
  if (state === 'available') return 'text-mg-success'
  return 'text-mg-text-2'
}

/** 任务总耗时 = completed_at - created_at；未完成或时间缺失时返回 null（不显示该行）。 */
export function taskTotalDuration(task: { created_at?: string; completed_at?: string }) {
  if (!task.created_at || !task.completed_at) return null
  const ms = new Date(task.completed_at).getTime() - new Date(task.created_at).getTime()
  return Number.isFinite(ms) && ms > 0 ? ms : null
}
