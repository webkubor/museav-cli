/**
 * 个人店铺 typed SDK 与输入校验，复用 StudioClient 的认证和 HTTP 错误处理。
 * API：/api/sales-products、/api/sales-listing、/api/shop?owner=。
 */

import { createShopCollections } from './shop-collections.js'
export * from './shop-collections.js'

/** 商品的实际交付类型（API 正式字段为 kind）。 */
export type ShopProductKind = 'credits' | 'wallpaper' | 'bundle'
/** 外部销售渠道；CLI 只生成物料和发货码。 */
export type ShopChannel = 'xiaohongshu' | 'xianyu'
/** 核销后下载的 UTF-8 文件，不自动执行。 */
export interface ShopBundleContent { filename: string; content: string }
/** 创建商品的完整规格，只能关联自己拥有的模板和合集。 */
export interface ShopProductInput {
  title: string
  kind: ShopProductKind
  credits: number
  channel?: ShopChannel
  category?: string | null
  cover_url?: string | null
  template_ids?: string[]
  collection_ids?: string[]
  bundle_content?: ShopBundleContent | null
  benefits?: string[]
  reply_text?: string | null
  product_copy?: string | null
  hook_text?: string | null
  tutorial_pdf_url?: string | null
  tutorial_pdf_title?: string | null
  status?: 'draft' | 'active' | 'archived'
}
/** 卖家商品记录。 */
export interface ShopProduct extends ShopProductInput { id: string; owner_account_id: string }
/** 本人最近 200 个商品及可选的自有模板。 */
export interface ShopProducts { owner_id: string; products: ShopProduct[]; templates: { id: string; zh_name: string }[] }
/** 买家可见的店铺视图，不含交付正文或私信话术。 */
export interface ShopView {
  seller: { id: string; nickname: string; avatar_url: string | null; bio: string } | null
  products: Pick<ShopProduct, 'id' | 'title' | 'kind' | 'channel' | 'category' | 'cover_url' | 'credits' | 'benefits' | 'product_copy'>[]
  links: { platform: string; url: string; label: string }[]
  badges: { slug: string; name: string; description: string; icon_url: string | null; tier: string; serial: number | null; slot: number }[]
}
/** 发码参数；重试同一请求必须复用 request_id。 */
export interface ShopIssueInput { product_id: string; channel: ShopChannel; order_ref?: string; request_id: string; note?: string }
/** 发码后的渠道物料，不代表已在外部平台上架或发货。 */
export interface ShopIssueResult {
  ok: boolean
  code: string
  claim_url: string
  reply_text: string
  product_copy: string
  product_images: string[]
  credits: number
  templates?: { slug: string; zh_name: string }[]
  tutorial_pdf?: { url: string; title: string } | null
  channel: ShopChannel
  kind: ShopProductKind
  replayed: boolean
}
/** 本人的发码记录；交付快照留在服务端。 */
export interface ShopCode { code: string; product_id: string | null; channel: ShopChannel; order_ref: string | null; request_id: string | null; credits: number; status: string; created_at: string }
/** 本人最近 200 个发码记录和可选商品。 */
export interface ShopCodes { claims: ShopCode[]; products: { id: string; title: string }[]; templates: { id: string; zh_name: string }[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KINDS = ['credits', 'wallpaper', 'bundle']
const CHANNELS = ['xiaohongshu', 'xianyu']
const TEXT_FIELDS = ['category', 'cover_url', 'reply_text', 'product_copy', 'hook_text', 'tutorial_pdf_url', 'tutorial_pdf_title']
const FIELDS = ['title', 'kind', 'credits', 'channel', 'template_ids', 'collection_ids', 'bundle_content', 'benefits', 'status', ...TEXT_FIELDS]
const MAX_BUNDLE_BYTES = 200 * 1024
// 与后端积分存储的 int32 上限一致，避免通过本地校验后数据库溢出。
const MAX_CREDITS = 2 ** 31 - 1

/** 在发请求前校验商品或部分更新，拒绝拼错或服务端会忽略的字段。 */
export function validateShopProduct(value: unknown, partial = false): asserts value is ShopProductInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('商品 JSON 必须是对象')
  const p = value as Record<string, unknown>
  for (const key of Object.keys(p)) if (!FIELDS.includes(key)) throw new Error(`未知商品字段：${key}（商品类型使用 kind）`)
  if (!Object.keys(p).length) throw new Error('商品更新不能为空')
  if (!partial || 'title' in p) {
    if (typeof p.title !== 'string' || !p.title.trim() || p.title.length > 120) throw new Error('title 需为 1–120 字符的标题')
  }
  if ((!partial || 'kind' in p) && !KINDS.includes(p.kind as string)) throw new Error('kind 只支持 credits/wallpaper/bundle')
  if ((!partial || 'credits' in p) && (!Number.isInteger(p.credits) || (p.credits as number) < 0 || (p.credits as number) > MAX_CREDITS)) throw new Error(`credits 需为 0–${MAX_CREDITS} 的整数`)
  if ('channel' in p) validateShopChannel(p.channel)
  if ('status' in p && !['draft', 'active', 'archived'].includes(p.status as string)) throw new Error('status 只支持 draft/active/archived')
  for (const key of TEXT_FIELDS) if (p[key] != null && typeof p[key] !== 'string') throw new Error(`${key} 需为字符串或 null`)
  for (const key of ['template_ids', 'collection_ids']) {
    const ids = p[key]
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string' || !UUID.test(id)))) throw new Error(`${key} 需为最多 100 个 UUID 的数组`)
  }
  if ('benefits' in p && (!Array.isArray(p.benefits) || p.benefits.some(v => typeof v !== 'string'))) throw new Error('benefits 需为字符串数组')
  if (p.bundle_content != null) validateBundle(p.bundle_content)
  if (!partial) {
    if (p.kind === 'credits' && !(Number(p.credits) > 0)) throw new Error('积分商品需包含正积分')
    if (p.kind === 'wallpaper' && p.status !== 'draft' && !(p.collection_ids as string[] | undefined)?.length) throw new Error('壁纸商品必须关联可交付合集 collection_ids')
    if (p.kind === 'bundle' && !p.bundle_content) throw new Error('组合包必须提供真实 bundle_content 文件')
  }
}

function validateBundle(value: unknown): void {
  const b = value as ShopBundleContent
  if (!b || typeof b !== 'object' || Array.isArray(b) || !/^[\w.-]{1,120}$/.test(b.filename || '') || b.filename === '.' || b.filename.includes('..') || typeof b.content !== 'string' || !b.content.trim() || Buffer.byteLength(b.content, 'utf8') > MAX_BUNDLE_BYTES) {
    throw new Error('bundle_content 需包含安全文件名 filename 和 200KB 内 UTF-8 正文 content')
  }
}

/** 校验两种已支持的销售渠道。 */
export function validateShopChannel(value: unknown): asserts value is ShopChannel {
  if (!CHANNELS.includes(value as string)) throw new Error('channel 只支持 xiaohongshu/xianyu')
}

/** 校验商品标识，阻止无效参数发往服务端。 */
export function validateShopId(id: string): void {
  if (typeof id !== 'string' || !UUID.test(id)) throw new Error('商品 id 需为 UUID')
}

/** 校验发码参数；订单号和请求号由调用者持久保存以便安全重试。 */
export function validateShopIssue(input: ShopIssueInput): void {
  validateShopId(input.product_id)
  validateShopChannel(input.channel)
  for (const key of ['request_id', 'order_ref', 'note'] as const) {
    const v = input[key]
    if ((key === 'request_id' || v !== undefined) && (typeof v !== 'string' || !v.trim())) throw new Error(`${key} 不能为空`)
    if (key !== 'note' && v !== undefined && v.length > 200) throw new Error(`${key} 最多 200 字符`)
  }
}

/** 通过已认证的 StudioClient 请求函数创建店铺模块，不储存第二份凭证。 */
export function createShopApi(request: (path: string, init?: RequestInit) => Promise<any>, publicRequest: (path: string) => Promise<any>) {
  const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return {
    /** 合集草稿、私有原图和发布。 */
    collections: createShopCollections(request, publicRequest),
    /** 查看本人公开店铺；owner 来自鉴权后的商品列表。 */
    async show(): Promise<ShopView> {
      const own: ShopProducts = await request('sales-products')
      return request(`shop?owner=${encodeURIComponent(own.owner_id)}`)
    },
    /** 列出本人商品与可选模板。 */
    async products(): Promise<ShopProducts> { return request('sales-products') },
    /** 创建商品。 */
    async create(input: ShopProductInput): Promise<{ ok: boolean; product: ShopProduct }> {
      validateShopProduct(input)
      return request('sales-products', json('POST', input))
    },
    /** 更新指定商品；完整交付组合和归属由服务端检查。 */
    async update(id: string, patch: Partial<ShopProductInput>): Promise<{ ok: boolean; product: ShopProduct }> {
      validateShopId(id)
      validateShopProduct(patch, true)
      return request('sales-products', json('POST', { ...patch, id }))
    },
    /** 归档商品，保留已发出的码。 */
    async archive(id: string): Promise<{ ok: boolean }> {
      validateShopId(id)
      return request('sales-products', json('DELETE', { id }))
    },
    /** 列出本人最近 200 个发货码。 */
    async codes(): Promise<ShopCodes> { return request('sales-listing') },
    /** 发码并取得渠道物料；服务端原子预留积分和保存交付快照。 */
    async issue(input: ShopIssueInput): Promise<ShopIssueResult> {
      validateShopIssue(input)
      return request('sales-listing', json('POST', input))
    },
    /** 撤销未领取码；服务端负责原子退回预留积分。 */
    async revoke(code: string): Promise<{ ok: boolean }> {
      if (typeof code !== 'string' || !code.trim()) throw new Error('发货码不能为空')
      return request('sales-listing', json('POST', { action: 'disable', code }))
    },
  }
}

/** StudioClient.shop 的完整类型。 */
export type ShopApi = ReturnType<typeof createShopApi>
