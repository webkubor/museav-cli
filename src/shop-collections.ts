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
  /** 小红书选题笔记的发布时间：专栏内「说说」排序锚点（可空=按建档时间兜底）。 */
  xhs_note_published_at?: string | null
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

/** 公开列表只含已发布合集，不包含管理端的商品和项目。 */
/** 公开合集列表响应，不包含管理端商品或项目。 */
export interface PublicCollectionList { collections: ShopCollection[] }
/** 公开详情响应，包含作者和访问说明，不含私有原图存储位置。 */
export interface PublicCollectionDetail extends ShopCollectionDetail {
  author: { id: string; nickname: string; avatar_url: string | null; bio: string } | null
  access: { can_download: boolean; reason: string; product_id: string | null }
}

/** 复用 StudioClient 请求；公开读取显式走匿名通道，管理请求保持 JWT 限制。 */
export function createShopCollections(request: (path: string, init?: RequestInit) => Promise<any>, publicRequest: (path: string) => Promise<any>) {
  return {
    /** 列出自己可管理的合集、商品和项目。 */
    async list(): Promise<ShopCollectionList> { return request('creator-collections') },
    /** 按作者 UUID 匿名列出已发布合集。 */
    async listPublic(owner: string): Promise<PublicCollectionList> {
      id(owner, 'owner')
      return publicRequest(`collections?owner=${encodeURIComponent(owner)}`)
    },
    /** 匿名查看公开合集及其预览条目。 */
    async showPublic(collectionId: string): Promise<PublicCollectionDetail> {
      id(collectionId, 'collection_id')
      return publicRequest(`collections?id=${encodeURIComponent(collectionId)}`)
    },
    /** 查询单份自有合集和条目 id。 */
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
    /**
     * 追加专题壁纸（owner 2026-10-28「CLI 需支持补充壁纸」）。
     *
     * 与 save 的区别：save 是**替换**（全量回传 asset_ids，少传即删），
     * 这里是**追加**（只在末尾加，已有条目不动；已购买本专题的买家也能下载新追加的图）。
     * 每个 original 对应一个 sourceAssetId（该图在素材库里的预览素材 id）。
     */
    async append(collectionId: string, files: { sourceAssetId: string; file: string }[]): Promise<ShopCollectionDetail> {
      id(collectionId, 'collection_id')
      if (!files.length) throw new Error('追加至少要一张图')
      const form = new FormData()
      form.append('collection_id', collectionId)
      for (const item of files) {
        id(item.sourceAssetId, 'source_asset_id')
        const bytes = readFileSync(item.file)
        if (!bytes.length || bytes.length > 32 * 1024 * 1024) throw new Error('私有原图需为 1 字节至 32 MiB 的图片')
        form.append('source_asset_id', item.sourceAssetId)
        form.append('file', new Blob([new Uint8Array(bytes)]), basename(item.file))
      }
      return request('creator-collections?action=append', { method: 'POST', body: form })
    },
  }
}
