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

/**
 * 客户端自报身份 —— 中台靠这个头把 gen_jobs.channel 记成 'cli'。
 *
 * 必要性：同一把租户 apiKey 既可能来自业务方后端，也可能来自有人在终端跑本 CLI；
 * 同一个个人 JWT 既可能来自网页也可能来自这里。只看凭证分不出渠道，必须自报。
 * 版本号从 package.json 读，随发版自动跟随；读不到就退化成不带版本（仍能识别为 cli）。
 */
const CLIENT_ID = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'))
    return `studio-cli/${pkg.version}`
  } catch {
    return 'studio-cli'
  }
})()

export interface GenerateOptions {
  /** 自己写完整提示词。与 skill_slug / template_id 三选一 */
  prompt?: string
  /**
   * 用中台技能出图（技能黑盒）：提示词正文在服务端展开，不下发。
   * 查找顺序：自己的私有技能 → 所属租户的专属模板 → 公共技能库。
   * 与 prompt / template_id 三选一。
   */
  skill_slug?: string
  /** 配合 skill_slug 的一句业务描述，如「米白色针织衫」。不给则按技能规范自由发挥 */
  input?: string
  /**
   * 用图片模板出图（模板黑盒）：提示词模板在服务端展开，确定性字符串替换，不经模型、
   * 不产生 chat 成本。模板清单用 studio-cli templates 查。与 prompt / skill_slug 三选一。
   */
  template_id?: string
  /** 配合 template_id 的占位符取值，如 {artist:'王嘉尔', city:'南京'}；模板没有占位符则不用传 */
  template_fields?: Record<string, string>
  ratio?: string
  model?: string
  reference_image?: string
  quality?: 'low' | 'medium' | 'high'
}

/** 图片模板清单项（GET /api/templates） */
export interface TemplateOption {
  id: string
  category: string
  zh_name: string
  description?: string
  ratio: string
  /** 归属：自己租户建的 vs 平台共享的（tenant_id 为空） */
  tenant_id: string | null
  generation_configs: Array<{
    model: string
    prompt_template: string
    ref_slots?: string[]
    params_json?: { fields?: Array<{ key: string; label: string; placeholder?: string }> }
    is_default?: boolean
  }>
}

/**
 * 新建模板入参（POST /api/templates）。不传 tenant_id —— 归属完全由服务端根据
 * 调用者身份决定：租户 apiKey 自动打自己的 tenant_id，平台管理员 JWT 建的是
 * tenant_id=null 的平台共享模板，个人账号（无租户、非管理员）会被服务端拒绝（401）。
 */
export interface CreateTemplateInput {
  zh_name: string
  category?: string
  description?: string
  ratio?: string
  generation_configs: Array<{
    model: string
    prompt_template: string
    quality?: string
    /** 表单字段声明——按中台契约放 config 顶层（不是 params_json 里），服务端校验/渲染都读这里 */
    fields?: Array<{ key: string; label: string }>
    is_default?: boolean
  }>
}

/** 技能清单项（GET /api/skills） */
export interface SkillOption {
  slug: string
  zh_name?: string
  description?: string
  genre?: string
  ratio?: string
  ref_required?: boolean
  /** 私有技能（自己建的） */
  private?: boolean
  /** 所属租户的专属模板 */
  agency?: boolean
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
  /** 数值单位是 ¥（人民币）。字段名带 usd 是历史遗留命名，不代表美元——中台侧不存在汇率换算 */
  balance_usd: number
  /** 租户加价率（0.2 = 加价 20%） */
  markup_pct: number
  checked_at: string
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
    return { 'X-Studio-Client': CLIENT_ID, ...this.authHeader, ...extra }
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

  /** 可用技能清单：私有 + 所属租户专属模板 + 公共库，服务端已按调用者权限过滤 */
  async skills(): Promise<SkillOption[]> {
    const r = await this.request('skills')
    return Array.isArray(r) ? r : []
  }

  /** 可用图片模板清单：自己租户建的 + 平台共享的，服务端已按调用者权限过滤 */
  async templates(): Promise<TemplateOption[]> {
    const r = await this.request('templates')
    return Array.isArray(r) ? r : []
  }

  /** 新建图片模板。归属（是否关联租户）由服务端根据鉴权身份决定，见 CreateTemplateInput 注释 */
  async createTemplate(input: CreateTemplateInput): Promise<TemplateOption> {
    const r = await this.request('templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return r.row
  }

  /** 提交出图任务，立即返回 jobId */
  async generate(opts: GenerateOptions): Promise<{ jobId: string; trace_id?: string }> {
    // prompt / skill_slug / template_id 三选一：都传时服务端按 prompt > template_id > skill_slug
    // 的优先级取（见服务端 generate.js），这里不替服务端做决定，只保证不凭空造字段
    const body: Record<string, unknown> = {}
    if (opts.prompt) body.prompt = opts.prompt
    if (opts.skill_slug) body.skill_slug = opts.skill_slug
    if (opts.template_id) body.template_id = opts.template_id
    // input 是服务端黑盒展开的入参：skill_slug 配一句话描述，template_id 配占位符取值对象，
    // 两者都写进同一个 input 字段（服务端按类型分支处理），CLI 侧分开成两个选项只是好懂
    if (opts.input) body.input = opts.input
    else if (opts.template_fields) body.input = opts.template_fields
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
