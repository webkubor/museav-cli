/**
 * museav upload —— 上传素材到中台图库，stdout 输出公网直链。
 *
 * 走 POST /api/upload-ref：图片 / 音频 / 视频都收，类型按**字节魔数**判定（中台不信
 * 客户端声明的 MIME），分类型限大小——图片 8MB / 音频 20MB / 视频 50MB。
 * 拿到的 URL 可以直接喂给 gen --ref / gen --video --image，也能给 reverse 当图片 URL。
 */
import type { StudioClient } from '../client.js'

const KIND_LABEL: Record<string, string> = { image: '图片', audio: '音频', video: '视频' }

export async function upload(
  client: StudioClient,
  filePath: string,
  opts: { toWorks?: boolean; workspace?: string } = {},
): Promise<void> {
  process.stderr.write(`上传 ${filePath} ...\n`)
  const { url, media_type, mime, job_id } = await client.uploadRef(filePath, {
    asWork: opts.toWorks,
    workspaceId: opts.workspace,
  })
  const kind = media_type ? `${KIND_LABEL[media_type] || media_type}${mime ? ` · ${mime}` : ''}` : ''
  process.stderr.write(`✅ 上传成功${kind ? `（${kind}）` : ''}\n`)
  if (opts.toWorks) {
    // 说清有没有真的进作品库：租户 key 调用时中台不记作品，只提示「已上传」会让人以为进去了
    process.stderr.write(job_id
      ? '📁 已收进你的作品库，在「我的作品」里能看到\n'
      : '⚠️  文件已上传，但没能记进作品库（租户 Key 调用不记作品，作品要归到具体账户）\n')
  } else if (media_type === 'video') {
    // 传视频十有八九是想收成品，顺手提一句 —— 但不擅自替他决定
    process.stderr.write('提示：加 --to-works 可以把它收进「我的作品」\n')
  }
  console.log(url)
}
