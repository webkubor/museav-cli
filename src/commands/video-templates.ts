/** studio-cli video-templates —— 查可用视频模板（配合 gen --video --template） */
import type { StudioClient, CreateVideoTemplateInput } from '../client.js'

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
    const sampleHint = t.sample_video_url ? '有参考视频' : ''
    process.stderr.write(
      `  ${t.id.padEnd(38)} ${(t.zh_name || '').padEnd(20)} ${(t.category || '').padEnd(10)} ${ratioHint.padEnd(6)} ${modelHint.padEnd(30)} ${fieldHint.padEnd(24)} ${sampleHint.padEnd(10)} ${tag(t)}\n`,
    )
    if (t.sample_video_url) {
      process.stderr.write(`      参考视频: ${t.sample_video_url}\n`)
    }
  }
  process.stderr.write(`\n出视频: studio-cli gen --video --template <模板id> [--fields '{"key":"值"}']\n`)
  // stdout 只出 id 和参考视频 URL（tab 分隔），便于脚本与 agent 解析
  console.log(list.map((t) => t.sample_video_url ? `${t.id}\t${t.sample_video_url}` : t.id).join('\n'))
}

interface CreateVideoTemplateOpts {
  name: string
  prompt: string
  category?: string
  description?: string
  model?: string
  duration?: string
  ratio?: string
  sampleVideo?: string
  sampleCover?: string
}

/** studio-cli video-templates create —— 新建视频模板。
 *  视频模板字段跟图片不同：模型/时长/比例在 generation_configs 每项里（服务端契约）。
 *  归属跟图片模板一样由服务端根据鉴权身份自动决定。 */
export async function createVideoTemplate(client: StudioClient, opts: CreateVideoTemplateOpts): Promise<void> {
  if (!opts.name?.trim()) throw new Error('--name 必填')
  if (!opts.prompt?.trim()) throw new Error('--prompt 必填，占位符用 {key} 形式，如 "{product} 在 {scene} 中展示"')

  // 占位符必须声明 fields（中台 validateConfig 硬校验：prompt 里有 {key} 但没 fields 会被拒）
  const keys = Array.from(new Set(Array.from(opts.prompt.matchAll(/\{(\w+)\}/g), (m) => m[1])))
  const fields = keys.map((key) => ({ key, label: key }))

  const cfg: Record<string, unknown> = {
    model: opts.model || 'seedance-2',
    prompt_template: opts.prompt,
    is_default: true,
  }
  if (fields.length) cfg.fields = fields
  if (opts.duration) {
    const d = Number(opts.duration)
    if (!Number.isFinite(d) || d < 4 || d > 15) throw new Error('--duration 必须是 4-15 之间的数字（秒）')
    cfg.duration = d
  }
  if (opts.ratio) cfg.aspect_ratio = opts.ratio

  const row = await client.createVideoTemplate({
    zh_name: opts.name,
    category: opts.category,
    description: opts.description,
    sample_video_url: opts.sampleVideo || null,
    sample_cover_image: opts.sampleCover || null,
    generation_configs: [cfg as CreateVideoTemplateInput['generation_configs'][number]],
  })

  process.stderr.write(`✅ 视频模板已建：${row.id}\n`)
  process.stderr.write(`归属：${row.tenant_id ? '当前租户（其他租户看不到）' : '平台共享（所有租户可见）'}\n`)
  process.stderr.write(`模型: ${cfg.model} 时长: ${cfg.duration || '模板默认'} 比例: ${cfg.aspect_ratio || '模板默认'}\n`)
  if (fields.length) process.stderr.write(`占位符字段: ${fields.map((f) => f.key).join(', ')}\n`)
  process.stderr.write(`\n出视频: studio-cli gen --video --template ${row.id}\n`)
  // stdout 只出新建的模板 id，便于脚本链式使用
  console.log(row.id)
}
