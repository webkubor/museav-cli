/** studio-image upload —— 上传垫图，输出 URL */
import type { StudioClient } from '../client.js'

export async function upload(client: StudioClient, filePath: string): Promise<void> {
  process.stderr.write(`上传 ${filePath} ...\n`)
  const { url } = await client.uploadRef(filePath)
  process.stderr.write(`✅ 上传成功\n`)
  console.log(url)
}
