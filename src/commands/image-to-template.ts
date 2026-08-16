/**
 * museav image-to-template —— 一张图 → 一个可复用的图片模板。
 *
 * 跟 reverse 的分工（中台 2026-08-16 拆成两个接口，别再混）：
 *   reverse            只读图：SCULPT 六要素 + 出图 prompt，一次模型调用，同步返回。
 *   image-to-template  读图 + 文字层逆向 + 变量化 + 建模板，原图还会被焊成模板的参考图。
 * 想要哪个就调哪个，没有开关可拨——调用这个命令本身就是「我要模板」的意图。
 *
 * 同步/异步不由 --async 一个人说了算（中台契约 §7.6）：
 *   建模板（默认）或显式 --async → 异步，先拿 jobId 再轮询
 *   --no-create 且没给 --async  → 同步，直接返回草稿
 */
import type { StudioClient, ImageToTemplateResult, JobStep, TemplateField } from '../client.js'
import { isAsyncJob } from '../client.js'

export interface ImageToTemplateOpts {
  /** commander 的 --no-create 会把 create 置 false，默认 true */
  create?: boolean
  name?: string
  slug?: string
  category?: string
  variables?: string
  labels?: string
  async?: boolean
}

const STEP_MARK: Record<JobStep['status'], string> = { running: '🔄', ok: '✅', fail: '❌' }

export async function imageToTemplate(
  client: StudioClient,
  input: string,
  opts: ImageToTemplateOpts = {},
): Promise<void> {
  const isUrl = /^https?:\/\//.test(input)
  const createTemplate = opts.create !== false

  // --variables 收窄白名单：逗号分隔。中台只认它那套通用语义 key（title/subject/location…），
  // 传了白名单外的会被忽略并在 template_warnings 里说明，全都不合法才 400。
  const variables = opts.variables
    ? opts.variables.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined
  if (opts.variables && !variables?.length) {
    throw new Error('--variables 给了但解析不出任何变量名，格式是逗号分隔，如 --variables title,subject,location')
  }

  let variableLabels: Record<string, string> | undefined
  if (opts.labels) {
    try {
      variableLabels = JSON.parse(opts.labels)
    } catch {
      throw new Error(`--labels 必须是合法 JSON 对象，如 '{"subject":"艺人","location":"城市"}'，收到: ${opts.labels}`)
    }
  }

  // 模板元信息全是可选的，一个都没给就整个不传，让中台自己生成 slug / 中文名
  const template = opts.name || opts.slug || opts.category
    ? { zh_name: opts.name, slug: opts.slug, category: opts.category }
    : undefined
  if (template && !createTemplate) {
    process.stderr.write('⚠ --no-create 只看草稿，--name / --slug / --category 不会生效\n')
  }

  process.stderr.write(
    `${createTemplate ? '图生模板' : '图生模板草稿（--no-create，不建模板）'}: ${input}\n`,
  )

  const submitted = await client.imageToTemplate({
    file: isUrl ? undefined : input,
    imageUrl: isUrl ? input : undefined,
    variables,
    variableLabels,
    createTemplate,
    template,
    async: opts.async,
  })

  let result: ImageToTemplateResult
  if (isAsyncJob(submitted)) {
    process.stderr.write(`任务已提交: ${submitted.jobId}\n`)
    // 阶段名去重打印：中台每轮返回的是完整 steps 数组，不过滤的话每 3 秒把同样的阶段重刷一遍
    const printed = new Set<string>()
    result = await client.waitImageToTemplate(submitted.jobId, (steps) => {
      for (const s of steps) {
        const key = `${s.name}:${s.status}`
        if (printed.has(key)) continue
        printed.add(key)
        const cost = s.ms != null ? ` (${(s.ms / 1000).toFixed(1)}s)` : ''
        process.stderr.write(`  ${STEP_MARK[s.status] || '·'} ${s.name}${cost}\n`)
      }
    })
  } else {
    result = submitted
  }

  printResult(result, createTemplate)
}

function printResult(r: ImageToTemplateResult, createTemplate: boolean): void {
  process.stderr.write(`\n✅ 读图完成\n`)
  process.stderr.write(`风格: ${r.zh_name || '-'}  分类: ${r.image_category || '-'}  比例: ${r.aspect_ratio}\n`)
  if (r.style_tags?.length) process.stderr.write(`标签: ${r.style_tags.join(', ')}\n`)

  const layers = r.text_layers || []
  if (layers.length) {
    process.stderr.write(`\n文字层（${layers.length} 处）:\n`)
    for (const l of layers) {
      const varTag = l.is_variable ? `{${l.variable}}` : '固定'
      process.stderr.write(
        `  ${(l.role || '-').padEnd(12)} ${varTag.padEnd(14)} ${(l.position || '').padEnd(12)} ${String(l.content || '').slice(0, 30)}\n`,
      )
    }
  }

  if (r.prompt_template) {
    process.stderr.write(`\n提示词模具:\n  ${r.prompt_template}\n`)
    process.stderr.write(`变量: ${fieldSummary(r.fields)}\n`)
  } else {
    // 中台的降级口径：文字层/变量化/建模板任一步失败都只降级，读图结果照常返回。
    // 所以这里不抛错——上面那段读图结果是真的，用户可以照常拿去出图。
    process.stderr.write(`\n⚠ 没能做出提示词模具${r.template_error ? `：${r.template_error}` : ''}\n`)
    process.stderr.write(`  读图结果仍然有效，可直接用下面的 prompt 出图\n`)
  }

  for (const w of r.template_warnings || []) process.stderr.write(`⚠ ${w}\n`)

  if (r.template) {
    process.stderr.write(`\n✅ 模板已建：${r.template.id}\n`)
    process.stderr.write(`  slug: ${r.template.slug}  名称: ${r.template.zh_name}\n`)
    process.stderr.write(`  归属：${r.template.tenant_id ? '当前租户（其他租户看不到）' : '平台共享（所有租户可见）'}\n`)
    if (r.template.reference_image) process.stderr.write(`  参考图（已焊进模板）: ${r.template.reference_image}\n`)
    const example = r.fields?.length ? ` --fields '{"${r.fields[0].key}":"..."}'` : ''
    process.stderr.write(`\n出图: museav gen --template ${r.template.id}${example}\n`)
    // stdout 只出模板 id，跟 templates create 一致，便于脚本链式使用
    console.log(r.template.id)
    return
  }

  if (createTemplate && r.template_error) {
    process.stderr.write(`\n❌ 模板没建成：${r.template_error}\n`)
  } else if (!createTemplate) {
    process.stderr.write(`\n这是草稿（--no-create）。满意的话去掉 --no-create 重跑一次即可建成模板。\n`)
  }
  // 没建成模板时 stdout 给完整草稿 JSON——脚本还能拿它自己调 POST /api/templates
  console.log(JSON.stringify(r))
}

function fieldSummary(fields?: TemplateField[]): string {
  if (!fields?.length) return '(无)'
  return fields.map((f) => (f.label && f.label !== f.key ? `${f.key}(${f.label})` : f.key)).join(', ')
}
