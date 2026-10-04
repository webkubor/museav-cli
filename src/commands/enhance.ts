/** museav enhance —— 提示词增强（只增强、不生成）
 *
 *  为什么单独一条命令：中台 /api/enhance-prompt 转 MiniMax 官方 **H3-Context-IR**，
 *  它做的是「把粗糙想法补成结构化提示词」这件事本身（先点规格 → 再分工参考图 →
 *  再说核心故事 → 最后气质节奏），**不生成视频、不占生成额度**。写提示词的人和
 *  出片的人常常不是同一步：先把想法沉淀成提示词（存文件、进版本库、团队传阅），
 *  再决定什么时候、用哪个模型去跑。所以它必须能单独调用。
 *
 *  跟 `gen --video --enhance` 的关系：那条路是「增强完直接提交」，适合一条龙；
 *  本命令是「只拿增强后的提示词」，适合先看再改。
 *
 *  stdout 契约：**只有增强后的提示词**（便于 `> prompt.txt` 或直接管道给 gen），
 *  其余信息（上传、耗时、字数）一律走 stderr。
 */
import type { StudioClient } from '../client.js'
import { resolveMediaUrls } from './gen.js'

export async function enhance(client: StudioClient, opts: {
  prompt?: string
  /** 参考图，可重复（本地文件自动上传，http(s) 直链直接用） */
  image?: string[]
  /** 目标时长/比例：只作上下文告诉增强器这段片子多长、什么画幅，不生成视频 */
  duration?: number
  ratio?: string
}): Promise<void> {
  const prompt = (opts.prompt || '').trim()
  if (!prompt) {
    throw new Error('需要 -p "粗糙想法"：enhance 只增强提示词、不生成视频，所以提示词是唯一必填项')
  }

  const images = await resolveMediaUrls(client, opts.image || [], '参考图')

  process.stderr.write(`增强中（MiniMax H3-Context-IR，通常几十秒）...\n`)
  const r = await client.enhancePrompt({
    prompt,
    images: images.length ? images : undefined,
    duration: opts.duration,
    ratio: opts.ratio,
  })
  process.stderr.write(`✅ 增强完成: ${r.originalLength} 字 → ${r.enhancedLength} 字${r.taskId ? ` · task ${r.taskId}` : ''}\n`)
  process.stderr.write(`   接着出片: museav gen --video --prompt "$(museav enhance -p '...')"\n`)

  // stdout 只出提示词：管道/重定向拿到的东西就是能直接用的那一句
  console.log(r.prompt)
}
