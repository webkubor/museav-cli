/**
 * museav poster-templates —— 版式模板库（租户级资产）。
 *  封面底图 + 固定描述（{城市} {明星} 占位符），选版式时把城市/明星名填进底图。
 *  学员做的封面版式保存后全租户共享。
 */
import type { StudioClient } from '../client.js'

export async function posterTemplates(client: StudioClient): Promise<void> {
  const list = await client.posterTemplates()
  if (!list.length) {
    process.stderr.write('没有版式模板（可用 museav poster-templates add <底图> --name <名称> --prompt <描述> 保存）\n')
    return
  }
  process.stderr.write(`版式模板（${list.length} 个）:\n`)
  for (const t of list) {
    process.stderr.write(`  ${t.id.padEnd(38)} ${String(t.name || '').padEnd(18)} ${String(t.prompt || '').slice(0, 40)}\n`)
  }
  process.stderr.write(`\n保存: museav poster-templates add <底图路径> --name <名称> --prompt <描述>\n`)
  console.log(list.map((t) => t.id).join('\n'))
}

export async function createPosterTemplate(
  client: StudioClient,
  filePath: string,
  opts: { name: string; prompt: string },
): Promise<void> {
  if (!opts.name?.trim()) throw new Error('--name 必填')
  if (!opts.prompt?.trim()) throw new Error('--prompt 必填，{城市} {明星} 占位符会被替换')
  const row = await client.createPosterTemplate(filePath, opts.name, opts.prompt)
  const id = row?.template?.id || row?.id || ''
  process.stderr.write(`✅ 版式模板已保存：${id}\n`)
  console.log(id)
}
