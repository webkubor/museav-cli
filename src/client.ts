/**
 * StudioClient —— studio 中台 API 客户端
 *
 * 所有出图/逆向/上传能力都封装在这里。CLI commands 和编程调用共用这一个 class。
 *
 * 用法：
 *   const studio = new StudioClient({ baseUrl, apiKey })
 *   const job = await studio.generateAndWait({ prompt: '一只猫' })
 *   console.log(job.cdn_url)
 */
import { readFileSync } from 'node:fs'

export interface GenerateOptions {
  prompt: string
  ratio?: string
  model?: string
  reference_image?: string
  quality?: 'low' | 'medium' | 'high'
}

export interface Job {
  id: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  cdn_url: string | null
  error: string | null
  trace_id?: string
  model?: string
  elapsed_ms?: number
  created_at?: string
}

export interface ReverseResult {
  ok: boolean
  sculpt: Record<string, string>
  prompt: string
  prompt_cn: string
  style_tags: string[]
  aspect_ratio: string
  zh_name?: string
  description?: string
}

export interface ModelOption {
  value: string
  label: string
  description?: string
}

export interface Balance {
  balance_usd: number
  providers_ok: number
  providers?: Array<{ name: string; label: string; ok: boolean; balance_usd: number }>
}

export interface MeInfo {
  id: string
  email: string
  nickname?: string
  role: string
  /** 邀请码注册的账户，若该邀请码归属某个租户，这里带出该租户的白标品牌；平台用户（无归属）为 null */
  brand: { name: string; logo: string | null } | null
  gen_total: number
  gen_done: number
  skill_count: number
  generation_used: number | null
  generation_remaining: number | null
  creation_credits: number
}

export class StudioClient {
  private baseUrl: string
  private authHeader: Record<string, string>

  constructor(opts: { baseUrl: string; apiKey?: string; token?: string }) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    // 个人用户 JWT 走 Bearer；租户 apikey 走 X-API-Key
    if (opts.token) {
      this.authHeader = { Authorization: `Bearer ${opts.token}` }
    } else if (opts.apiKey) {
      this.authHeader = { 'X-API-Key': opts.apiKey }
    } else {
      throw new Error('需要 token 或 apiKey')
    }
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { ...this.authHeader, ...extra }
  }

  private async request(path: string, init: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}/api/${path}`
    const resp = await fetch(url, {
      ...init,
      headers: { ...this.headers(), ...(init.headers as Record<string, string>) },
    })
    const text = await resp.text()
    let body: any
    try { body = JSON.parse(text) } catch { body = { raw: text } }
    if (!resp.ok) {
      const msg = body.error || body.raw || `HTTP ${resp.status}`
      throw new Error(`studio API ${path} 失败: ${msg}`)
    }
    return body
  }

  /** 提交出图任务，立即返回 jobId */
  async generate(opts: GenerateOptions): Promise<{ jobId: string; trace_id?: string }> {
    const body: Record<string, unknown> = { prompt: opts.prompt }
    if (opts.ratio) body.ratio = opts.ratio
    if (opts.model) body.model = opts.model
    if (opts.reference_image) body.reference_image = opts.reference_image
    if (opts.quality) body.quality = opts.quality
    const r = await this.request('generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { jobId: r.jobId, trace_id: r.trace_id }
  }

  /** 查单个任务状态 */
  async getJob(id: string): Promise<Job> {
    const r = await this.request(`jobs?id=${encodeURIComponent(id)}`)
    return r
  }

  /**
   * 列出当前身份名下的出图工作流（不传 id，走同一个 jobs 端点的集合语义）。
   * 范围由鉴权凭证决定：个人 token 只看得到自己出的图；租户 apiKey 看得到自己业务下的全部记录。
   *
   * 服务端 GET /api/jobs 目前只认 id / all 两个 query 参数，固定按 created_at
   * 倒序返回最近 50 条，不支持 limit/status 这类过滤——传了也会被忽略。
   * 所以 limit/status 在这里做客户端过滤：先拿到这最多 50 条，再本地按 status
   * 筛、按 limit 截断。这意味着 --limit 只能在这 50 条以内选，选不到更早的历史。
   */
  async listJobs(opts: { limit?: number; status?: Job['status'] } = {}): Promise<Job[]> {
    const r = await this.request('jobs')
    let list: Job[] = Array.isArray(r) ? r : r.jobs || []
    if (opts.status) list = list.filter((j) => j.status === opts.status)
    if (opts.limit) list = list.slice(0, opts.limit)
    return list
  }

  /**
   * 提交出图 + 自动轮询直到完成/失败。
   * onProgress 可选，每次轮询回调一次（用于 CLI 显示进度）。
   */
  async generateAndWait(
    opts: GenerateOptions,
    onProgress?: (status: string) => void,
    intervalMs = 3000,
    maxAttempts = 100,
  ): Promise<Job> {
    const { jobId } = await this.generate(opts)
    for (let i = 0; i < maxAttempts; i++) {
      await sleep(intervalMs)
      const job = await this.getJob(jobId)
      onProgress?.(job.status)
      if (job.status === 'done') return job
      if (job.status === 'failed') {
        throw new Error(`出图失败: ${job.error || '未知原因'}（jobId: ${jobId}）`)
      }
    }
    throw new Error(`出图超时（${(maxAttempts * intervalMs) / 1000}s 未返回，jobId: ${jobId}）`)
  }

  /** 图片逆向：传文件路径或图片 URL */
  async reverse(input: { file?: string; imageUrl?: string }): Promise<ReverseResult> {
    if (input.file) {
      const buf = readFileSync(input.file)
      const fd = new FormData()
      fd.append('file', new Blob([buf]))
      return this.request('reverse', { method: 'POST', body: fd })
    }
    return this.request('reverse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: input.imageUrl }),
    })
  }

  /** 上传垫图，返回可用的 URL */
  async uploadRef(filePath: string): Promise<{ url: string }> {
    const buf = readFileSync(filePath)
    const fd = new FormData()
    fd.append('file', new Blob([buf]))
    const r = await this.request('upload-ref', { method: 'POST', body: fd })
    return { url: r.url }
  }

  /** 查当前登录账户信息（含租户归属品牌）。仅个人 token 鉴权可用，apiKey 调用会 401。 */
  async me(): Promise<MeInfo> {
    return this.request('me')
  }

  /** 查可用模型列表 */
  async models(): Promise<ModelOption[]> {
    return this.request('available-models')
  }

  /** 查上游余额 */
  async balance(): Promise<Balance> {
    return this.request('balance')
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
