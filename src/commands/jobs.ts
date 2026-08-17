/**
 * museav jobs —— 查自己名下的出图工作流
 *
 * 范围自动跟着鉴权凭证走：个人 login 只看自己的记录；租户 apiKey 看自己业务下的全部记录。
 * 不需要额外传租户/用户 id——你拿的是谁的凭证，就是谁的数据。
 */
import type { StudioClient, Job } from '../client.js'
import { resolveWorkspace } from './projects.js'

const STATUS_MARK: Record<Job['status'], string> = {
  pending: '⏳',
  processing: '🔄',
  done: '✅',
  failed: '❌',
}

export async function jobs(client: StudioClient, opts: { limit?: string; status?: Job['status']; project?: string }): Promise<void> {
  const limit = opts.limit ? Number(opts.limit) : 20
  let list = await client.listJobs({ limit, status: opts.status })
  // --project 客户端过滤：服务端 jobs 不认 workspace 参数，在最近 50 条内筛
  if (opts.project) {
    const ws = await resolveWorkspace(client, opts.project)
    list = list.filter((j) => (j as unknown as { workspace_id?: string | null }).workspace_id === ws.id)
  }

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
