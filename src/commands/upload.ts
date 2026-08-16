/**
 * museav upload —— 上传素材到中台图库，stdout 输出公网直链。
 *
 * 走 POST /api/upload-ref：图片 / 音频 / 视频都收，类型按**字节魔数**判定（中台不信
 * 客户端声明的 MIME），分类型限大小——图片 8MB / 音频 20MB / 视频 50MB。
 * 拿到的 URL 可以直接喂给 gen --ref / gen --video --image，也能给 reverse 当图片 URL。
 */
import type { StudioClient } from '../client.js'

const KIND_LABEL: Record<string, string> = { image: '图片', audio: '音频', video: '视频' }

export async function upload(client: StudioClient, filePath: string): Promise<void> {
  process.stderr.write(`上传 ${filePath} ...\n`)
  const { url, media_type, mime } = await client.uploadRef(filePath)
  const kind = media_type ? `${KIND_LABEL[media_type] || media_type}${mime ? ` · ${mime}` : ''}` : ''
  process.stderr.write(`✅ 上传成功${kind ? `（${kind}）` : ''}\n`)
  console.log(url)
}
