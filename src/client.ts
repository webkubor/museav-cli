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
import { basename } from 'node:path'
import { compressForVision } from './compress.js'

/**
 * 客户端自报身份 —— 中台靠它把 gen_jobs.channel 记成 'cli'，报错告警也靠它定位调用方。
 *
 * 必要性：同一把租户 apiKey 既可能来自业务方后端，也可能来自有人在终端跑本 CLI；
 * 同一个个人 JWT 既可能来自网页也可能来自这里。只看凭证分不出渠道，必须自报。
 * 版本号从 package.json 读，随发版自动跟随；读不到就退化成不带版本（仍能识别为 cli）。
 */
const CLIENT_ID = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'))
    return `museav-cli/${pkg.version}`
  } catch {
    return 'museav-cli'
  }
})()

/**
 * 自报身份的头名。**过渡期两个头一起发，值都是 CLIENT_ID。**
 *
 *   X-Museav-Client —— 新头，跟产品名一致，长期只留这一个。
 *   X-Studio-Client —— 旧头，头名里还带着已经废弃的 "Studio" 叫法，纯为兼容保留。
 *
 * 为什么两个都发：中台的渠道识别（detectChannel）与报错上下文（_middleware 的
 * requestContext）现在读的是旧头，且对值做前缀匹配。CLI 单方面改名，中台就会把 CLI
 * 的调用记成 browser/api，渠道统计当场失真。过渡期中台两个头都读，等所有客户端都升上来
 * 之后，中台先停读旧头，这里再把 X-Studio-Client 删掉——那时删是纯清理，不影响任何人。
 */
const CLIENT_HEADERS: Record<string, string> = {
  'X-Museav-Client': CLIENT_ID,
  'X-Studio-Client': CLIENT_ID,
  // 中台还有一条 UA 兜底匹配（有人只改 UA 不带自报头时也能认出是 CLI）。
  // Node 默认 UA 是 "node"，什么信息都没有，这里显式带上同一个身份串。
  'User-Agent': CLIENT_ID,
}

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
   * 不产生 chat 成本。模板清单用 museav templates 查。与 prompt / skill_slug 三选一。
   */
  template_id?: string
  /** 配合 template_id 的占位符取值，如 {artist:'王嘉尔', city:'南京'}；模板没有占位符则不用传 */
  template_fields?: Record<string, string>
  ratio?: string
  model?: string
  reference_image?: string
  /** 多张参考图，顺序即提示词里的「图片1、图片2…」；中台按序喂给模型 */
  reference_images?: string[]
  quality?: 'low' | 'medium' | 'high'
  /**
   * 出图背景。transparent = 抠掉背景出带 alpha 通道的 PNG；opaque = 明确要不透明背景；
   * 不传 = 沿用上游默认（白底）。
   *
   * 跟上游 gpt-image 的参数同名同值，中台不做翻译。两个约束由中台强制、CLI 不重复实现：
   *   · 透明背景强制 PNG 输出（JPEG/有损 WebP 没有 alpha 通道）
   *   · 只派给声明了该能力的上游；一家都没有时返回 400 说明原因，**不会静默出白底图**
   */
  background?: 'transparent' | 'opaque'
  /** 项目归档：生成结果挂到该工作区（中台仅账户身份收，租户身份忽略） */
  workspace_id?: string
}

/** 工作区（项目）：平台账户下的项目容器，素材库挂在它上面（GET/POST /api/workspaces） */
export interface Workspace {
  id: string
  name: string
  brand?: string | null
  description?: string | null
  /** 该项目累计提交 / 完成的生成数（列表接口附带的统计） */
  gen_total?: number
  gen_done?: number
  created_at?: string
}

/** 工作区素材（GET/POST /api/workspace-assets）：项目素材库的一条记录 */
export interface WorkspaceAsset {
  id: string
  workspace_id: string
  media_type: 'image' | 'video' | 'audio'
  cdn_url: string
  name: string | null
  tags: string[]
  size_bytes?: number | null
  created_at?: string
}

