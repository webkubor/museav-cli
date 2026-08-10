/** studio-cli templates —— 查可用图片模板（自己租户建的 + 平台共享的） */
import type { StudioClient } from '../client.js'

export async function templates(client: StudioClient, opts: { category?: string } = {}): Promise<void> {
  let list = await client.templates()
  if (opts.category) {
    const kw = opts.category.toLowerCase()
    list = list.filter((t) => (t.category || '').toLowerCase().includes(kw))
  }
  if (!list.length) {
    process.stderr.write(opts.category ? `没有匹配「${opts.category}」的模板\n` : '没有可用模板\n')
    return
  }

  const tag = (t: (typeof list)[number]) => (t.tenant_id ? '' : '[平台]')

  process.stderr.write(`可用模板（${list.length} 个）:\n`)
  for (const t of list) {
    const cfg = t.generation_configs?.find((c) => c.is_default) || t.generation_configs?.[0]
    const fields = cfg?.params_json?.fields || []
    const fieldHint = fields.length ? `字段:${fields.map((f) => f.key).join(',')}` : ''
    process.stderr.write(
      `  ${t.id.padEnd(38)} ${(t.zh_name || '').padEnd(16)} ${(t.category || '').padEnd(10)} ${(t.ratio || '').padEnd(6)} ${fieldHint.padEnd(20)} ${tag(t)}\n`,
    )
  }
  process.stderr.write(`\n出图: studio-cli gen --template <模板id> [--fields '{"key":"值"}']\n`)
  // stdout 只出 id，便于脚本与 agent 解析
  console.log(list.map((t) => t.id).join('\n'))
}
