/**
 * 历史会话侧栏数据映射（从 HistorySessionSidebar.tsx 拆出，避免该文件混合导出
 * 组件与普通函数，撞 react-refresh/only-export-components 丢 fast-refresh）。
 */
import { prettyModelName } from '@/lib/utils'
import { modelVendorLabel } from '@/features/models/model-format'

export interface HistorySessionItem {
  id: string
  name: string
  updatedAt: string // ISO 时间
  category: 'dialogue' | 'image' | 'audio' | 'video'
  task: string
  models: Array<{ id: string; name: string; offline?: boolean }>
}

/**
 * 把后端模型目录里的 model_id 解析成侧栏展示用的 {id, name, offline}。
 * 离线 = 当前 catalog 找不到该模型（已下架/无权限），侧栏降级用 model_id 兜底展示。
 */
function resolveHistoryModel(
  modelId: string,
  allModels: Array<{ model_id: string; display_name: string; vendor?: string | null; provider?: string | null }>,
): { id: string; name: string; offline: boolean } {
  const catalogModel = allModels.find((m) => m.model_id === modelId)
  return {
    id: modelId,
    name: catalogModel
      ? prettyModelName(catalogModel.display_name, catalogModel.model_id, modelVendorLabel(catalogModel, ''))
      : modelId,
    offline: !catalogModel,
  }
}

/**
 * 把后端会话（列表/详情响应均可）映射成侧栏 HistorySessionItem。
 * models 字段：列表响应用轻量 `session.models`（qa#535），详情响应用 `session.conversations`，
 * 两者兼容，models 优先。playground 和 compare 共用此映射（审计前两边逐字复制）。
 *
 * @param session 后端会话（ExperienceSessionDetail 子集，只要含 id/name/category/task/models/conversations）
 * @param allModels 模型目录，用于把 model_id 翻译成可读名 + 判断是否离线
 * @param taskLabel 任务枚举 → 可读文案的转换函数（experienceTaskLabel）
 */
export function mapSessionToHistoryItem(
  session: {
    id: string
    name: string
    updated_at: string
    category?: string
    task?: string
    models?: string[]
    conversations?: Array<{ model_id: string; position: number }>
  },
  allModels: Array<{ model_id: string; display_name: string; vendor?: string | null; provider?: string | null }>,
  taskLabel: (task: string) => string | undefined,
): HistorySessionItem {
  return {
    id: session.id,
    name: session.name,
    updatedAt: session.updated_at,
    category: (session.category as HistorySessionItem['category']) ?? 'dialogue',
    task: taskLabel(session.task as string) ?? session.task ?? '',
    models: session.models
      ? session.models.map((modelId) => resolveHistoryModel(modelId, allModels))
      : (session.conversations ?? [])
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((conv) => resolveHistoryModel(conv.model_id, allModels)),
  }
}
