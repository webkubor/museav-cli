/**
 * studio-cli assets —— 查所属租户自己的素材/资产库。
 *
 * 数据不在 Studio 中台，在租户自己的后台（见 ../tenant-client.ts 顶部注释）。
 *
 * 【响应形状故意没有统一】两个已接入租户的"素材"根本不是一回事：
 *   - 好易美（hym）：明星素材库 + 贴图库两张互不关联的表 → 返回
 *     { celebrity_materials: [...], stickers: [...] }
 *   - mzmeso：品牌素材库 brand_assets 一张表 → 返回扁平数组 [...]
 * 调查过程中发现二者字段/数量级差异很大，硬凑成一种格式只会两边都不像，所以这里
 * 按响应形状分别展示，而不是假装它们是同一种资源。
 */
import type { TenantClient } from '../tenant-client.js'

export async function assets(client: TenantClient): Promise<void> {
  const data = await client.get<unknown>('tenant-assets')

  if (Array.isArray(data)) {
    if (!data.length) {
      process.stderr.write('该租户暂无素材数据\n')
      console.log('[]')
      return
    }
    process.stderr.write(`素材（${data.length} 个）:\n`)
    for (const a of data as Array<Record<string, unknown>>) {
      process.stderr.write(`  ${String(a.id).padEnd(38)} ${String(a.category || '').padEnd(14)} ${String(a.name || '')}\n`)
    }
    console.log(JSON.stringify(data))
    return
  }

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown[]>
    for (const [group, rows] of Object.entries(obj)) {
      const list = Array.isArray(rows) ? rows : []
      process.stderr.write(`${group}（${list.length} 个）:\n`)
      for (const r of list as Array<Record<string, unknown>>) {
        process.stderr.write(`  ${String(r.id).padEnd(38)} ${String(r.name || r.artist || '')}\n`)
      }
    }
    console.log(JSON.stringify(obj))
    return
  }

  process.stderr.write('返回数据格式未知，原样输出到 stdout\n')
  console.log(JSON.stringify(data))
}
