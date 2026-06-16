/**
 * 公共目录 - 模型/供应商/定价（§十四）
 * 路由：/models、/models/:id、/providers、/pricing
 * API：GET /catalog/models、GET /catalog/models/:id、GET /catalog/models/:id/providers、GET /catalog/providers、GET /catalog/pricing/plans
 */
import { get } from '@/lib/request'
import type {
  CatalogModelListParams,
  CatalogModelTagsResponse,
  CatalogModelFamiliesResponse,
  CatalogProviderListParams,
} from '@/interfaces/catalog'
import type {
  CatalogModelDetail,
  CatalogModelItem,
  CatalogProviderItem,
  CursorPage,
  PricingPlansResult,
  ProviderForModel,
} from '@/types'

// ─── 模型列表 ─────────────────────────────────────

/** 获取公共模型目录列表 */
export function listModels(params?: CatalogModelListParams) {
  return get<CursorPage<CatalogModelItem>>('catalog/models', params)
}

/** 获取模型详情（含 description / tags / variants / benchmarks_summary） */
export function getModel(modelId: string) {
  return get<CatalogModelDetail>(`catalog/models/${encodeURIComponent(modelId)}`)
}

/** 获取模型的 Provider 可用性列表（Providers tab） */
export function listModelProviders(modelId: string) {
  return get<CursorPage<ProviderForModel>>(
    `catalog/models/${encodeURIComponent(modelId)}/providers`
  )
}

/** 获取模型标签目录（用于模型筛选和分类入口） */
export function listModelTags(enabled = true) {
  return get<CatalogModelTagsResponse>('catalog/model-tags', { enabled })
}

/** 获取模型族（模型组）目录，用于「模型组」官方筛选 */
export function listModelFamilies(enabled = true) {
  return get<CatalogModelFamiliesResponse>('catalog/model-families', { enabled })
}

// ─── 供应商列表 ───────────────────────────────────

/** 获取公共供应商目录列表 */
export function listProviders(params?: CatalogProviderListParams) {
  return get<CursorPage<CatalogProviderItem>>('catalog/providers', params)
}

// ─── 定价方案 ─────────────────────────────────────

/** 获取定价方案对比表（含 FAQ） */
export function getPricingPlans() {
  return get<PricingPlansResult>('catalog/pricing/plans')
}
