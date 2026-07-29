/** studio-image models —— 查可用模型列表 */
import type { StudioClient } from '../client.js'

export async function models(client: StudioClient): Promise<void> {
  const list = await client.models()
  process.stderr.write(`可用模型（${list.length} 个）:\n`)
  for (const m of list) {
    process.stderr.write(`  ${m.value.padEnd(28)} ${m.label}\n`)
  }
  // stdout 输出 value 列表（便于脚本解析）
  console.log(list.map((m) => m.value).join('\n'))
}
