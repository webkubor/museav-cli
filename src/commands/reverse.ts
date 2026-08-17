/** museav reverse —— 图片逆向（SCULPT 六要素反推 prompt）。
 *  默认走中台 API（快、稳定、不需本地模型）；--local 可切本地 Ollama（需自备 qwen3-vl，
 *  仅在用户显式要求时使用——本地大模型默认不拉起，不给用户的内存添负担）。
 *  client 懒构造：本地路成功就完全不碰中台凭证。 */
import type { StudioClient, ReverseResult } from '../client.js'
import { checkLocalVlm, reverseLocally, LOCAL_VLM_MODEL } from '../local-vision.js'

export async function reverse(
  getClient: () => StudioClient,
  input: string,
  opts: { api?: boolean; local?: boolean } = {},
): Promise<void> {
  const isUrl = /^https?:\/\//.test(input)

  // 本地路只在用户显式 --local 且输入是本地文件时尝试；服务不可用给出指引后回落 API
  if (opts.local && !isUrl) {
    const status = await checkLocalVlm()
    if (status.running && status.modelPresent) {
      try {
        const start = Date.now()
        const result = await reverseLocally(input)
        process.stderr.write(`✓ 本地 Ollama（${LOCAL_VLM_MODEL}）用时 ${((Date.now() - start) / 1000).toFixed(1)}s\n`)
        renderReverse(result)
        return
      } catch (e) {
        process.stderr.write(`⚠ 本地读图失败（${e instanceof Error ? e.message : e}），回落中台 API —— 速度较慢，请耐心等待\n`)
      }
    } else {
      process.stderr.write(`⚠ 本地读图不可用（${status.reason}），回落中台 API —— 速度较慢，请耐心等待\n`)
    }
  } else if (opts.local && isUrl) {
    process.stderr.write(`ℹ URL 输入走中台 API（本地路只收文件路径）\n`)
  }

  const client = getClient()
  const result = await client.reverse(isUrl ? { imageUrl: input } : { file: input })
  renderReverse(result)
}

/** 两条路产出同构，渲染只写一份 */
function renderReverse(result: ReverseResult): void {
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
