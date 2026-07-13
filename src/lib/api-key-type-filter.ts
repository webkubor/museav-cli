/**
 * API Key 类型筛选（需求 #22）——总览/用量/调用日志三页共用。
 * 后端 qa#449 在 usage summary/series/rankings、model-logs list/stats 支持 `api_key_type` 过滤。
 * 「全部」不发参数；选具体类型时发 personal|member|service。
 * 账单页不含此筛选（账本无 Key 归属，见 qa#449 结论）。
 */
import type { ApiKeyType } from '@/types'

export const KEY_TYPE_ALL = 'all' as const
export type ApiKeyTypeFilter = ApiKeyType | typeof KEY_TYPE_ALL

/** 下拉可选类型顺序（个人租户无「成员 Key」，由调用方按 isPersonalTenant 过滤） */
export const API_KEY_TYPE_ORDER: ApiKeyType[] = ['personal', 'member', 'service']

/** 类型 → i18n key（label 文案在 common.keyTypeFilter.*，双端语言由 i18n 提供） */
export const API_KEY_TYPE_I18N_KEY: Record<ApiKeyType, string> = {
  personal: 'common.keyTypeFilter.personal',
  member: 'common.keyTypeFilter.member',
  service: 'common.keyTypeFilter.service',
}

/** 筛选值 → 请求参数：'all' 归一为 undefined（不发参数），其余原样透传 */
export function apiKeyTypeParam(filter: ApiKeyTypeFilter): ApiKeyType | undefined {
  return filter === KEY_TYPE_ALL ? undefined : filter
}
