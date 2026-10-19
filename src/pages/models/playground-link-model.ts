import type { CatalogModelItem } from '@/types'

/** #1390 官网活动链接使用 catalog 的 model_id；只有当前目录中真实存在的模型可选。 */
export function resolvePlaygroundLinkModel(search: string, models: CatalogModelItem[]): CatalogModelItem | undefined {
  const id = new URLSearchParams(search).get('model_id')
  if (!id || id.length > 256) return undefined
  return models.find((model) => model.model_id === id)
}
