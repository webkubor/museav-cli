/**
 * museav stickers —— 贴图素材库（租户级资产）。
 *  PNG 透明装饰图（logo/花纹/边框），叠加在海报/封面上。
 *  列出的都是自己租户的贴图；上传用账户 Key 或租户 Key 均可（落到本租户）。
 */
import type { StudioClient } from '../client.js'

export async function stickers(client: StudioClient): Promise<void> {
  const list = await client.stickers()
  if (!list.length) {
    process.stderr.write('没有贴图素材（可用 museav stickers add <图片> --name <名称> 上传）\n')
    return
  }
  process.stderr.write(`贴图素材（${list.length} 个）:\n`)
  for (const s of list) {
    process.stderr.write(`  ${s.id.padEnd(38)} ${String(s.name || '').padEnd(20)} ${s.url || ''}\n`)
  }
  process.stderr.write(`\n上传: museav stickers add <图片路径> --name <名称>\n`)
  // stdout 只出 id，便于脚本与 agent 解析
  console.log(list.map((s) => s.id).join('\n'))
}

export async function createSticker(client: StudioClient, filePath: string, opts: { name: string }): Promise<void> {
  if (!opts.name?.trim()) throw new Error('--name 必填')
  const row = await client.createSticker(filePath, opts.name)
  const id = row?.sticker?.id || row?.id || ''
  process.stderr.write(`✅ 贴图素材已上传：${id}\n`)
  console.log(id)
}
