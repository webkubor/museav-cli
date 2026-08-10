/**
 * studio-cli products —— 查所属租户自己的产品目录。
 *
 * 数据不在 Studio 中台，在租户自己的后台（见 ../tenant-client.ts 顶部注释）。
 * 不是每个租户都有"产品"这个概念——比如好易美是演唱会海报/票务业务，没有实体商品，
 * 它的后台没有开通这个端点，调用会报错，这是预期行为，不是 bug。
 */
import type { TenantClient } from '../tenant-client.js'

interface TenantProduct {
  id: string
  name: string
  series?: string | null
  status?: string | null
  active?: boolean
  cover_image_url?: string | null
  images?: string[]
  [key: string]: unknown
}

export async function products(client: TenantClient): Promise<void> {
  const list = await client.get<TenantProduct[]>('tenant-products')
  if (!Array.isArray(list) || !list.length) {
    process.stderr.write('该租户暂无产品数据\n')
    console.log('[]')
    return
  }
  process.stderr.write(`产品（${list.length} 个）:\n`)
  for (const p of list) {
    const imgCount = (p.images?.length || 0) + (p.cover_image_url ? 1 : 0)
    process.stderr.write(
      `  ${String(p.id).padEnd(38)} ${(p.name || '').padEnd(20)} ${(p.series || '').padEnd(12)} ${(p.status || '').padEnd(10)} 图${imgCount}张\n`,
    )
  }
  process.stderr.write(`\n配合出图: studio-cli gen --template <模板id> --fields '{"...":"..."}'（参考图 URL 从上面产品的 cover_image_url / images 里挑）\n`)
  // stdout 输出完整 JSON，方便 agent/脚本挑参考图字段
  console.log(JSON.stringify(list))
}
