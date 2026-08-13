/** studio-cli gen —— 出图 / 出视频（核心命令） */
import type { StudioClient } from '../client.js'

export async function gen(client: StudioClient, opts: {
  prompt?: string
  skill?: string
  input?: string
  template?: string
  fields?: string
  ratio?: string
  model?: string
  quality?: string
  ref?: string
  // 视频
  video?: boolean
  duration?: number
  image?: string
}): Promise<void> {
  // prompt / skill / template 三选一。commander 不好表达互斥，在这里校验，报错要说清怎么改
  const picked = [opts.prompt, opts.skill, opts.template].filter(Boolean).length
  if (picked === 0) {
    throw new Error('需要 --prompt "完整提示词" 或 --skill <技能名>（studio-cli skills 查）或 --template <模板id>（studio-cli templates 查）')
  }
  if (picked > 1) {
    throw new Error('--prompt / --skill / --template 只能给一个：分别对应自己写提示词、用中台技能展开、用图片模板展开')
  }
  if (opts.input && !opts.skill) {
    throw new Error('--input 是配合 --skill 的业务描述；只写提示词请用 --prompt')
  }
  if (opts.fields && !opts.template) {
    throw new Error('--fields 是配合 --template 的占位符取值；用技能请用 --input')
  }
  if (opts.video && opts.skill) {
    throw new Error('--video 暂不支持配合 --skill（视频模板走 --template 或直接 --prompt）')
  }
  let templateFields: Record<string, string> | undefined
  if (opts.fields) {
    try {
      templateFields = JSON.parse(opts.fields)
    } catch {
      throw new Error(`--fields 必须是合法 JSON 对象，如 '{"artist":"王嘉尔","city":"南京"}'，收到: ${opts.fields}`)
    }
  }

  // 可选：先上传垫图（图片出图 --ref / 视频图生视频 --image 都走这里）
  let referenceImage: string | undefined
  const refPath = opts.ref || opts.image
  if (refPath) {
    process.stderr.write(`上传垫图 ${refPath} ...\n`)
    const up = await client.uploadRef(refPath)
    referenceImage = up.url
    process.stderr.write(`垫图就绪: ${referenceImage}\n`)
  }

  // ── 视频模式：走 /api/videos 独立链路 ──
  if (opts.video) {
    if (opts.quality) throw new Error('--quality 仅图片出图支持')
    if (opts.skill) throw new Error('--video 暂不支持配合 --skill（视频模板走 --template，清单用 studio-cli video-templates 查）')
    process.stderr.write(
      `提交视频: ${opts.template ? `模板 ${opts.template}` : opts.prompt?.slice(0, 40) || ''}${opts.image ? ' · 图生视频' : ''}\n`,
    )
    const { jobId } = await client.generateVideo({
      prompt: opts.prompt,
      model: opts.model,
      ratio: opts.ratio,
      duration: opts.duration,
      image_url: referenceImage,
      template_id: opts.template,
      input: templateFields,
    })
    process.stderr.write(`视频任务已提交: ${jobId}\n生成中（视频通常 1-5 分钟）...\n`)
    const result = await client.waitVideo(jobId, (status) => {
      if (status === 'processing') process.stderr.write('生成中...\r')
    })
    if (result.status !== 'completed' || !result.cdn_url) {
      throw new Error(`视频生成失败: ${result.error || '未知原因'}`)
    }
    process.stderr.write(`✅ 视频完成\n`)
    console.log(result.cdn_url)
    return
  }

  // ── 图片模式（原逻辑）──
  process.stderr.write(
    opts.skill
      ? `提交出图: 技能 ${opts.skill}${opts.input ? ` · ${opts.input.slice(0, 30)}` : '（未给描述，按技能规范自由发挥）'}\n`
      : opts.template
        ? `提交出图: 模板 ${opts.template}${templateFields ? ` · ${JSON.stringify(templateFields).slice(0, 40)}` : ''}\n`
        : `提交出图: ${opts.prompt!.slice(0, 40)}...\n`,
  )
  const job = await client.generateAndWait(
    {
      prompt: opts.prompt,
      skill_slug: opts.skill,
      input: opts.input,
      template_id: opts.template,
      template_fields: templateFields,
      ratio: opts.ratio,
      model: opts.model,
      quality: opts.quality as 'low' | 'medium' | 'high' | undefined,
      reference_image: referenceImage,
    },
    (status) => {
      if (status === 'processing') process.stderr.write('生成中...\r')
    },
  )

  // 成功：图片 URL 输出到 stdout（便于管道），元信息到 stderr
  process.stderr.write(`✅ 完成 (${job.elapsed_ms ? (job.elapsed_ms / 1000).toFixed(1) + 's' : '?'})\n`)
  console.log(job.cdn_url)
}
