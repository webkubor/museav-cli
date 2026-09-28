/** museav templates —— 查可用图片/文字模板。
 *  --type image|article 按类型过滤
 *  --mine 只看本租户建的；--platform 只看平台共享的；都不传则全部列出
 *  --category 按分类过滤 */
import type { StudioClient } from '../client.js'

export async function templates(client: StudioClient, opts: { category?: string; type?: string; mine?: boolean; tenant?: boolean; platform?: boolean } = {}): Promise<void> {
  const type = opts.type === 'image' || opts.type === 'article' ? opts.type : undefined
  // 三个归属维度都走服务端 source 参数（正式 API，不再客户端猜）：
  //   --mine     → source=personal（created_by = 当前账户邮箱，我这个人建的）
  //   --tenant   → source=mine（本租户专属）
  //   --platform → source=platform（平台共享）
  let list: Awaited<ReturnType<StudioClient['templates']>>
  if (opts.mine) {
    list = await client.templates(type, 'personal')
  } else if (opts.tenant) {
    list = await client.templates(type, 'mine')
  } else if (opts.platform) {
    list = await client.templates(type, 'platform')
  } else {
    list = await client.templates(type)
  }
  if (opts.category) {
    const kw = opts.category.toLowerCase()
    list = list.filter((t) => (t.category || '').toLowerCase().includes(kw))
  }
  if (!list.length) {
    process.stderr.write(opts.category ? `没有匹配「${opts.category}」的模板\n` : '没有可用模板\n')
    return
  }

  const tag = (t: (typeof list)[number]) => {
    if (t.source === 'personal') return '[个人]'
    if (t.tenant_id) return '[租户]'
    return '[平台]'
  }
  const typeTag = (t: (typeof list)[number]) => (t.template_type === 'article' ? '[文字]' : t.template_type === 'image' ? '[图片]' : '')
  // 版本号 2026-09-28 才有，早于那天的服务端响应不带这个字段；缺了就标「—」而不是假装有版本
  const versionTag = (t: (typeof list)[number]) => t.version || '—'
  // 创建人是自由文本（人名 / 账号 / 邮箱都出现过），这里只做截断展示，完整值以接口为准
  const creatorTag = (t: (typeof list)[number]) => (t.created_by || '—')

  process.stderr.write(`可用模板（${list.length} 个）:\n`)
  for (const t of list) {
    const cfg = t.generation_configs?.find((c) => c.is_default) || t.generation_configs?.[0]
    // fields 新契约在 config 顶层（CLI 自己 create 就写顶层），老数据在 params_json 里——两种都兜
    const fields = cfg?.fields || cfg?.params_json?.fields || []
    const fieldHint = fields.length ? `字段:${fields.map((f) => f.key).join(',')}` : ''
    process.stderr.write(
      `  ${t.id.padEnd(36)} ${(t.zh_name || '').padEnd(16)} ${versionTag(t).padEnd(7)} ${creatorTag(t).padEnd(10)} ` +
      `${(t.category || '').padEnd(8)} ${(t.ratio || '').padEnd(6)} ${typeTag(t).padEnd(8)} ${fieldHint.padEnd(18)} ${tag(t)}\n`,
    )
  }
  process.stderr.write(`\n出图: museav gen --template <模板id> [--fields '{"key":"值"}']\n`)
  process.stderr.write(`筛选: --mine(我建的) --tenant(本租户) --platform(平台共享) --type image|article --category <分类>\n`)
  // stdout 只出 id，便于脚本与 agent 解析
  console.log(list.map((t) => t.id).join('\n'))
}

interface CreateTemplateOpts {
  name: string
  prompt: string
  category?: string
  ratio?: string
  description?: string
  quality?: string
  fields?: string
  type?: string
  /** 参考图直链，1–5 张。可重复传：--ref url1 --ref url2
   *  建模板时不是硬校验（可以先建空壳再迭代），但**开放到公共池时必须有**（见 publish）*/
  ref?: string[]
}

