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
import type { CatalogModelItem } from '@/types'

/** 目录 model_id 带厂商前缀（anthropic/claude-opus-4.6），网关只认裸名，统一剥掉。 */
export function stripVendorPrefix(id: string) {
  return id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id
}

/**
 * 「立即接入」浮层里 Model 下拉的候选（需求方 shared#322）。
 *
 * 【为什么是近似过滤，而不是照抄 PRD】
 * PRD 原型给每个模型手工标了「这个模型能拿去喂哪个编程客户端」（claude-code / codex），
 * 下拉是「协议对得上」+「这个客户端能用」两个条件一起筛出来的。
 * 我们的 catalog 没有第二个条件——它只告诉你模型支持哪些协议（openai / anthropic），
 * 不告诉你它适不适合当编程客户端的模型。所以这里只能筛两件能筛的事：
 *   1. 协议：由调用方按 tab 传 protocol 给接口筛（Claude Code / CC Switch=anthropic，Codex=openai）
 *   2. 出文本：编程客户端要的是对话模型，出图 / 出视频 / embedding 选了必然报错，本地剔掉
 *
 * 【这样近似会漏什么】
 * 协议对、也出文本、但实际不该给用户当编程模型用的，仍然会留在下拉里
 * （典型是测试环境的 FakeLLM 夹具 qa-text-*）。要根治得由后端补字段，已落单 qa#583：
 * 补 `coding_tools` 或更通用的「是否对外可见」，到位后把下面的 filter 换掉即可，UI 不用动。
 */
export function buildConnectModelOptions(items: CatalogModelItem[]): string[] {
  const ids = items
    .filter((m) => m.status === 'available')
    .filter((m) => !m.output_modalities?.length || m.output_modalities.includes('text'))
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
