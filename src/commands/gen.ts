/** museav gen —— 出图 / 出视频（核心命令） */
import { readFileSync } from 'node:fs'
import type { StudioClient } from '../client.js'
import { resolveWorkspace } from './projects.js'

/** 与中台/各租户后台口径一致：一次最多 5 张参考图 */
const MAX_REFS = 5

/** 视频参考素材上限（上游官方数字，中台按同一套校验）：图 ≤9、视频 ≤3、音频 ≤3 */
const MAX_REF_IMAGES = 9
const MAX_REF_VIDEOS = 3
const MAX_REF_AUDIOS = 3

/** 中台 /api/generate-batch 的单批上限；更大批量 CLI 自动分批 */
const BATCH_CHUNK = 32

/** 读批量文件：每行一条，空行和 # 注释行跳过。'-' 读 stdin。 */
function readBatchLines(file: string): string[] {
  const raw = file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8')
  return raw.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
}

/**
 * 素材入参（本地文件或 http(s) 直链）→ 中台 URL 数组。gen 与 enhance 共用。
 *
 * 直链（典型来源：museav projects assets 的素材库 URL）本身就是中台 CDN 地址，
 * 直接用，不再绕一趟上传。本地路径走 uploadRef（图片会先压到视觉模型够用的尺寸）。
 * **串行不并发**：顺序即语义——提示词里写「参考图片1…图片2…」时，第 N 个参数
 * 对应的就是第 N 张，并发抢跑会把这个对应关系打乱。
 */
export async function resolveMediaUrls(client: StudioClient, sources: string[], label: string): Promise<string[]> {
  const urls: string[] = []
  for (const [i, src] of sources.entries()) {
    if (/^https?:\/\//.test(src)) {
      urls.push(src)
      process.stderr.write(`  ${label}${i + 1} 直链: ${src}\n`)
      continue
    }
    process.stderr.write(`上传${label} [${label}${i + 1}] ${src} ...\n`)
    const up = await client.uploadRef(src)
    urls.push(up.url)
    process.stderr.write(`  ${label}${i + 1} 就绪: ${up.url}\n`)
  }
  return urls
}

/**
 * 批量提交 + 撞频控自动补交：items 与返回的 jobId/错误数组等长（保持顺序）。
 * 服务端对频控的处理是「后续项 skipped + retry_after_sec」，这里睡够后只把
 * skipped 的行回池补交——已拿到 jobId 的绝不重发（重发就是重复扣费）。
 */
async function submitBatch(
  client: StudioClient,
  items: Array<Record<string, unknown>>,
  defaults: Record<string, unknown>,
): Promise<Array<{ jobId?: string; error?: string }>> {
  const out: Array<{ jobId?: string; error?: string }> = items.map(() => ({}))
  let pending = items.map((_, i) => i)
  let rounds = 0
  while (pending.length && rounds++ < 20) {
    const retryable = new Set<number>()
    let cooldown = 0
    for (let c = 0; c < pending.length; c += BATCH_CHUNK) {
      const chunkIdx = pending.slice(c, c + BATCH_CHUNK)
      const res = await client.generateBatch(
        chunkIdx.map((i) => items[i]),
        defaults,
      )
      chunkIdx.forEach((itemIdx, k) => {
        const r = res.results[k]
        if (r?.ok && r.jobId) {
          out[itemIdx] = { jobId: r.jobId }
          process.stderr.write(`  [${itemIdx + 1}/${items.length}] 已提交 ${r.jobId.slice(0, 8)}\n`)
        } else if (r?.skipped && res.retry_after_sec) {
          retryable.add(itemIdx)
        } else {
          out[itemIdx] = { error: r?.error || r?.reason || `HTTP ${r?.status}` }
          process.stderr.write(`  [${itemIdx + 1}/${items.length}] 失败: ${out[itemIdx].error}\n`)
        }
      })
      if (res.retry_after_sec) cooldown = Math.max(cooldown, res.retry_after_sec)
    }
    pending = [...retryable]
    if (pending.length && cooldown) {
      process.stderr.write(`  频控冷却 ${cooldown}s 后补交剩余 ${pending.length} 项...\n`)
      await new Promise((resolve) => setTimeout(resolve, cooldown * 1000))
    }
  }
  out.forEach((o) => { if (!o.jobId && !o.error) o.error = '重试次数用尽仍未提交' })
  return out
}

