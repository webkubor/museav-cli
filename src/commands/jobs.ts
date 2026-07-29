/**
 * studio-image jobs —— 查自己名下的出图工作流
 *
 * 范围自动跟着鉴权凭证走：个人 login 只看自己的记录；租户 apiKey 看自己业务下的全部记录。
 * 不需要额外传租户/用户 id——你拿的是谁的凭证，就是谁的数据。
 */
import type { StudioClient, Job } from '../client.js'

const STATUS_MARK: Record<Job['status'], string> = {
  pending: '⏳',
  processing: '🔄',
  done: '✅',
  failed: '❌',
}

export async function jobs(client: StudioClient, opts: { limit?: string; status?: Job['status'] }): Promise<void> {
  const limit = opts.limit ? Number(opts.limit) : 20
  const list = await client.listJobs({ limit, status: opts.status })

  if (!list.length) {
    process.stderr.write('没有找到工作流记录\n')
    console.log('[]')
    return
  }

  process.stderr.write(`最近 ${list.length} 条工作流:\n\n`)
  for (const j of list) {
    const mark = STATUS_MARK[j.status] || '?'
    const time = j.created_at ? new Date(j.created_at).toLocaleString() : '?'
    process.stderr.write(`${mark} ${j.id}  ${j.status.padEnd(10)} ${(j.model || '?').padEnd(16)} ${time}\n`)
    if (j.cdn_url) process.stderr.write(`   → ${j.cdn_url}\n`)
    if (j.status === 'failed' && j.error) process.stderr.write(`   error: ${j.error}\n`)
  }

  // stdout 输出完整 JSON，供脚本消费
  console.log(JSON.stringify(list))
}
