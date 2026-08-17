/** museav templates —— 查可用图片/文字模板（自己租户建的 + 平台共享的）
 *  --type image|article 可过滤（中台 templates 表同时装两种，不传则都列并标注类型） */
import type { StudioClient } from '../client.js'

export async function templates(client: StudioClient, opts: { category?: string; type?: string } = {}): Promise<void> {
  let list = await client.templates((opts.type === 'image' || opts.type === 'article') ? opts.type : undefined)
  if (opts.category) {
    const kw = opts.category.toLowerCase()
    list = list.filter((t) => (t.category || '').toLowerCase().includes(kw))
  }
  if (!list.length) {
    process.stderr.write(opts.category ? `没有匹配「${opts.category}」的模板\n` : '没有可用模板\n')
    return
  }

  const tag = (t: (typeof list)[number]) => (t.tenant_id ? '' : '[平台]')
  const typeTag = (t: (typeof list)[number]) => (t.template_type === 'article' ? '[文字]' : t.template_type === 'image' ? '[图片]' : '')

  process.stderr.write(`可用模板（${list.length} 个）:\n`)
  for (const t of list) {
    const cfg = t.generation_configs?.find((c) => c.is_default) || t.generation_configs?.[0]
    // fields 新契约在 config 顶层（CLI 自己 create 就写顶层），老数据在 params_json 里——两种都兜
    const fields = cfg?.fields || cfg?.params_json?.fields || []
    const fieldHint = fields.length ? `字段:${fields.map((f) => f.key).join(',')}` : ''
    process.stderr.write(
      `  ${t.id.padEnd(38)} ${(t.zh_name || '').padEnd(16)} ${(t.category || '').padEnd(10)} ${(t.ratio || '').padEnd(6)} ${typeTag(t).padEnd(8)} ${fieldHint.padEnd(20)} ${tag(t)}\n`,
    )
  }
  process.stderr.write(`\n出图: museav gen --template <模板id> [--fields '{"key":"值"}']\n`)
  process.stderr.write(`按类型过滤: museav templates --type image|article\n`)
  // stdout 只出 id，便于脚本与 agent 解析
  console.log(list.map((t) => t.id).join('\n'))
}

interface CreateTemplateOpts {
  name: string
  prompt: string
  category?: string
  ratio?: string
  description?: string
  model?: string
  quality?: string
  fields?: string
  type?: string
}

/**
 * museav templates create —— 新建图片模板。
 *
 * 归属不用自己传：服务端根据鉴权身份自动决定——租户 apiKey 建的自动归该租户
 * （其他租户看不到），平台管理员 JWT 建的是 tenant_id=null 的平台共享模板，
 * 个人账号（无租户、非管理员）会被服务端拒绝。CLI 这里不做额外判断，直接把
 * 服务端返回的结果（含真实归属）打印出来。
 */
export async function createTemplate(client: StudioClient, opts: CreateTemplateOpts): Promise<void> {
  if (!opts.name?.trim()) throw new Error('--name 必填')
  if (!opts.prompt?.trim()) throw new Error('--prompt 必填，占位符用 {key} 形式，如 "{artist} 在 {city} 的演唱会海报"')

  let fields: Array<{ key: string; label: string }>
  if (opts.fields) {
    try {
      fields = JSON.parse(opts.fields)
    } catch {
      throw new Error('--fields 必须是合法 JSON 数组，如 \'[{"key":"artist","label":"艺人名"}]\'')
    }
  } else {
    // 不传 --fields 就自动从 --prompt 里的 {key} 占位符提取，label 先等于 key，
    // 想要更友好的中文标签可以自己传 --fields 覆盖
    const keys = Array.from(new Set(Array.from(opts.prompt.matchAll(/\{(\w+)\}/g), (m) => m[1])))
    fields = keys.map((key) => ({ key, label: key }))
  }

  const type = opts.type === 'article' ? 'article' : 'image'
  const row = await client.createTemplate({
    zh_name: opts.name,
    category: opts.category,
    ratio: opts.ratio,
    description: opts.description,
    template_type: type,
    generation_configs: [
      {
        model: opts.model || 'gpt-image-2',
        prompt_template: opts.prompt,
        quality: opts.quality,
        // 契约要求 fields 在 config 顶层（服务端 validateConfig 读 cfg.fields）
        fields: fields.length ? fields : undefined,
        is_default: true,
      },
    ],
  })

  process.stderr.write(`✅ ${type === 'article' ? '文字' : '图片'}模板已建：${row.id}\n`)
  process.stderr.write(`归属：${row.tenant_id ? '当前租户（其他租户看不到）' : '平台共享（所有租户可见）'}\n`)
  if (fields.length) process.stderr.write(`占位符字段: ${fields.map((f) => f.key).join(', ')}\n`)
  const fieldExample = fields.length ? ` --fields '{"${fields[0].key}":"..."}'` : ''
  process.stderr.write(`\n出图: museav gen --template ${row.id}${fieldExample}\n`)
  // stdout 只出新建的模板 id，便于脚本链式使用
  console.log(row.id)
}