/** 单模板最多几张参考图（与服务端模板库门槛一致，2026-09-28 owner 定） */
const MAX_REF_IMAGES = 5

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
  const refs = (opts.ref || []).filter(Boolean)
  if (refs.length > MAX_REF_IMAGES) {
    throw new Error(`参考图 ${refs.length} 张，超出上限 ${MAX_REF_IMAGES} 张（--ref 最多传 ${MAX_REF_IMAGES} 个）`)
  }
  const { row, warnings } = await client.createTemplate({
    zh_name: opts.name,
    category: opts.category,
    ratio: opts.ratio,
    description: opts.description,
    template_type: type,
    generation_configs: [
      {
        // 恒为 auto：用哪个模型是**中台**的事（中台做的就是智能路由）。
        // CLI 不再提供 --model —— 服务端对非管理员传的 model 一律忽略，
        // 留着这个 flag 只会让人以为能选（界面在说谎）。
        // 模板是长期资产，锁死模型名还会在上游换代时变成悬空引用
        //（toapis 下线时 10 个视频模板就是这么悬空的）。
        model: 'auto',
        prompt_template: opts.prompt,
        quality: opts.quality,
        // 契约要求 fields 在 config 顶层（服务端 validateConfig 读 cfg.fields）
        fields: fields.length ? fields : undefined,
        // 模板自带参考图。三类模板的参考图语义不同（owner 2026-09-28）：
        //   文生图模板 → 只作风格/构图参考，不进垫图
        //   图生图模板 → 参考图就是垫图本身，生图基于它衍生
        //   混合      → 由中台按 ref_slots 决定喂哪些
        default_reference_images: refs.length ? refs : undefined,
        is_default: true,
      },
    ],
  })

  process.stderr.write(`✅ ${type === 'article' ? '文字' : '图片'}模板已建：${row.id}\n`)
  // 同质度警告（相似度 80%-95% 区间，中台不拦但提醒确认）：明确打出来，不能建完就当没这回事
  for (const w of warnings || []) process.stderr.write(`⚠️ ${w}\n`)
  process.stderr.write(`归属：${row.tenant_id ? '当前租户（其他租户看不到）' : '平台共享（所有租户可见）'}\n`)
  // 版本与创建人一并回显：建完就该知道这条模板在库里的身份，而不是回头去查
  process.stderr.write(`版本：${row.version || 'v1.0.0（服务端默认）'}\n`)
  process.stderr.write(`创建人：${row.created_by || '（未记录，通常是租户侧建模板时没填）'}\n`)
  if (fields.length) process.stderr.write(`占位符字段: ${fields.map((f) => f.key).join(', ')}\n`)
  process.stderr.write(`参考图：${refs.length ? `${refs.length} 张` : '无'}\n`)
  if (!refs.length) {
    process.stderr.write(
      `  ⚠️ 没传参考图。建模板不强制，但「开放到公共池」时必须有（1–${MAX_REF_IMAGES} 张）——\n` +
      `     museav templates publish ${row.id} 会被服务端门槛挡下来。\n`,
    )
  }
  const fieldExample = fields.length ? ` --fields '{"${fields[0].key}":"..."}'` : ''
  process.stderr.write(`\n出图: museav gen --template ${row.id}${fieldExample}\n`)
  if (refs.length) {
    process.stderr.write(`开放到公共池: museav templates publish ${row.id}\n`)
  }
  // stdout 只出新建的模板 id，便于脚本链式使用
  console.log(row.id)
}

/**
 * museav templates delete —— 删除自己的模板。
 *
 * ⚠️ 服务端会区分两种结果（owner 2026-09-28）：
 *   hard_deleted=true  → 物理删除，干净
 *   hard_deleted=false → 有出图历史，只停用 active=false 保留追溯链路
 * 只删别人建的要平台管理员权限，CLI 不做前置判断，让服务端说了算。
 */
export async function deleteTemplate(client: StudioClient, id: string): Promise<void> {
  if (!id?.trim()) throw new Error('用法: museav templates delete <模板id>')
  const r = await client.deleteTemplate(id)
  if (r.hard_deleted) {
    process.stderr.write(`✅ 已删除：${id}\n`)
  } else {
    process.stderr.write(`⚠️ 未物理删除：${r.reason || '该模板有出图历史'}\n`)
    process.stderr.write(`   已改为停用（active=false），历史出图记录仍能查到当时用的哪个模板。\n`)
  }
}

/**
 * museav templates publish / unshare —— 控制模板可见性。
 *
 * publish（私有 → 平台共享/租户共享）会过服务端发布门槛：
 *   参考图 1–5 张、ratio/category/description 齐全、prompt_template 的占位符都已在 fields 声明
 * 不达标返回 422 并列出差哪几项。unshare 是收紧方向，不校验。
 */
export async function shareTemplate(client: StudioClient, id: string, action: 'share' | 'unshare'): Promise<void> {
  if (!id?.trim()) throw new Error(`用法: museav templates ${action === 'share' ? 'publish' : 'unshare'} <模板id>`)
  const r = await client.shareTemplate(id, action)
  if (r.tenant_id) {
    process.stderr.write(`✅ 已开放：同租户成员现在可以使用这个模板（tenant_id=${r.tenant_id}）\n`)
  } else {
    process.stderr.write('✅ 已开放：所有租户现在可以使用这个模板\n')
  }
}
