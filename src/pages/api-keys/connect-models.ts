/**
 * 从目录模型 id 里挑「接入」时要钉的默认模型（纯函数，无 UI 依赖，便于单测）。
 *
 * Claude Code / CC Switch 若不指定模型会用官方默认 slug（claude-sonnet-4-*），ModelGo 目录里
 * 没有 → 网关 403 model_not_in_catalog → 替换后无法使用 agent。所以要从当前目录里挑真实存在
 * 的 Claude / Codex 模型钉进接入参数。
 *
 * ⚠️ 目录 model_id 带厂商前缀（anthropic/claude-opus-4.6），但网关 /v1/models 认的是裸名
 * （claude-opus-4.6）。带前缀请求同样 403，所以这里统一剥掉前缀再挑。
 */
import type { CatalogModelListParams } from '@/interfaces/catalog'
import type { CatalogModelItem, CursorPage } from '@/types'

const CONNECT_MODEL_PAGE_SIZE = 100
const MAX_CONNECT_MODEL_PAGES = 50

/** 拉取某个快速接入客户端的完整模型目录；保留游标分页契约，不改变接口语义。 */
export async function listAllConnectModels(
  tool: 'claude-code' | 'codex',
  listPage: (params: CatalogModelListParams) => Promise<CursorPage<CatalogModelItem>>
): Promise<CatalogModelItem[]> {
  const items: CatalogModelItem[] = []
  const seenCursors = new Set<string>()
  let cursor: string | undefined

  for (let pageNumber = 0; pageNumber < MAX_CONNECT_MODEL_PAGES; pageNumber += 1) {
    const page = await listPage({
      coding_tool: tool,
      include_hidden: true,
      page_size: CONNECT_MODEL_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    })
    items.push(...page.items)

    if (!page.has_more) return items
    const nextCursor = page.next_cursor
    if (!nextCursor) throw new Error('模型目录分页响应缺少 next_cursor')
    if (seenCursors.has(nextCursor)) throw new Error('模型目录分页响应包含重复 cursor')
    seenCursors.add(nextCursor)
    cursor = nextCursor
  }

  throw new Error(`模型目录分页超过最大页数（${MAX_CONNECT_MODEL_PAGES}）`)
}

/** 目录 model_id 带厂商前缀（anthropic/claude-opus-4.6），网关只认裸名，统一剥掉。 */
export function stripVendorPrefix(id: string) {
  return id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id
}

/**
 * 「立即接入」浮层里 Model 下拉的候选（需求方 shared#322）。
 *
 * 服务端口径：调用方按 tab 传 `coding_tool=claude-code|codex` 给 `/catalog/models`，接口
 * 只返回 `coding_tools` 命中该客户端的模型——QA 的 FakeLLM 夹具（qa-text-*）`coding_tools`
 * 恒为空，不会命中任何客户端，因此天然被排除（qa#583）。这里的 `coding_tools` 检查是
 * 防御性的二次校验，不依赖服务端已经按 tool 筛过。
 */
export function buildConnectModelOptions(items: CatalogModelItem[], tool: 'claude-code' | 'codex'): string[] {
  const ids = items
    .filter((m) => m.status === 'available')
    .filter((m) => m.coding_tools?.includes(tool))
    .map((m) => stripVendorPrefix(m.model_id))
    .filter((id) => id.length > 0)
  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b))
}

export function pickConnectModels(modelIds: string[]): { claudeModel?: string; codexModel?: string } {
  const ids = modelIds.filter((id) => typeof id === 'string' && id.length > 0).map(stripVendorPrefix)

  const versionKey = (id: string) => {
    const m = id.toLowerCase().match(/(\d+(?:[.-]\d+)*)/)
    return m ? m[1].split(/[.-]/).map(Number) : [0]
  }
  const cmpVer = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0)
    }
    return 0
  }
  const claudeTier = (id: string) => {
    const n = id.toLowerCase()
    if (n.includes('opus')) return 3
    if (n.includes('sonnet')) return 2
    if (n.includes('haiku')) return 1
    return 0
  }

  const claudeAll = ids.filter((id) => /claude/i.test(id))
  const claudeNonHaiku = claudeAll.filter((id) => claudeTier(id) !== 1)
  const claudePool = claudeNonHaiku.length ? claudeNonHaiku : claudeAll
  const claudeModel = claudePool
    .slice()
    .sort((a, b) => claudeTier(b) - claudeTier(a) || cmpVer(versionKey(b), versionKey(a)) || a.localeCompare(b))[0]

  const isSmall = (id: string) => /(^|[-_.])(mini|nano|small|lite|tiny)([-_.]|$)/i.test(id)
  const gptAll = ids.filter((id) => /gpt|codex/i.test(id))
  const gptPool = gptAll.filter((id) => !isSmall(id)).length ? gptAll.filter((id) => !isSmall(id)) : gptAll
  const codexModel =
    gptPool.slice().sort((a, b) => cmpVer(versionKey(b), versionKey(a)) || a.localeCompare(b))[0] ??
    claudeModel ??
    ids[0]

  return { claudeModel, codexModel }
}
