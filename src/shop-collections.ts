/** 个人店铺合集 SDK；API /api/creator-collections，预览与私有原图分离。 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

/** 合集完整保存规格；save 为替换，更新也须保留全部字段。 */
export interface ShopCollectionInput {
  id?: string
  title: string
  issue_key: string
  description: string
  access_mode: 'product' | 'public'
  status: 'draft' | 'published'
  product_id: string | null
  workspace_id: string | null
  cover_asset_id: string | null
  asset_ids: string[]
  xhs_note_url?: string | null
  xhs_product_url?: string | null
}
/** 服务端合集元数据。 */
export interface ShopCollection extends Omit<ShopCollectionInput, 'asset_ids'> { id: string; owner_account_id: string; cover_url: string | null; item_count: number; share_url: string; created_at: string }
/** 合集条目，原图仅核销授权后可下载。 */
export interface ShopCollectionItem { id: string; source_asset_id: string | null; preview_url: string | null; name: string; mime: string | null; size_bytes: number | null; position: number; has_original: boolean }
/** 单份合集及其条目。 */
export interface ShopCollectionDetail { collection: ShopCollection; items: ShopCollectionItem[] }
/** 本人合集与可选商品、项目。 */
export interface ShopCollectionList { collections: ShopCollection[]; products: { id: string; title: string; status: string; credits: number }[]; workspaces: { id: string; name: string }[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function id(value: unknown, field: string): void {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`${field} 需为 UUID`)
}
function validate(value: ShopCollectionInput): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('合集 JSON 必须是对象')
  for (const [key, max] of [['title', 120], ['issue_key', 80], ['description', 4000]] as const) {
    if (typeof value[key] !== 'string' || value[key].length > max || (key !== 'description' && !value[key].trim())) throw new Error(`${key} 需为 ${max} 字以内字符串，title/issue_key 必填`)
  }
  if (!['product', 'public'].includes(value.access_mode) || !['draft', 'published'].includes(value.status)) throw new Error('合集 access_mode=product|public，status=draft|published')
  if (value.id !== undefined) id(value.id, 'id')
  if (value.access_mode === 'product') id(value.product_id, 'product_id')
  for (const field of ['workspace_id', 'cover_asset_id'] as const) {
    if (!(field in value)) throw new Error(`完整保存必须提供 ${field}（允许 null）`)
    if (value[field] !== null) id(value[field], field)
  }
  if (!Array.isArray(value.asset_ids) || value.asset_ids.length > 100 || new Set(value.asset_ids).size !== value.asset_ids.length) throw new Error('asset_ids 需为最多 100 个不重复 UUID 的数组')
  value.asset_ids.forEach(v => id(v, 'asset_ids'))
}

/** 复用 StudioClient 已认证请求，封装合集全量保存和私有原图上传。 */
export function createShopCollections(request: (path: string, init?: RequestInit) => Promise<any>) {
  return {
    /** 列出自己可管理的合集、商品和项目。 */
    async list(): Promise<ShopCollectionList> { return request('creator-collections') },
    /** 查询单份合集和条目 id。 */
    async show(collectionId: string): Promise<ShopCollectionDetail> {
      id(collectionId, 'collection_id')
      return request(`creator-collections?id=${encodeURIComponent(collectionId)}`)
    },
    /** 完整保存合集；发布时服务端验证私有原图齐备、内容与公开预览不同。 */
    async save(input: ShopCollectionInput): Promise<ShopCollectionDetail> {
      validate(input)
      return request('creator-collections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    },
    /** 给草稿中的现有条目上传私有原图；不走公开 upload-ref。 */
    async upload(collectionId: string, itemId: string, file: string): Promise<{ collection: ShopCollection; item: ShopCollectionItem }> {
      id(collectionId, 'collection_id')
      id(itemId, 'item_id')
      const bytes = readFileSync(file)
      if (!bytes.length || bytes.length > 32 * 1024 * 1024) throw new Error('私有原图需为 1 字节至 32 MiB 的图片')
      const form = new FormData()
      form.append('collection_id', collectionId)
      form.append('item_id', itemId)
      form.append('file', new Blob([new Uint8Array(bytes)]), basename(file))
      return request('creator-collections', { method: 'POST', body: form })
    },
  }
}
