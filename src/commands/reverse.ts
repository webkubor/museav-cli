/** museav reverse —— 图片逆向（SCULPT 六要素反推 prompt） */
import type { StudioClient } from '../client.js'

export async function reverse(client: StudioClient, input: string): Promise<void> {
  // 输入是文件路径还是 URL
  const isUrl = /^https?:\/\//.test(input)
  const result = await client.reverse(isUrl ? { imageUrl: input } : { file: input })

  process.stderr.write(`✅ 逆向完成\n\n`)
  process.stderr.write(`风格: ${result.zh_name || '-'}  比例: ${result.aspect_ratio}\n`)
  process.stderr.write(`标签: ${result.style_tags.join(', ')}\n\n`)
  process.stderr.write(`SCULPT 六要素:\n`)
  for (const [k, v] of Object.entries(result.sculpt)) {
    process.stderr.write(`  ${k}: ${v}\n`)
  }
  process.stderr.write(`\n英文 prompt:\n  ${result.prompt}\n`)
  process.stderr.write(`中文 prompt:\n  ${result.prompt_cn}\n`)

  // stdout 输出英文 prompt（便于管道直接喂给 gen）
  console.log(result.prompt)
}
