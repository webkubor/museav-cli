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
export function pickConnectModels(modelIds: string[]): { claudeModel?: string; codexModel?: string } {
  const stripVendor = (id: string) => (id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id)
  const ids = modelIds.filter((id) => typeof id === 'string' && id.length > 0).map(stripVendor)

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
