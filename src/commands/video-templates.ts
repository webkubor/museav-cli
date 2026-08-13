/** studio-cli video-templates —— 查可用视频模板（配合 gen --video --template） */
import type { StudioClient } from '../client.js'

export async function videoTemplates(client: StudioClient, opts: { category?: string } = {}): Promise<void> {
  let list = await client.videoTemplates()
  if (opts.category) {
    const kw = opts.category.toLowerCase()
    list = list.filter((t) => (t.category || '').toLowerCase().includes(kw))
  }
  if (!list.length) {
    process.stderr.write(opts.category ? `没有匹配「${opts.category}」的视频模板\n` : '没有可用视频模板\n')
    return
  }

  const tag = (t: (typeof list)[number]) => (t.tenant_id ? '' : '[平台]')

  process.stderr.write(`可用视频模板（${list.length} 个）:\n`)
  for (const t of list) {
    const cfg = t.generation_configs?.find((c) => c.is_default) || t.generation_configs?.[0]
    const modelHint = cfg?.model ? `模型:${cfg.model}` : ''
    const ratioHint = t.ratio || ''
    const fieldCount = cfg?.params_json?.fields?.length || 0
    const fieldHint = fieldCount ? `字段:${cfg!.params_json!.fields!.map((f) => f.key).join(',')}` : ''
    process.stderr.write(
      `  ${t.id.padEnd(38)} ${(t.zh_name || '').padEnd(20)} ${(t.category || '').padEnd(10)} ${ratioHint.padEnd(6)} ${modelHint.padEnd(30)} ${fieldHint.padEnd(24)} ${tag(t)}\n`,
    )
  }
  process.stderr.write(`\n出视频: studio-cli gen --video --template <模板id> [--fields '{"key":"值"}']\n`)
  // stdout 只出 id，便于脚本与 agent 解析
  console.log(list.map((t) => t.id).join('\n'))
}