export async function gen(client: StudioClient, opts: {
  prompt?: string
  skill?: string
  input?: string
  template?: string
  fields?: string
  ratio?: string
  quality?: string
  // 指定模型 / 视频档次（对外名）。图片与视频都收：不传时出图由技能/模板/路由决定，
  // 视频走中台智能路由。中台负责把对外名归一回内部渠道代号。
  model?: string
  ref?: string[]      // 可重复：--ref a.jpg --ref b.jpg，顺序即「图片1、图片2…」
  transparent?: boolean   // 透明背景 PNG；能不能做由中台按上游能力判定，做不了会明确报错
  project?: string    // 工作区 id|名：生成结果归档进该项目（账户身份才生效）
  // 批量：文件每行一条（'- 读 stdin'），走 /api/generate-batch，只支持图片
  batch?: string
  // 视频
  video?: boolean
  duration?: number
  image?: string
  // 视频高级输入（H3/Seedance）。首尾帧与参考素材**互斥**，上限见 MAX_REF_*
  lastFrame?: string          // --last-frame：尾帧（本地文件自动上传）
  referenceImage?: string[]   // --reference-image，可重复，≤9
  referenceVideo?: string[]   // --reference-video，可重复，≤3（文件或直链）
  referenceAudio?: string[]   // --reference-audio，可重复，≤3（文件或直链）
  enhance?: boolean           // --enhance：提交前先调 /api/enhance-prompt 增强提示词
}): Promise<void> {
  // prompt / skill / template 三选一。commander 不好表达互斥，在这里校验，报错要说清怎么改
  const picked = [opts.prompt, opts.skill, opts.template].filter(Boolean).length
  if (opts.batch) {
    // 批量有自己的入口语义：每行一条。--skill/--template 时行内容当 input/prompt 用，
    // 所以 --prompt / --input / --fields 这些「单条内容」参数与它互斥。
    if (opts.video) throw new Error('--batch 仅图片出图支持（视频走单条 gen --video）')
    if (opts.prompt) throw new Error('--batch 与 --prompt 互斥：批量时每行就是一条提示词')
    if (opts.input) throw new Error('--batch 与 --input 互斥：批量时每行就是一条描述')
    if (opts.fields) throw new Error('--batch 与 --fields 互斥：批量场景模板占位符无法逐行区分')
  }
  if (!opts.batch && picked === 0) {
    throw new Error('需要 --prompt "完整提示词" 或 --skill <技能名>（museav skills 查）或 --template <模板id>（museav templates 查）')
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
  // 视频没有 alpha 通道这回事（mp4 不带透明），本地就拦掉，别让用户等一趟往返才知道
  if (opts.video && opts.transparent) {
    throw new Error('--transparent 仅图片出图支持：视频输出是 mp4，没有 alpha 通道')
  }

  // ── 视频高级输入（首尾帧 / 参考素材 / 提示词增强）的本地校验 ──
  //
  // 三条都在**上传之前**拦：参考视频动辄几十 MB，先传完再被中台 400 是白等一场。
  // 上限数字与中台一致（图 9 / 视频 3 / 音频 3），互斥规则见下面的长注释。
  const refImages = opts.referenceImage || []
  const refVideos = opts.referenceVideo || []
  const refAudios = opts.referenceAudio || []
  if (!opts.video) {
    const videoOnly = [
      refImages.length ? `--reference-image（${refImages.length} 个）` : '',
      refVideos.length ? `--reference-video（${refVideos.length} 个）` : '',
      refAudios.length ? `--reference-audio（${refAudios.length} 个）` : '',
      opts.lastFrame ? '--last-frame' : '',
      opts.enhance ? '--enhance' : '',
    ].filter(Boolean)
    if (videoOnly.length) {
      throw new Error(`${videoOnly.join(' / ')} 仅 --video 有意义（尾帧、参考素材、提示词增强都是视频链路的能力）`)
    }
  } else {
    if (refImages.length > MAX_REF_IMAGES) throw new Error(`视频参考图最多 ${MAX_REF_IMAGES} 张，收到 ${refImages.length} 张`)
    if (refVideos.length > MAX_REF_VIDEOS) throw new Error(`视频参考视频最多 ${MAX_REF_VIDEOS} 个，收到 ${refVideos.length} 个`)
    if (refAudios.length > MAX_REF_AUDIOS) throw new Error(`视频参考音频最多 ${MAX_REF_AUDIOS} 个，收到 ${refAudios.length} 个`)
    // 首尾帧（--image / --last-frame）与参考素材（--reference-*）互斥。
    // 这不是中台发明的限制，是 MiniMax H3 官方规定：content 里出现 reference_* 就不能再出现
    // first_frame/last_frame，反之亦然。Seedance 系反而允许混用（一律按外观参考处理），
    // 中台按上游分别校验——本地一律先拦，免得素材白传一趟（文案说清二选一怎么改）。
    const hasFrames = Boolean(opts.image || opts.lastFrame)
    const hasRefs = refImages.length + refVideos.length + refAudios.length > 0
    if (hasFrames && hasRefs) {
      throw new Error(
        '首尾帧与参考素材互斥（MiniMax H3 官方限制，二选一）：要么用 --image / --last-frame 走图生视频，' +
        '要么用 --reference-image / --reference-video / --reference-audio 走多模态参考生视频',
      )
    }
    if (opts.enhance && !opts.prompt) {
      throw new Error('--enhance 需要配合 --prompt：增强的是你自己的提示词（--template / --skill 的提示词在服务端展开，本端拿不到）')
    }
  }
  let templateFields: Record<string, string> | undefined
  if (opts.fields) {
    try {
      templateFields = JSON.parse(opts.fields)
    } catch {
      throw new Error(`--fields 必须是合法 JSON 对象，如 '{"artist":"王嘉尔","city":"南京"}'，收到: ${opts.fields}`)
    }
  }

  // 可选：先上传垫图（图片出图 --ref 可给多张 / 视频图生视频 --image 单张）
  //
  // 顺序有语义：中台把数组按序喂给模型，提示词里写「参考图片1的排版、用图片2当背景」
  // 时，图片N 对应的就是这里的第 N 个 --ref。所以上传要顺序执行、不能并发抢跑。
  let referenceImage: string | undefined
  let referenceImages: string[] | undefined
  const refPaths = [...(opts.ref || []), ...(opts.image ? [opts.image] : [])]
  if (refPaths.length > MAX_REFS) {
    throw new Error(`参考图最多 ${MAX_REFS} 张，收到 ${refPaths.length} 张`)
  }
  if (refPaths.length) {
    const urls: string[] = []
    for (const [i, refPath] of refPaths.entries()) {
      // http(s) 直链（典型来源：museav projects assets 的素材库 URL）本身就是
      // 中台 CDN 地址，直接当参考图用，不走上传
      if (/^https?:\/\//.test(refPath)) {
        urls.push(refPath)
        process.stderr.write(`  图片${i + 1} 直链: ${refPath}\n`)
        continue
      }
      process.stderr.write(`上传垫图 [图片${i + 1}] ${refPath} ...\n`)
      const up = await client.uploadRef(refPath)
      urls.push(up.url)
      process.stderr.write(`  图片${i + 1} 就绪: ${up.url}\n`)
    }
    referenceImage = urls[0]                       // 兼容：中台单数字段仍收
    referenceImages = urls.length > 1 ? urls : undefined
  }

  // 项目归档：--project 解析成 workspace_id（名字/ id 都行），租户身份时中台会忽略
  const workspaceId = opts.project ? (await resolveWorkspace(client, opts.project)).id : undefined

  // ── 批量模式：走 /api/generate-batch，中台逐项消化，本端不 pacing ──
  if (opts.batch) {
    const lines = readBatchLines(opts.batch)
    if (!lines.length) throw new Error(`批量文件里没有可用行（每行一条，# 开头的注释和空行会跳过）: ${opts.batch}`)
    process.stderr.write(`批量出图: ${lines.length} 条${opts.skill ? ` · 技能 ${opts.skill}` : ''}${opts.template ? ` · 模板 ${opts.template}` : ''}\n`)
    // 每行内容按 skill/template 有无决定语义：有 → 行是 input（业务描述），
    // 没有 → 行是完整 prompt。其余选项全部作为公共 defaults 下发。
    const defaults: Record<string, unknown> = {}
    if (opts.skill) defaults.template_slug = opts.skill
    if (opts.template) defaults.template_id = opts.template
    if (opts.ratio) defaults.ratio = opts.ratio
    if (opts.quality) defaults.quality = opts.quality
    if (referenceImage) defaults.reference_image = referenceImage
    if (referenceImages) defaults.reference_images = referenceImages
    if (opts.transparent) defaults.background = 'transparent'
    if (workspaceId) defaults.workspace_id = workspaceId
    const lineKey = (opts.skill || opts.template) ? 'input' : 'prompt'
    const submitted = await submitBatch(
      client,
      lines.map((line) => ({ [lineKey]: line })),
      defaults,
    )
    // 等待全部完成：轮询所有 jobId，按行序输出 URL（stdout 每行一个，方便管道续接）
    const waiters = submitted.map((s) => s.jobId).filter(Boolean) as string[]
    process.stderr.write(`已提交 ${waiters.length}/${lines.length}，等待生成...\n`)
    const urls = await Promise.all(
      submitted.map(async (s) => {
        if (!s.jobId) return null
        for (let i = 0; i < 200; i++) {
          await new Promise((r) => setTimeout(r, 3000))
          const job = await client.getJob(s.jobId!)
          if (job.status === 'done') return job.cdn_url || null
          if (job.status === 'failed') {
            process.stderr.write(`  ${s.jobId!.slice(0, 8)} 失败: ${job.error || '未知原因'}\n`)
            return null
          }
        }
        return null
      }),
    )
    let okCount = 0
    for (const [i, url] of urls.entries()) {
      if (url) { okCount++; console.log(url) }
      else if (submitted[i].error) process.stderr.write(`第 ${i + 1} 行未提交: ${submitted[i].error}\n`)
    }
    process.stderr.write(`✅ 批量完成: ${okCount}/${lines.length} 张\n`)
    if (okCount === 0) throw new Error('批量出图全部失败')
    return
  }

  // ── 视频模式：走 /api/videos 独立链路 ──
  if (opts.video) {
    if (opts.quality) throw new Error('--quality 仅图片出图支持')
    if (opts.skill) throw new Error('--video 暂不支持配合 --skill（视频模板走 --template，清单用 museav video-templates 查）')

    // 尾帧 + 参考素材：本地文件先上传成 URL（直链直接用），顺序即语义
    const lastFrameUrl = opts.lastFrame ? (await resolveMediaUrls(client, [opts.lastFrame], '尾帧'))[0] : undefined
    const refImageUrls = await resolveMediaUrls(client, refImages, '参考图')
    const refVideoUrls = await resolveMediaUrls(client, refVideos, '参考视频')
    const refAudioUrls = await resolveMediaUrls(client, refAudios, '参考音频')

    // --enhance：先让中台把粗糙想法补成 H3 听得懂的结构化提示词，再用增强后的提交。
    // 增强器把这些图按「参考图」语义读（官方 role=reference_image）——首帧也一并给它，
    // 让它知道画面从哪一帧起；这里只是**上下文**，不涉及生成链路那条首尾帧/参考素材互斥。
    let videoPrompt = opts.prompt
    if (opts.enhance) {
      const contextImages = [...new Set([...(referenceImage ? [referenceImage] : []), ...refImageUrls])]
      process.stderr.write(`提示词增强中（H3-Context-IR，通常几十秒）...\n`)
      const enhanced = await client.enhancePrompt({
        prompt: videoPrompt!,
        images: contextImages.length ? contextImages : undefined,
        videos: refVideoUrls.length ? refVideoUrls : undefined,
        audios: refAudioUrls.length ? refAudioUrls : undefined,
        duration: opts.duration,
        ratio: opts.ratio,
      })
      videoPrompt = enhanced.prompt
      // 字数对比走 stderr：stdout 只放结果 URL（管道/agent 靠它取片）
      process.stderr.write(`提示词已增强: ${enhanced.originalLength} 字 → ${enhanced.enhancedLength} 字\n`)
    }

    const inputHint = [
      referenceImage ? '图生视频' : '',
      lastFrameUrl ? '带尾帧' : '',
      refImageUrls.length + refVideoUrls.length + refAudioUrls.length
        ? `参考素材 ${refImageUrls.length} 图/${refVideoUrls.length} 视频/${refAudioUrls.length} 音频`
        : '',
      opts.enhance ? '提示词已增强' : '',
    ].filter(Boolean)
    process.stderr.write(
      `提交视频: ${opts.template ? `模板 ${opts.template}` : videoPrompt?.slice(0, 40) || ''}${inputHint.length ? ` · ${inputHint.join(' · ')}` : ''}\n`,
    )
    const { jobId } = await client.generateVideo({
      prompt: videoPrompt,
      // 留空 = 中台智能路由（按这次的时长/分辨率挑一个能满足的档次）
      model: opts.model,
      ratio: opts.ratio,
      duration: opts.duration,
      image_url: referenceImage,
      // 两个字段名各有一家上游认（见 client.generateVideo 的注释），一起发才不会丢首帧
      first_frame: referenceImage,
      last_frame: lastFrameUrl,
      reference_images: refImageUrls.length ? refImageUrls : undefined,
      reference_videos: refVideoUrls.length ? refVideoUrls : undefined,
      reference_audios: refAudioUrls.length ? refAudioUrls : undefined,
      template_id: opts.template,
      input: templateFields,
      workspace_id: workspaceId,
    })
    process.stderr.write(`视频任务已提交: ${jobId}\n生成中（视频通常 1-5 分钟）...\n`)
    const result = await client.waitVideo(jobId, (status) => {
      if (status === 'processing') process.stderr.write('生成中...\r')
    })
    if (result.status !== 'completed' || !result.cdn_url) {
      throw new Error(`视频生成失败: ${result.error || '未知原因'}`)
    }
    process.stderr.write(`✅ 视频完成\n`)
    // 模型出的是**无声、无字幕的素材**，不是能直接发的成品。这一行是为了让人在拿到
    // URL 的那一刻就知道下一步去哪 —— 而不是以为「出完了」，或者反过来以为
    // museav 该管配音烧字幕（那是 reel-kit 的活，两边边界见 AGENTS.md）。
    // 只在视频模式提示，且走 stderr 不污染 stdout。
    process.stderr.write(
      `   这是无声无字幕的素材。要装配成能发的成品（配文案/配乐/配音）：\n` +
      `   reel make --assets <图目录> --caps 文案.txt   → github.com/webkubor/reel-kit\n`,
    )
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
      template_slug: opts.skill,
      input: opts.input,
      template_id: opts.template,
      template_fields: templateFields,
      ratio: opts.ratio,
      model: opts.model,
      quality: opts.quality as 'low' | 'medium' | 'high' | undefined,
      reference_image: referenceImage,
      reference_images: referenceImages,
      // 开关 → 枚举：CLI 这层用布尔开关最顺手，中台契约是 background: transparent|opaque
      // （跟上游 gpt-image 的参数同名同值）。不传就不发，行为跟以前完全一样。
      background: opts.transparent ? 'transparent' : undefined,
      workspace_id: workspaceId,
    },
    (status) => {
      if (status === 'processing') process.stderr.write('生成中...\r')
    },
  )

  // 成功：图片 URL 输出到 stdout（便于管道），元信息到 stderr
  process.stderr.write(`✅ 完成 (${job.elapsed_ms ? (job.elapsed_ms / 1000).toFixed(1) + 's' : '?'})\n`)
  console.log(job.cdn_url)
}