/** 图片/文字模板清单项（GET /api/templates，template_type=image|article） */
export interface TemplateOption {
  id: string
  category: string
  zh_name: string
  description?: string
  ratio: string
  /** image=图片模板 / article=文字模板（视频模板在 videoTemplates()） */
  template_type?: string
  sample_images?: string[] | null
  /** 视频模板专用：参考视频/封面（video-templates 接口返回，租户后台和 CLI 都靠它看参考） */
  sample_video_url?: string | null
  sample_cover_image?: string | null
  /** 归属：自己租户建的 vs 平台共享的（tenant_id 为空） */
  tenant_id: string | null
  /** 中台下发的归属标记：mine=本租户建的 / platform=平台共享 / personal=我这个人建的 */
  source?: 'mine' | 'platform' | 'personal'
  /** 创建人（平台管理员个人建的模板会带邮箱；租户建的为 null） */
  created_by?: string | null
  generation_configs: Array<{
    model: string
    prompt_template: string
    ref_slots?: string[]
    /** 表单字段声明——现行契约放 config 顶层（服务端 validateConfig 读这里） */
    fields?: Array<{ key: string; label: string }>
    /** 旧存法：fields 曾在 params_json 里，老模板还这么存，读时两种都要兜 */
    params_json?: { fields?: Array<{ key: string; label: string; placeholder?: string }> }
    duration?: number
    aspect_ratio?: string
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
  /** image=图片模板 / article=文字模板（不传默认 image，跟中台一致） */
  template_type?: 'image' | 'article'
  generation_configs: Array<{
    model: string
    prompt_template: string
    quality?: string
    /** 表单字段声明——按中台契约放 config 顶层（不是 params_json 里），服务端校验/渲染都读这里 */
    fields?: Array<{ key: string; label: string }>
    is_default?: boolean
  }>
}

/** 新建视频模板入参（POST /api/video-templates）。视频模板字段跟图片不同：
 *  ratio/duration/model 放在 generation_configs 每项里。 */
export interface CreateVideoTemplateInput {
  zh_name: string
  /** 对外调用标识，视频模板硬必填（服务端 validateCore required=['zh_name','slug']），全局唯一 */
  slug: string
  category?: string
  description?: string
  sample_video_url?: string | null
  sample_cover_image?: string | null
  generation_configs: Array<{
    model?: string
    duration?: number
    aspect_ratio?: string
    prompt_template?: string
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

/**
 * 任务进度里的业务阶段。中台的口径（别自己重新发明）：
 *   job.status 只有 pending / done / failed —— 业务阶段**不在 status 里**，在 steps 里。
 *   每步 status：running=正在做（可以直接拿来渲染「正在解析图片…」）、ok=做完、fail=卡在这步。
 *   任务结束后不会再有 running。
 */
export interface JobStep {
  name: string
  status: 'running' | 'ok' | 'fail'
  ms: number | null
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
  /** 业务阶段进度（中台 sanitizeSteps 脱敏后下发），image-to-template 这类多阶段任务才有 */
  steps?: JobStep[]
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

/** 图上一处文字的逆向结果（POST /api/image-to-template 的 text_layers 每项） */
export interface TextLayer {
  role?: string
  content?: string
  position?: string
  font_category?: string
  font_weight?: string
  size_ratio?: number
  color?: string
  treatment?: string
  alignment?: string
  is_variable?: boolean
  variable?: string | null
}

/** 模板表单字段声明（中台 7.3 的 fields 契约） */
export interface TemplateField {
  key: string
  label: string
  type?: string
  placeholder?: string
}

/**
 * POST /api/image-to-template 的结果本体（同步返回，或异步 job 完成后的 result）。
 *
 * 它是「读图结果 + 文字层 + 模板」三段的叠加：ReverseResult 那几个 key 照常给，
 * 后面几个是这个接口独有的。中台的降级口径：文字层逆向 / 变量化 / 建模板任一步失败，
 * 都只是 prompt_template=null + template_error=<原因>，sculpt / prompt_cn 照常返回——
 * 所以 template 为 null **不等于** 整件事失败，要看 template_error。
 */
export interface ImageToTemplateResult extends ReverseResult {
  image_category?: string
  text_layers?: TextLayer[]
  /** 变量化后的提示词模具（含 {key} 占位符）。null = 这一步降级了，原因在 template_error */
  prompt_template: string | null
  fields?: TemplateField[]
  /** create_template=true 且建成时非空 */
  template: { id: string; slug: string; zh_name: string; tenant_id: string | null; reference_image?: string | null } | null
  /** 非 null = 模板没建成（读图结果仍然有效） */
  template_error: string | null
  template_warnings?: string[]
  reference_image?: string | null
}

/** 异步提交后的回执（create_template=true 或 async=true 时中台返回这个，不是结果本体） */
export interface ImageToTemplateJob {
  ok: boolean
  jobId: string
  status: string
  async: boolean
}

/** GET /api/image-to-template?job_id=<uuid> 的返回 */
export interface ImageToTemplateJobResult {
  ok: boolean
  job_id: string
  status: 'pending' | 'done' | 'failed'
  error: string | null
  elapsed_ms: number | null
  result: ImageToTemplateResult | null
}

/** image-to-template 入参（除图片外都可选，字段名与中台契约 §7.6 一一对应） */
export interface ImageToTemplateInput {
  /** 本地文件路径，与 imageUrl 二选一 */
  file?: string
  /** 图片 URL，与 file 二选一 */
  imageUrl?: string
  /** 允许出现的变量白名单，可收窄。不允许模型发明白名单外的变量 */
  variables?: string[]
  /** 变量 → 你自己的业务叫法，只影响 fields[].label；key 永远是中台通用语义 */
  variableLabels?: Record<string, string>
  /** true = 直接建好模板（走异步）；false/不传 = 只回模板草稿 */
  createTemplate?: boolean
  /** 模板元信息，缺省由中台生成。slug 全局唯一，撞了报错不覆盖 */
  template?: { zh_name?: string; slug?: string; category?: string; domain?: string }
  /** 强制异步（createTemplate=true 时本来就是异步） */
  async?: boolean
}

export interface ModelOption {
  value: string
  label: string
  description?: string
}

export interface Balance {
  /** 余额（¥）。中台 2026-08-21 起发这个字段名 */
  balance_cny?: number
  /**
   * 同一个数的旧字段名，中台仍在双发。字段名带 usd 纯属历史遗留，值一直是人民币——
   * 中台侧不存在汇率换算。老版本 CLI 只认这个名字，所以中台不会立刻停发。
   */
  balance_usd?: number
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
  /** 租户 Key（apiKey）调用 /api/me 时返回：identity='tenant' + tenant 信息（2026-08-15） */
  identity?: 'tenant'
  tenant?: { id: string; name: string; nickname: string; logo: string | null }
  /** 飞书绑定 open_id（已绑定飞书时存在，welcome 提示 agent 能认出你） */
  feishu_open_id?: string | null
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
    return { ...CLIENT_HEADERS, ...this.authHeader, ...extra }
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
      throw new Error(`中台 API /api/${path} 失败: ${msg}`)
    }
    return body
  }

  /** 可用技能清单：私有 + 所属租户专属模板 + 公共库，服务端已按调用者权限过滤 */
  async skills(): Promise<SkillOption[]> {
    const r = await this.request('skills')
    return Array.isArray(r) ? r : []
  }

  /** 可用图片/文字模板清单：自己租户建的 + 平台共享的，服务端已按调用者权限过滤。
   *  type=image|article 二选一（不传则图片+文字都返回，跟中台默认一致）。
   *  source=mine|platform|personal|all（默认 all；mine=本租户，platform=平台共享，personal=我这个人建的）。 */
  async templates(type?: 'image' | 'article', source?: 'mine' | 'platform' | 'personal' | 'all'): Promise<TemplateOption[]> {
    const params = new URLSearchParams()
    if (type) params.set('type', type)
    if (source && source !== 'all') params.set('source', source)
    const qs = params.toString() ? `?${params}` : ''
    const r = await this.request(`templates${qs}`)
    return Array.isArray(r) ? r : []
  }

  /** 视频模板清单（POST /api/videos 用 template_id）。结构同图片模板的 generation_configs 形态 */
  async videoTemplates(): Promise<TemplateOption[]> {
    const r = await this.request('video-templates')
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

  /** 新建视频模板。归属同图片模板：租户 apiKey 自动归租户，平台管理员归平台共享 */
  async createVideoTemplate(input: CreateVideoTemplateInput): Promise<TemplateOption> {
    const r = await this.request('video-templates', {
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
    // 单双字段一起发：中台优先取复数、为空才回落单数，两个都带着更稳
    if (opts.reference_images?.length) body.reference_images = opts.reference_images
    if (opts.quality) body.quality = opts.quality
    if (opts.background) body.background = opts.background
    // 项目归档：中台只对账户身份收 workspace_id（租户身份忽略），CLI 不做二次校验
    if (opts.workspace_id) body.workspace_id = opts.workspace_id
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

  // ── 工作区（项目）与项目素材库 ──
  // 平台 → 账户 → 工作区三层归属；素材挂工作区，换业务换工作区，互不污染。

  /** 列当前账户的工作区（含生成统计） */
  async workspaces(): Promise<Workspace[]> {
    return this.request('workspaces')
  }

  /** 新建工作区（最多 5 个，超了服务端会 400） */
  async createWorkspace(name: string): Promise<Workspace> {
    return this.request('workspaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
  }

  /** 列某工作区的素材库 */
  async workspaceAssets(workspaceId: string): Promise<WorkspaceAsset[]> {
    return this.request(`workspace-assets?workspace_id=${encodeURIComponent(workspaceId)}`)
  }

  /** 上传素材进工作区素材库。素材是母版，**不做视觉压缩**（fileForm 那套压缩是给模型看的） */
  async addWorkspaceAsset(input: {
    file: string
    workspaceId: string
    name?: string
    tags?: string[]
  }): Promise<WorkspaceAsset> {
    const blob = new Blob([new Uint8Array(readFileSync(input.file))])
    const fd = new FormData()
    fd.append('file', blob, basename(input.file))
    fd.append('workspace_id', input.workspaceId)
    if (input.name) fd.append('name', input.name)
    for (const t of input.tags || []) fd.append('tags', t)
    return this.request('workspace-assets', { method: 'POST', body: fd })
  }

  /** 删除素材（硬删：R2 对象 + 记录） */
  async deleteWorkspaceAsset(id: string): Promise<void> {
    await this.request('workspace-assets', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
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
   /** 提交出图 + 自动轮询直到完成/失败。
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

   /** 提交视频任务（POST /api/videos）——video 走独立链路，不走图片 queue */
   async generateVideo(opts: {
     prompt?: string
     model?: string
     ratio?: string
     duration?: number
     /** 图生视频：首帧/参考图 URL（中台内部自动上传垫图后拿到 URL 再传这里） */
     image_url?: string
    template_id?: string
    input?: string | Record<string, string>
    callback_url?: string
    /** 项目归档（账户身份才生效） */
    workspace_id?: string
  }): Promise<{ jobId: string; upstreamTaskId?: string }> {
    const body: Record<string, unknown> = {}
    if (opts.prompt) body.prompt = opts.prompt
    if (opts.model) body.model = opts.model
    if (opts.ratio) body.ratio = opts.ratio
    if (opts.duration != null) body.duration = opts.duration
    if (opts.image_url) body.image_url = opts.image_url
    if (opts.template_id) body.template_id = opts.template_id
    if (opts.input) body.input = opts.input
    if (opts.callback_url) body.callback_url = opts.callback_url
    if (opts.workspace_id) body.workspace_id = opts.workspace_id
     const r = await this.request('videos', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(body),
     })
     return { jobId: r.job_id || r.id, upstreamTaskId: r.id }
   }

   /** 轮询视频任务直到完成/失败。返回 { cdn_url, status } */
   async waitVideo(
     jobId: string,
     onProgress?: (status: string) => void,
     intervalMs = 5000,
     maxAttempts = 120, // 视频通常 1-5 分钟，最多等 10 分钟
   ): Promise<{ cdn_url: string | null; status: string; error?: string }> {
     for (let i = 0; i < maxAttempts; i++) {
       await sleep(intervalMs)
       const r = await this.request(`videos?id=${encodeURIComponent(jobId)}`)
       onProgress?.(r.status || 'processing')
       if (r.status === 'completed') return { cdn_url: r.cdn_url || null, status: 'completed' }
       if (r.status === 'failed') return { cdn_url: null, status: 'failed', error: r.error || '未知原因' }
     }
     throw new Error(`视频生成超时（${(maxAttempts * intervalMs) / 1000}s 未完成，jobId: ${jobId}）`)
   }

  /**
   * 图片逆向（**纯读图**）：传文件路径或图片 URL，拿回 SCULPT 六要素与出图 prompt。
   *
   * ⚠️ 这里只发图片，一个别的字段都不发。2026-08-16 中台把「读图」和「把图做成模板」
   * 拆成两个接口后，/api/reverse 见到 variablize / variables / variable_labels /
   * create_template / template / async 任何一个都会直接 400（不是静默忽略）。
   * 要做模板走 imageToTemplate()。
   */
  async reverse(input: { file?: string; imageUrl?: string }): Promise<ReverseResult> {
    if (input.file) {
      return this.request('reverse', { method: 'POST', body: await fileForm(input.file) })
    }
    return this.request('reverse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: input.imageUrl }),
    })
  }

  /**
   * 上传素材（POST /api/upload-ref），返回公网直链。
   *
   * 图片 / 音频 / 视频都收：中台按**字节魔数**判真实类型（不信客户端声明的 MIME），
   * 分类型限大小——图片 8MB / 音频 20MB / 视频 50MB。认不出类型直接 400。
   * 同一归属每小时 120 个的防滥用刹车在服务端，超了返回 429。
   */
  /**
   * 上传素材。图片会先压到视觉模型够用的尺寸再传（见 compress.ts）——
   * 参考图是给模型看的，不是留档，原图直传只会拖慢上传和解析。
   */
  async uploadRef(filePath: string): Promise<{ url: string; media_type?: string; mime?: string }> {
    const r = await this.request('upload-ref', { method: 'POST', body: await fileForm(filePath) })
    return { url: r.url, media_type: r.media_type, mime: r.mime }
  }

  /**
   * 图片转模板（POST /api/image-to-template）：一张图 → 一个可复用的图片模板。
   *
   * 同步还是异步**由入参决定，不要猜**（中台契约 §7.6）：
   *   createTemplate=true 或 async=true → 返回 { jobId }（这里是 ImageToTemplateJob）
   *   两者都不给                        → 直接返回结果本体（ImageToTemplateResult）
   * 调用方用返回值里有没有 jobId 区分，见 isAsyncJob()。
   *
   * 这个接口没有 variablize 开关：调它本身就是「我要模板」这个意图。
   */
  async imageToTemplate(input: ImageToTemplateInput): Promise<ImageToTemplateResult | ImageToTemplateJob> {
    const { file, imageUrl, variables, variableLabels, createTemplate, template, async: forceAsync } = input
    if (file) {
      // multipart 分支：中台 formOptions() 对这几个键做 JSON.parse（variables 还支持逗号分隔），
      // 所以对象/数组要自己序列化成字符串，不能直接塞进 FormData。
      const fd = await fileForm(file)
      if (variables?.length) fd.append('variables', JSON.stringify(variables))
      if (variableLabels) fd.append('variable_labels', JSON.stringify(variableLabels))
      if (createTemplate) fd.append('create_template', 'true')
      if (template) fd.append('template', JSON.stringify(template))
      if (forceAsync) fd.append('async', 'true')
      return this.request('image-to-template', { method: 'POST', body: fd })
    }
    const body: Record<string, unknown> = { image_url: imageUrl }
    if (variables?.length) body.variables = variables
    if (variableLabels) body.variable_labels = variableLabels
    if (createTemplate) body.create_template = true
    if (template) body.template = template
    if (forceAsync) body.async = true
    return this.request('image-to-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  /** 取 image-to-template 异步任务的**结果本体**（进度看 getJob 的 steps，结果在这里） */
  async getImageToTemplateResult(jobId: string): Promise<ImageToTemplateJobResult> {
    return this.request(`image-to-template?job_id=${encodeURIComponent(jobId)}`)
  }

  /**
   * 轮询 image-to-template 异步任务直到终态，返回结果本体。
   *
   * 进度和结果是两条通道（中台刻意分开的）：阶段在 GET /api/jobs?id= 的 steps 里，
   * 结果在 GET /api/image-to-template?job_id= 里。所以这里每轮先拉 job 看阶段
   * （回调给 CLI 打「正在解析图片…」），到终态再去取结果。
   */
  async waitImageToTemplate(
    jobId: string,
    onStep?: (steps: JobStep[]) => void,
    intervalMs = 3000,
    maxAttempts = 100,
  ): Promise<ImageToTemplateResult> {
    for (let i = 0; i < maxAttempts; i++) {
      await sleep(intervalMs)
      const job = await this.getJob(jobId)
      if (job.steps?.length) onStep?.(job.steps)
      if (job.status !== 'done' && job.status !== 'failed') continue

      const out = await this.getImageToTemplateResult(jobId)
      if (job.status === 'failed' || out.status === 'failed') {
        throw new Error(`图生模板失败: ${out.error || job.error || '未知原因'}（jobId: ${jobId}）`)
      }
      if (!out.result) {
        // 任务是 done 但结果取不到——中台把原因写在 error 里（例如结果列缺失还没跑迁移）。
        // 不再继续轮询：状态已经是终态，等下去也不会变。
        throw new Error(`任务已完成但取不到结果：${out.error || '中台未返回 result'}（jobId: ${jobId}）`)
      }
      return out.result
    }
    throw new Error(`图生模板超时（${(maxAttempts * intervalMs) / 1000}s 未完成，jobId: ${jobId}）`)
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

/**
 * 把本地文件包成 multipart 的 file 字段。
 *
 * 带上原文件名：中台判类型靠字节魔数不靠这个，但文件名会进日志/对象存储的排查线索，
 * 匿名的 "blob" 出问题时谁也认不出是哪张图。故意不设 MIME——声明的 MIME 中台本来就不信。
 */
/**
 * 所有 multipart 上传的唯一入口，内置参考图压缩（见 compress.ts）。
 * 压缩放这里而不是各调用点：uploadRef / reverse / image-to-template 都走它，
 * 加在调用点就会漏——2026-08-16 就漏过 image-to-template，4.1MB 原图直传把任务拖挂了。
 */
async function fileForm(filePath: string): Promise<FormData> {
  const { buffer, filename, note } = await compressForVision(filePath)
  if (note) process.stderr.write(`  ${note}\n`)
  const fd = new FormData()
  // Buffer → Uint8Array：Blob 的类型签名不收 Buffer（它可能背靠 SharedArrayBuffer）
  const blob = buffer ? new Blob([new Uint8Array(buffer)]) : new Blob([new Uint8Array(readFileSync(filePath))])
  fd.append('file', blob, buffer ? filename : basename(filePath))
  return fd
}

/**
 * 区分 imageToTemplate() 拿到的是异步回执还是结果本体。
 * 判据是有没有 jobId —— 跟中台契约一致，不靠 status 字符串猜。
 */
export function isAsyncJob(r: ImageToTemplateResult | ImageToTemplateJob): r is ImageToTemplateJob {
  return typeof (r as ImageToTemplateJob).jobId === 'string'
}
