/**
 * 模型对比工作台共享工具（拆分后抽取）。
 * 列状态类型与 store 里的 CompareColumnState 对齐（字段一致，别在这重复定义），
 * 本地仍叫 ColumnState 是为了不动既有引用。
 */

import type { CompareColumnState } from '@/store/use-experience-workbench-store'

/** 最多同时对比的模型数量（PRD §7.3：2-3 个） */
export const MAX_COMPARE = 3

/** 列状态类型跟着 store 里的 CompareColumnState 走（字段一致，别在这重复定义）。 */
export type ColumnState = CompareColumnState

/** 单列发送时可选携带的附件（qa#545）：只有该列模型支持时调用方才会传入非空值，
 *  resourceIds 喂给后端接口，media 只用于用户消息气泡的预览渲染。 */
export interface DispatchAttachment {
  resourceIds: string[]
  media?: Array<{ kind: string; url: string }>
}

/** 窄屏 Tab 状态点（§8.5：显示运行中/完成/失败） */
export function columnStatus(column: ColumnState): 'running' | 'failed' | 'succeeded' | 'idle' {
  if (column.streaming) return 'running'
  const last = column.history[column.history.length - 1]
  if (!last) return 'idle'
  if (last.error) return 'failed'
  if (last.role === 'assistant' && last.metrics) return 'succeeded'
  return 'idle'
}
