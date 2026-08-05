/** studio-cli gen —— 出图（核心命令） */
import type { StudioClient } from '../client.js'

export async function gen(client: StudioClient, opts: {
  prompt: string
  ratio?: string
  model?: string
  quality?: string
  ref?: string
}): Promise<void> {
  // 可选：先上传垫图
  let referenceImage: string | undefined
  if (opts.ref) {
    process.stderr.write(`上传垫图 ${opts.ref} ...\n`)
    const up = await client.uploadRef(opts.ref)
    referenceImage = up.url
    process.stderr.write(`垫图就绪: ${referenceImage}\n`)
  }

  process.stderr.write(`提交出图: ${opts.prompt.slice(0, 40)}...\n`)
  const job = await client.generateAndWait(
    {
      prompt: opts.prompt,
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
