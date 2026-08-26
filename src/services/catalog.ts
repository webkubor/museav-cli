/**
 * 公共目录 - 模型/供应商/定价（§十四）
 * 路由：/models、/models/:id、/providers、/pricing
 * API：GET /catalog/models、GET /catalog/models/:id、GET /catalog/providers、GET /catalog/pricing/plans
 *
 * 单模型 Provider 明细（/catalog/models/:id/providers）不再对公开目录下发（PRD §9.2 禁止暴露
 * 内部实例/区域/在线率），对应前端 Providers Tab 已下线，见 qa#552。
 */
import { get, getPage } from '@/lib/request'
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
  CatalogFacets,
  CatalogFeaturedSlide,
  CatalogRelatedResult,
  PublicProtocolLabelItem,
} from '@/types'

// ─── 模型列表 ─────────────────────────────────────

/** 获取公共模型目录列表 */
export function listModels(params?: CatalogModelListParams) {
  return getPage<CursorPage<CatalogModelItem>>('catalog/models', params)
}

/** 获取模型详情（含 description / tags / variants / benchmarks_summary） */
export function getModel(modelId: string) {
  return get<CatalogModelDetail>(`catalog/models/${encodeURIComponent(modelId)}`)
}

/** 获取模型标签目录（用于模型筛选和分类入口） */
export function listModelTags(enabled = true) {
  return get<CatalogModelTagsResponse>('catalog/model-tags', { enabled })
}

/**
 * 模型广场侧栏筛选计数。参数与 listModels 完全一致 —— 两者必须发送同一份筛选
 * 状态，否则侧栏计数描述的是与旁边列表不同的结果集。
 */
export function listModelFacets(params?: CatalogModelListParams) {
  return get<CatalogFacets>('catalog/model-facets', params)
}

/** 精选轮播（内容由后台配置，前端不得写死 model_id） */
export function listFeatured() {
  return get<{ items: CatalogFeaturedSlide[]; total: number }>('catalog/featured')
}

/** 模型详情的相关模型（运营配置优先，未配置回退同厂商/相近价位算法） */
export function listRelatedModels(modelId: string) {
  return get<CatalogRelatedResult>(`catalog/models/${encodeURIComponent(modelId)}/related`)
}

/** 获取模型族（模型组）目录，用于「模型组」官方筛选 */
export function listModelFamilies(enabled = true) {
  return get<CatalogModelFamiliesResponse>('catalog/model-families', { enabled })
}

/**
 * 协议标签目录（真源见 PublicProtocolLabelItem 注释）。前端各处的协议展示/筛选
 * 文案不再硬编码，改从这里拿；调用方在请求未完成或失败时一律回落本地兜底文案
 * （usePublicProtocolsStore，见 store/use-public-protocols-store.ts），不阻塞渲染。
 */
export function listPublicProtocols() {
  return get<{ items: PublicProtocolLabelItem[] }>('catalog/public-protocols')
}

// ─── 供应商列表 ───────────────────────────────────

/** 获取公共供应商目录列表 */
export function listProviders(params?: CatalogProviderListParams) {
  return getPage<CursorPage<CatalogProviderItem>>('catalog/providers', params)
}

// ─── 定价方案 ─────────────────────────────────────

/** 获取定价方案对比表（含 FAQ） */
export function getPricingPlans() {
  return get<PricingPlansResult>('catalog/pricing/plans')
}
