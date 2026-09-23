import { LuZap, LuImage, LuAudioLines, LuVideo } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import i18n from '@/i18n'
import { ModalityBadge } from '@/features/models/components/ModalityBadge'
import { trimPriceZeros } from '@/lib/utils'
import { priceUnitSuffix } from '@/features/models/model-format'
import type { ExperienceArtifactRef } from '@/services/experience-sessions'
import type { CatalogModelItem } from '@/types'

export type ChatRole = 'user' | 'assistant'

/** 消息统计条字段，逐字对齐原型 App.tsx:20493-20504 的 playground-msg-meta 结构 */
export interface ExperienceMessageMetrics {
  model: string
  inputTokens: number
  outputTokens: number
  firstTokenLatency: string
  totalLatency: string
  spend: number
  free: boolean
  /** 总耗时的原始毫秒数（totalLatency 是格式化后的展示字符串），对比页用它比较哪列最快 */
  totalMs?: number
  /** 对比模式同一轮里最快/成本最低标记（§7.10），单模型页恒为 false */
  fastest?: boolean
  cheapest?: boolean
}

/** 媒体任务结果（§7.10 媒体结果卡）：图片/音频/视频产物的展示地址 */
export interface ExperienceMediaResult {
  kind: string
  url: string
  /** 下载引用（qa#580）。url 指向不带 CORS 头的 CDN，只能拿来展示/播放，取不到字节；
   *  「下载产物」按它走 BFF 中转端点。用户发送时的本地 previewUrl 没有这个引用，
   *  那种消息也不渲染下载按钮。 */
  downloadRef?: ExperienceArtifactRef
  /** 产物标题/规格明细（PRD 原型 PlaygroundArtifactCard 的 artifact.title/detail，逐字对齐）——
   *  图片/视频结果卡才展示，音频卡已用 message.content 当标题（#308），不重复加一行。 */
  title?: string
  detail?: string
}

export interface ExperienceMessage {
  role: ChatRole
  content: string
  error?: string
  /** 上游供应商原始报错 + 我方 request_id/trace_id 的详情（qa#549），只放"查看详情"，不做标题 */
  errorDetail?: string
  errorRequestId?: string
  errorTraceId?: string
  /** 该错误是否值得展示"重试"入口；未设置时按可重试处理（保留历史行为） */
  errorRetryable?: boolean
  metrics?: ExperienceMessageMetrics
  modelName?: string
  modelLogo?: React.ReactNode
  /** 同步发送时同一轮的组标识，对比页用它来跨列计算最快/成本最低（§7.10/§11.1） */
  dispatchId?: string
  /** 媒体任务（文生图等）的产物，dialogue 任务恒为空 */
  media?: ExperienceMediaResult[]
  /** 用户消息发送时携带的附件 resource_id（媒体任务重试用，PRD §AC-13），dialogue 消息不使用 */
  attachmentResourceIds?: string[]
  /** 历史附件的短期展示地址获取失败时，仍明确告知用户而不是渲染空白消息气泡。 */
  attachmentLoadFailed?: boolean
}

/** 延迟格式化：<1000ms 显示整数 ms，否则显示 x.xx s（App.tsx:17044 formatPlaygroundLatency 逐字对齐） */
export function formatPlaygroundLatency(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`
}

/** 消耗金额文案（体验/对比页所有费用展示的单一真源：消息元信息行、composer 预估、逐模型设置弹窗累计）：
 *  - 0 → `¥0.00`
 *  - (0, 0.01) → `<¥0.01`：单次对话消耗常在 1e-5 量级，原型的 4 位小数会渲染成 `¥0.0000`，
 *    与「免费」无法区分（shared/modelgo_prd#361）；此处改为最小可见金额兜底，不再补零到 4 位
 *  - ≥0.01 → 2 位小数 */
export function formatSpendAmount(spend: number, symbol: string): string {
  // 符号由调用方从 useCurrency()（platform-config.settlement_currency）取，与 formatMoney /
  // formatBudget 同一套模式。shared/modelgo_prd#372：此前这里写死 ¥，国际站
  // （settlement_currency=USD）也显示人民币符号。
  if (!(spend > 0)) return `${symbol}0.00`
  return spend < 0.01 ? `<${symbol}0.01` : `${symbol}${spend.toFixed(2)}`
}

/** 消耗文案：免费模型显示「免费额度」，否则按 formatSpendAmount 展示金额 */
export function formatPlaygroundSpend(metrics: Pick<ExperienceMessageMetrics, 'spend' | 'free'>, symbol: string): string {
  if (metrics.free) return i18n.t('modelsExperience.freeQuota')
  return formatSpendAmount(metrics.spend, symbol)
}

/** Token 数粗估（无 tokenizer，按字符数/4 估算）——仅作 SSE 统计帧到达前的占位，
 *  真实 Token 数以后端 `modelgo.stats` 帧的 input_tokens/output_tokens 为准 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4))
}

/** composer 底部预估费用（原型 estimatePlaygroundTaskSpend）：token 模型按草稿估 input token、
 *  输出取 min(400, max_tokens) 上限；per_call（按张/按次，文生图类）一次发送 = 一次调用，
 *  预估就是单张价——token 那套会把 ¥0.2/张 当 ¥0.2/1M token 算成 <¥0.01（prd#851）。
 *  取价口径与 dualPriceText / CatalogCard 一致：per_call_price 缺省回落 input_per_1m 镜像。 */
export function estimateComposerSpend(
  model: Pick<CatalogModelItem, 'pricing'> | null | undefined,
  draftText: string,
  maxTokens: number,
  symbol: string,
): string {
  if (!model) return formatSpendAmount(0, symbol)
  if (model.pricing?.mode === 'per_call') {
    const perCall = Number(model.pricing.per_call_price || model.pricing.input_per_1m || 0)
    return formatSpendAmount(perCall, symbol)
  }
  const inputPrice = Number(model.pricing?.input_per_1m ?? 0)
  const outputPrice = Number(model.pricing?.output_per_1m ?? 0)
  if (!inputPrice && !outputPrice) return formatSpendAmount(0, symbol)
  const spend = (estimateTokens(draftText) * inputPrice + Math.min(400, maxTokens) * outputPrice) / 1_000_000
  return formatSpendAmount(spend, symbol)
}

/** 图片/视频产物标题 · 规格明细行（PRD §7.10 PlaygroundArtifactCard 逐字对齐：
 *  title = 用户输入文本 || 附件文件名 || 任务默认标签；detail 按任务类型拼规格参数）。
 *  chatParams 取的是发送这轮时 ModelSettingsModal 里的比例/分辨率/格式等配置，缺省值
 *  与各任务参数表单的默认值保持一致（ImageParamsForm/VideoParamsForm）。 */
export function buildMediaArtifactTitle(prompt: string, attachmentName: string | undefined, task: ExperienceTaskType): string {
  return prompt.trim() || attachmentName || experienceTaskLabel(task)
}

export function buildMediaArtifactDetail(task: ExperienceTaskType, chatParams: Record<string, unknown>, outputIndex: number): string | undefined {
  const str = (key: string, fallback: string) => {
    const v = chatParams[key]
    return typeof v === 'string' && v ? v : fallback
  }
  if (task === 'text_to_image' || task === 'image_to_image') {
    const resolution = str('resolution', '1024')
    const aspectRatio = str('aspect_ratio', '1:1')
    const format = str('format', 'PNG')
    return i18n.t('modelsExperience.artifactDetailImage', { resolution, aspectRatio, format, index: outputIndex + 1 })
  }
  if (task === 'text_to_video' || task === 'image_to_video') {
    const resolution = str('resolution', '720p')
    const duration = str('duration', '5')
    const aspectRatio = str('ratio', str('aspect_ratio', '16:9'))
    return i18n.t('modelsExperience.artifactDetailVideo', { resolution, duration, aspectRatio, index: outputIndex + 1 })
  }
  return undefined
}

/**
 * 目录模型的请求缺省参数。模型体验把设置持久化在会话配置中，媒体消息本身不重复
 * 传这些参数；因此这里的缺省值也必须在创建会话时写入配置，不能只用于设置弹窗展示。
 *
 * MiniMax H3 的计费矩阵以 input_mode + resolution 为键，缺少 resolution 会在预授权
 * 阶段拒绝请求；其文生视频 provider 同时要求 ratio 且不接受 adaptive。图生视频由
 * 首帧决定画幅，不能强制写 16:9。其有效枚举不是通用视频表单的 720p/1080p，
 * 故显式选用目录中已配置价格的 768p 作为文生视频默认值。
 */
export function defaultExperienceParams(modelId: string, task: ExperienceTaskType): Record<string, unknown> {
  if (modelId === 'minimax-h3' && task === 'text_to_video') {
    return { resolution: '768p', ratio: '16:9' }
  }
  if (modelId === 'minimax-h3' && task === 'image_to_video') return { resolution: '768p' }
  return {}
}

/** 合并配置时永远保留模型必填默认项；用户已选值优先。 */
export function withDefaultExperienceParams(
  modelId: string,
  task: ExperienceTaskType,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const defaults = defaultExperienceParams(modelId, task)
  const merged = { ...defaults, ...params }
  if (modelId === 'minimax-h3' && (task === 'text_to_video' || task === 'image_to_video')) {
    // 旧会话可能已经把通用设置键 aspect_ratio 存进 config；迁移为 H3 provider
    // 使用的 ratio。新设置面板已直接写 ratio，避免用户的显式选择被默认值覆盖。
    const aspectRatio = typeof params.aspect_ratio === 'string' ? params.aspect_ratio : undefined
    if (aspectRatio) return { ...merged, ratio: aspectRatio }
  }
  return merged
}

/** 设置弹窗的 resolution 枚举与实际模型契约保持一致。 */
export function videoResolutionOptions(modelId: string): string[] {
  return modelId === 'minimax-h3' ? ['768p', '2k'] : ['720p', '1080p']
}

/**
 * 已知的 provider/网关英文报错关键词 → 用户可读文案。理论依据：模型调用直接报错的
 * 原始技术信息（如 `model is not allowed by policy`）不该原样甩给用户看（qa#576 追问）。
 * 命中不了任何已知模式时兜底展示通用文案，原始串打进 console.error 供排查，不再展示给用户。
 */
const UPSTREAM_ERROR_PATTERNS: Array<[RegExp, string]> = [
  [/not allowed by policy|policy violation|model_not_allowed/i, 'modelsExperience.errorModelNotAllowed'],
  [/provider_unsupported|unsupported protocol|no available provider|unknown provider/i, 'modelsExperience.errorProviderUnavailable'],
  [/rate limit|too many requests|\b429\b/i, 'modelsExperience.errorRateLimited'],
  [/insufficient_quota|quota exceeded/i, 'modelsExperience.errorInsufficientQuota'],
  [/timed? ?out/i, 'modelsExperience.errorTimeout'],
  [/unauthorized|invalid credential|\b401\b/i, 'modelsExperience.errorUpstreamAuth'],
]

/** 把已提取出的错误文本归一成用户可读文案；已经是中文人话（后端 field_errors 之类）直接展示，
 *  英文技术错误串按已知模式分类，都不命中则展示通用兜底文案而不是原样透传。 */
function friendlyUpstreamError(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return i18n.t('modelsExperience.sendFailed')
  if (/[一-龥]/.test(trimmed)) return trimmed
  const hit = UPSTREAM_ERROR_PATTERNS.find(([pattern]) => pattern.test(trimmed))
  if (hit) return i18n.t(hit[1])
  console.error('[modelsExperience] unmapped upstream error:', trimmed)
  return i18n.t('modelsExperience.errorUpstreamGeneric')
}

/** 从可能是 JSON.stringify 过的信封字符串里挖出一句人话，解不出就原样返回；
 *  被 cleanErrorMessage 与 resolveApiErrorDisplay 共用（后者要保留未归一的原文做详情）。 */
function unwrapEnvelopeText(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string }
      msg?: string
      data?: { details?: Array<{ message?: string }> }
    }
    return parsed.data?.details?.[0]?.message ?? parsed.msg ?? parsed.error?.message ?? raw
  } catch {
    return raw
  }
}

/**
 * 历史消息里 status="failed" 行的 error 字段，实测后端存的是上游原始错误信封整个
 * JSON.stringify 之后的字符串（例如护栏拦截会把 {"error":{"code":403,"message":"..."}}
 * 整个当字符串塞进去），不是一句人话——这里做前端兜底清洗+归一成用户可读文案。
 * 单模型页/对比页共用（qa#546 对比页历史恢复需要同样的清洗）。
 */
export function cleanErrorMessage(raw: string | undefined): string {
  if (!raw) return i18n.t('modelsExperience.sendFailed')
  return friendlyUpstreamError(unwrapEnvelopeText(raw))
}

/**
 * 从抛出的请求错误里挖出人话消息。媒体任务失败走 §5.2 的
 * data.field_errors[].code=PLAYGROUND_MEDIA_FAILED、message=上游原始错误摘要——
 * 实测这个 message 本身又是一层 JSON.stringify 过的原始信封（同 cleanErrorMessage
 * 处理的历史消息 error 字段一个毛病），要再解一层，否则只会显示信封外层的
 * "参数校验失败" 泛用文案。
 */
export function extractApiErrorMessage(err: unknown): string {
  const data = (err as { data?: { field_errors?: Array<{ message?: string }>; details?: Array<{ message?: string }> } } | undefined)?.data
  const raw = data?.field_errors?.[0]?.message ?? data?.details?.[0]?.message
  if (raw) return cleanErrorMessage(raw)
  const message = (err as Error).message
  return message ? friendlyUpstreamError(message) : i18n.t('modelsExperience.retryLater')
}

/** 网关/上游错误分类落地契约（qa#549）：这四档外层 msg 由后端按 Accept-Language 本地化，
 *  直接展示即可，不用再挖 field_errors 里的上游原始英文；40031（5xx/传输失败）是唯一
 *  「重试可能成功」的档，其余三档是确定性失败——展示重试入口只会让用户/接入方对一个
 *  必败请求反复重试（本单根因）。码不在这四档里（未知/旧格式）时走历史兜底链路，
 *  按可重试处理，不改变既有行为。 */
const KNOWN_ENVELOPE_CODES = new Set([40031, 40032, 40033, 40301])
const RETRYABLE_ENVELOPE_CODES = new Set([40031])

interface EnvelopeLike {
  code?: number
  rawMessage?: string
  requestId?: string
  traceId?: string
  data?: { field_errors?: Array<{ message?: string }>; details?: Array<{ message?: string }> }
}

/** message.error 是持久化字符串（历史上可能是整段 JSON.stringify 过的信封），能解出
 *  数字 code 就按新契约走；解不出（当前 Swagger 里 experience.Message.error 就是纯字符串，
 *  没有独立 code 字段）就返回 undefined，交给下面的兜底链路——不假设后端一定给了 code。 */
function parseStoredErrorEnvelope(raw: string): EnvelopeLike | undefined {
  try {
    const parsed = JSON.parse(raw) as {
      code?: number
      msg?: string
      request_id?: string
      trace_id?: string
      data?: EnvelopeLike['data']
    }
    if (typeof parsed.code !== 'number') return undefined
    return { code: parsed.code, rawMessage: parsed.msg, requestId: parsed.request_id, traceId: parsed.trace_id, data: parsed.data }
  } catch {
    return undefined
  }
}

function toEnvelopeLike(err: unknown): EnvelopeLike | undefined {
  return typeof err === 'string' ? parseStoredErrorEnvelope(err) : (err as EnvelopeLike | undefined)
}

export interface ApiErrorDisplay {
  /** 用户可见主文案：命中已知档用外层 msg（已本地化），否则走 extractApiErrorMessage/cleanErrorMessage 兜底链路 */
  message: string
  /** 上游供应商原始报错（含供应商名与其内部 request_id），只放"查看详情"，不做标题 */
  upstreamDetail?: string
  /** 是否值得展示"重试"入口；未知错误默认按可重试处理（保留历史行为，多数是瞬时故障） */
  retryable: boolean
  /** 我方 request_id/trace_id（非供应商的），排障用 */
  requestId?: string
  traceId?: string
}

/** 媒体/体验错误的统一展示口径（qa#549）：区分"值得重试"与"确定性失败"，
 *  上游供应商原文降级为详情，不做用户可见标题。err 可以是抛出的 ModelGoApiError
 *  实例，也可以是持久化的 message.error 字符串（历史消息/轮询终态）。 */
export function resolveApiErrorDisplay(err: unknown): ApiErrorDisplay {
  const envelope = toEnvelopeLike(err)
  const upstreamRaw = envelope?.data?.field_errors?.[0]?.message ?? envelope?.data?.details?.[0]?.message
  const upstreamDetail = upstreamRaw ? unwrapEnvelopeText(upstreamRaw) : undefined
  if (envelope?.code !== undefined && KNOWN_ENVELOPE_CODES.has(envelope.code)) {
    return {
      message: envelope.rawMessage || i18n.t('modelsExperience.retryLater'),
      upstreamDetail,
      retryable: RETRYABLE_ENVELOPE_CODES.has(envelope.code),
      requestId: envelope.requestId,
      traceId: envelope.traceId,
    }
  }
  return {
    message: typeof err === 'string' ? cleanErrorMessage(err) : err ? extractApiErrorMessage(err) : i18n.t('modelsExperience.sendFailed'),
    upstreamDetail,
    retryable: true,
    requestId: envelope?.requestId,
    traceId: envelope?.traceId,
  }
}

/** ApiErrorDisplay → ExperienceMessage 错误字段，四个调用点（单模型页/对比页各自的
 *  同步发送失败 + 历史恢复）共用，避免每处手写四行赋值。message.error 主文案通常还要
 *  拼一个"请求失败："前缀，调用方在 spread 之后按需覆盖 error 字段即可。 */
export function errorDisplayFields(display: ApiErrorDisplay): Pick<ExperienceMessage, 'error' | 'errorDetail' | 'errorRetryable' | 'errorRequestId' | 'errorTraceId'> {
  return {
    error: display.message,
    errorDetail: display.upstreamDetail,
    errorRetryable: display.retryable,
    errorRequestId: display.requestId,
    errorTraceId: display.traceId,
  }
}

/** 十类体验任务枚举 → 展示文案，取自后端接口文档 §二 task 值域（字面值以文档为准；
 *  video_to_video 为 2026-08-03 qa#584 后端新增第十类，shared#319 视频生视频） */
export type ExperienceTaskType =
  | 'text_to_text'
  | 'image_to_text'
  | 'video_to_text'
  | 'text_to_image'
  | 'image_to_image'
  | 'text_to_audio'
  | 'audio_to_text'
  | 'text_to_video'
  | 'image_to_video'
  | 'video_to_video'

/** 任务类型 → 展示文案；用函数而非常量表是因为要在每次调用时按当前语言取值（模块加载时算一次会在切语言后过期） */
export function experienceTaskLabel(task: ExperienceTaskType): string {
  return i18n.t(`modelsExperience.taskLabel.${task}`)
}

/** 一级类别，PRD 1.0.4 原文四类。单模型页/对比页/ModelPickerDialog 共用同一份分类推断逻辑。 */
export type ExperienceCategoryKey = 'dialogue' | 'image' | 'audio' | 'video'

export const EXPERIENCE_CATEGORY_TASKS: Record<ExperienceCategoryKey, ExperienceTaskType[]> = {
  dialogue: ['text_to_text', 'image_to_text', 'video_to_text'],
  image: ['text_to_image', 'image_to_image'],
  audio: ['text_to_audio', 'audio_to_text'],
  video: ['text_to_video', 'image_to_video', 'video_to_video'],
}

export const EXPERIENCE_CATEGORY_ORDER: ExperienceCategoryKey[] = ['dialogue', 'image', 'audio', 'video']

export function experienceCategoryLabel(category: ExperienceCategoryKey): string {
  return i18n.t(`modelsExperience.categoryLabel.${category}`)
}

/** 每个类别的默认任务——没有参考附件时用这个（image_to_image/image_to_video 等"需要附件"的
 *  任务由发送时是否带附件决定，不在这里判断，见 §7.5「必须携带」列表） */
export const EXPERIENCE_CATEGORY_DEFAULT_TASK: Record<ExperienceCategoryKey, ExperienceTaskType> = {
  dialogue: 'text_to_text',
  image: 'text_to_image',
  audio: 'text_to_audio',
  video: 'text_to_video',
}

/** 空态图标/文案按类别区分（PRD §7.9 各任务空态，原型 App.tsx:19317-19322 逐字对齐）。
 *  单模型页/对比页共用（qa#543 对比页接入多模态后需要同一份文案）。 */
const CATEGORY_EMPTY_ICON: Record<ExperienceCategoryKey, IconType> = {
  dialogue: LuZap,
  image: LuImage,
  audio: LuAudioLines,
  video: LuVideo,
}

/** 标题按任务、不按类别区分（原型 App.tsx:19327 `配置输入后开始${taskDefinition.shortLabel}`）——
 *  同一类别下 text_to_image/image_to_image 等任务的 shortLabel 不同（文生图/图生图），
 *  之前按 category 取值会让整类共用一句泛化文案，丢失任务差异。 */
export function categoryEmptyCopy(task: ExperienceTaskType): { icon: IconType; title: string; hint: string } {
  const category = taskToCategory(task) ?? 'dialogue'
  return {
    icon: CATEGORY_EMPTY_ICON[category],
    title: category === 'dialogue'
      ? i18n.t('modelsExperience.categoryEmpty.dialogue.title')
      : i18n.t('modelsExperience.categoryEmpty.taskTitle', { task: experienceTaskLabel(task) }),
    hint: i18n.t(`modelsExperience.categoryEmpty.${category}.hint`),
  }
}

/** composer 占位符按类别区分（原型 App.tsx:18475-18485 逐字对齐）。单模型页/对比页共用。 */
export function categoryPlaceholder(category: ExperienceCategoryKey): string {
  return i18n.t(`modelsExperience.categoryPlaceholder.${category}`)
}

/**
 * 会话模型配置的键名归一（shared/modelgo_prd#315）：系统提示词后端只认 system_prompt，
 * 历史会话的已存 config 里可能还是旧键 systemPrompt（当年就没生效过），拉回来时就地
 * 改名，让旧配置在弹窗里可见、重新保存后即生效。单模型页/对比页两个加载点共用。
 */
export function normalizeChatParams(config: Record<string, unknown>): Record<string, unknown> {
  if (!('systemPrompt' in config)) return config
  const { systemPrompt, ...rest } = config
  return { system_prompt: rest.system_prompt ?? systemPrompt, ...rest }
}

/** 附件类型/大小上限（PRD §7.5），accept 给 <input type="file"> 用。单模型页/对比页共用（qa#545）。 */
export const ATTACHMENT_LIMITS = {
  image: { maxBytes: 10 * 1024 * 1024, accept: '.png,.jpg,.jpeg,.webp' },
  audio: { maxBytes: 25 * 1024 * 1024, accept: '.mp3,.wav,.m4a,.ogg,.webm' },
  video: { maxBytes: 100 * 1024 * 1024, accept: '.mp4,.webm,.mov' },
} as const

export function attachmentLimitLabel(kind: keyof typeof ATTACHMENT_LIMITS): string {
  return i18n.t(`modelsExperience.attachmentLimitLabel.${kind}`)
}

export function attachmentKindFromMime(mime: string): keyof typeof ATTACHMENT_LIMITS | null {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  return null
}

/** 模型是否真的接受该附件类型：看 input_modalities（比类别粗粒度的 ATTACHMENT_LIMITS 更准——
 *  同类别里未必所有模型都收同一种输入模态）。单模型页/对比页/模型选择器三处共用（原为
 *  models-compare 页内部函数，PRD 原型里选模型时也要用同一判断来禁用不支持当前附件的模型，
 *  故提到这个共享文件）。 */
export function modelSupportsAttachment(model: CatalogModelItem, kind: string): boolean {
  const inputMods = model.input_modalities ?? model.modalities ?? []
  return inputMods.includes(kind)
}

/**
 * dialogue 类多模态子任务：image_to_text/video_to_text 没有「先选后传」的产品形态，
 * 附件在场与否直接决定 task——这点 PRD 原型与现状一致。image/audio/video 三类改用
 * 显式选定的 task（见 ModelPickerDialog 的「可体验任务」按钮组），不再靠附件反推——
 * 此前把这三类也塞进同一个函数是对 PRD 的误读：PRD 原型里这三类 task 由用户在模型
 * 选择器里主动选定并写入 session，不因附件出现与否变化（App.tsx:17800
 * selectModelTask / 19781-19797「可体验任务」按钮组，2026-07-29 本地起 PRD 原型用
 * ego-lite 实测过，GPT-5 Image 切「文生图/图生图」瞬间提交+关弹层，不是等附件出现
 * 再反推）。
 */
export function resolveDialogueTask(attachmentKind: string | null): ExperienceTaskType {
  if (attachmentKind === 'image') return 'image_to_text'
  if (attachmentKind === 'video') return 'video_to_text'
  return 'text_to_text'
}

/** 需要「先传文件才能发」的三个任务（PRD §7.5 必须携带附件列表 / App.tsx:16951
 *  isPlaygroundTaskNeedsFile 逐字对齐）。这三个任务的 composer 用专门上传区替换
 *  掉通用回形针，其余任务(text_to_image/text_to_audio/text_to_video/对话类)不显示。 */
const TASK_NEEDS_FILE = new Set<ExperienceTaskType>(['image_to_image', 'audio_to_text', 'image_to_video', 'video_to_video'])

export function taskNeedsFile(task: ExperienceTaskType): boolean {
  return TASK_NEEDS_FILE.has(task)
}

/** needs-file 任务对应的附件类型，供上传区 accept/校验复用 ATTACHMENT_LIMITS */
export function taskAttachmentKind(task: ExperienceTaskType): keyof typeof ATTACHMENT_LIMITS | null {
  if (task === 'image_to_image' || task === 'image_to_video') return 'image'
  if (task === 'audio_to_text') return 'audio'
  if (task === 'video_to_video') return 'video'
  return null
}

function taskToCategory(task: string): ExperienceCategoryKey | undefined {
  for (const cat of EXPERIENCE_CATEGORY_ORDER) {
    if (EXPERIENCE_CATEGORY_TASKS[cat].includes(task as ExperienceTaskType)) return cat
  }
  return undefined
}

// ─── 模态推导核心（口径变更 2026-07-31，需求方拍板）───────────────────────────
// experience_types 字段将被后端删除，类别与可体验任务一律由 input/output_modalities
// 推导——对齐 PRD 原型 modelPlaygroundDomain.ts 的推导式设计（getPlaygroundCategory/
// getPlaygroundTasks）：「暂未开放」不是开关字段，而是**推导结果为空**的自然表达。
// ⚠️ 前提是模态数据准确（embedding 类模型 output 不得错标成 text，否则会被推导成
// 对话模型出假入口）——数据准确性要求已落 qa#581。

/**
 * 模态推导只读这三个字段。参数收窄成 Pick 是为了让相关模型条（CatalogRelatedModel，
 * 只有 output_modalities、没有 input 侧）也能走同一套类别判定（shared/modelgo_prd#861）
 * —— 媒体判别若在别处再写一份，audio+text omni 归对话这类细则迟早分叉。
 */
export type ModalitySource = Partial<Pick<CatalogModelItem, 'input_modalities' | 'output_modalities' | 'modalities'>>

function inputMods(model: ModalitySource): string[] {
  return model.input_modalities ?? model.modalities ?? []
}

function outputMods(model: ModalitySource): string[] {
  return model.output_modalities ?? model.modalities ?? []
}

/**
 * 推断模型所属一级类别，只看模态、不再读 experience_types：
 * 输出含媒体的按产物归类（优先级 video > audio > image——#297 回归教训：gemini
 * out=[text,image] 本体是图像生成模型，不因兼具聊天能力归对话）；纯文本输出的
 * 全模态模型归对话（#297 正向教训：mimo/seed 系不因输入含音频被判成语音识别）；
 * 纯音频输入且无文本输入的是 ASR，归音频类。输出 transcription 的 ASR 同样归音频类
 * （广场类型是「语音转写」，体验入口仍是 audio_to_text）。
 *
 * audio 与 image 规则不同（shared/modelgo_prd#821）：只有**纯音频输出**才归音频类。
 * out 同时含 text+audio 的是 omni 对话模型（qwen-omni-turbo 实况）——它的 audio 是
 * chat completions 的输出形态，不是 /v1/audio/speech（TTS）能力；按 #297 的
 * 媒体优先规则归 audio 会把它列进「文本转语音」入口，点了必失败（cn 该任务
 * 上线以来 0 成功，两个上游都没有 audio_speech 接口）。专职 TTS 模型输出只有
 * audio，不受影响。
 */
export function resolveModelCategory(model: ModalitySource): ExperienceCategoryKey {
  const out = outputMods(model)
  const inp = inputMods(model)
  if (out.includes('video')) return 'video'
  if (out.includes('transcription')) return 'audio'
  if (out.includes('audio') && !out.includes('text')) return 'audio'
  if (out.includes('image')) return 'image'
  if (!inp.includes('text') && inp.includes('audio')) return 'audio'
  return 'dialogue'
}

/**
 * 模型全部可体验任务（PRD 原型 getPlaygroundTasks 的模态版）：类别内按输入模态
 * 交叉推导。老数据输入/输出模态缺失时按文本兜底，避免误伤存量 LLM；输出既非
 * 四类媒体也非文本（如 embedding 向量）推不出任务 → 空集 = 暂未开放（§AC-13）。
 */
export function modelExperienceTasks(model: CatalogModelItem): ExperienceTaskType[] {
  const inp = inputMods(model)
  const out = outputMods(model)
  const hasTextIn = inp.length === 0 || inp.includes('text')
  const tasks: ExperienceTaskType[] = []
  switch (resolveModelCategory(model)) {
    case 'dialogue': {
      if (out.length > 0 && !out.includes('text')) break
      if (hasTextIn) tasks.push('text_to_text')
      if (inp.includes('image')) tasks.push('image_to_text')
      if (inp.includes('video')) tasks.push('video_to_text')
      break
    }
    case 'image':
      if (hasTextIn) tasks.push('text_to_image')
      if (inp.includes('image')) tasks.push('image_to_image')
      break
    case 'audio':
      if (out.includes('audio') && hasTextIn) tasks.push('text_to_audio')
      if (inp.includes('audio') && (out.includes('text') || out.includes('transcription'))) tasks.push('audio_to_text')
      break
    case 'video':
      if (hasTextIn) tasks.push('text_to_video')
      if (inp.includes('image')) tasks.push('image_to_video')
      if (inp.includes('video')) tasks.push('video_to_video')
      break
  }
  return tasks
}

/** 某个模型在给定一级类别下，实际可体验的任务子集（模态推导 ∩ 类别任务表）。
 *  用于渲染「可体验任务」按钮组：>=2 个才需要显式切换，1 个时任务已定、不显示按钮组。 */
export function modelCategoryTasks(model: CatalogModelItem, category: ExperienceCategoryKey): ExperienceTaskType[] {
  const all = EXPERIENCE_CATEGORY_TASKS[category]
  const derived = modelExperienceTasks(model)
  const filtered = all.filter((task) => derived.includes(task))
  // 跨类别调用（如恢复历史时模型已换）推导子集可能为空，退化为该类别全部任务，
  // 保持与旧版兜底口径一致，避免恢复态渲染不出任务
  return filtered.length > 0 ? filtered : all
}

/** 模型「进场」任务偏好。视频模型统一使用类别首任务文生视频作为默认入口；图片/视频输入
 * 仅表示可用能力，并不代表参考帧必填，用户可通过任务切换显式选择图生/视频生视频。 */
export function modelPreferredTask(model: CatalogModelItem, category: ExperienceCategoryKey): ExperienceTaskType | null {
  void model
  void category
  return null
}

/** 模型在给定类别下、没有任何已选任务时的默认任务：优先类别默认，类别默认该模型不支持就取第一个可体验任务。 */
export function modelDefaultTask(model: CatalogModelItem, category: ExperienceCategoryKey): ExperienceTaskType {
  const tasks = modelCategoryTasks(model, category)
  const fallback = EXPERIENCE_CATEGORY_DEFAULT_TASK[category]
  return tasks.includes(fallback) ? fallback : tasks[0]
}

/** 换到某个模型（未显式指定任务）时应落到的任务。视频模型始终从第一个可体验任务
 * 文生视频进入；其余类别保留当前兼容任务，无法兼容才退到默认任务。 */
export function modelEntryTask(model: CatalogModelItem, category: ExperienceCategoryKey, currentTask?: ExperienceTaskType | null): ExperienceTaskType {
  if (category === 'video') return modelDefaultTask(model, category)
  const tasks = modelCategoryTasks(model, category)
  return currentTask && tasks.includes(currentTask) ? currentTask : modelDefaultTask(model, category)
}

/** 模型是否有任何可体验任务（PRD 模型广场 §AC-13「暂未开放」判定依据，
 *  原型 App.tsx:4619 `getPlaygroundTasks(model).length === 0` 同语义的模态推导版） */
export function hasPlaygroundExperience(model: CatalogModelItem): boolean {
  return modelExperienceTasks(model).length > 0
}

/**
 * 会话里引用的模型已不在当前目录（下线/删除）时的占位展示（PRD §AC-18 下线模型）。
 * 单模型页/对比页共用——只用于渲染模型条（名称/头像/状态），不可用于真实发送，
 * 该列/该会话后续操作前必须先换成目录里的真实模型。
 */
export function offlineModelPlaceholder(modelId: string): CatalogModelItem {
  return {
    id: modelId,
    model_id: modelId,
    display_name: modelId,
    modalities: [],
    tags: [],
    context_length: 0,
    max_output_tokens: 0,
    pricing: { input_per_1m: '0', output_per_1m: '0', cache_read_per_1m: '0', currency: 'CNY' },
    released_at: '',
    knowledge_cutoff: '',
    status: 'unavailable',
    logo_url: '',
  }
}

/** 模型是否已下线（PRD §AC-18 判定依据），modelbar/composer 据此切到只读态 */
export function isOfflineModel(model: CatalogModelItem): boolean {
  return model.status === 'unavailable'
}

/**
 * 是否对话类（LLM）模型。体验页只支持文本对话（experience/chat/completions），
 * 故排除视频/音频生成模型。判定：不含 video/audio 模态，且含 text 模态（或无模态信息）。
 * 无模态信息默认按文本对待（避免数据缺失误伤 LLM）。
 * 含 image 模态（多模态视觉 LLM）仍保留，它们能正常走文本对话。
 */
/** 空态示例 Prompt（逐字取自原型 App.tsx:17000-17023 playgroundSamplePrompts 的 label/prompt，回复由后端真实生成） */
export function playgroundSamplePrompts(): Array<{ label: string; prompt: string }> {
  return [
    { label: i18n.t('modelsExperience.samplePrompts.compare.label'), prompt: i18n.t('modelsExperience.samplePrompts.compare.prompt') },
    { label: i18n.t('modelsExperience.samplePrompts.explain.label'), prompt: i18n.t('modelsExperience.samplePrompts.explain.prompt') },
    { label: i18n.t('modelsExperience.samplePrompts.translate.label'), prompt: i18n.t('modelsExperience.samplePrompts.translate.prompt') },
  ]
}

/**
 * 价格 chip 文案：与原型 App.tsx `playgroundPriceText()` 逐字对齐——
 * 免费模型「限时免费」；否则「¥输入价 / ¥输出价 每M」，只有输出价时省去输入价那半。
 * 单模型页与对比页共用（对比页每列头部也要展示同样的价格 chip）。
 *
 * 限免真源是 promotion.free 显式标记（原型首行 `if (model.free) return "限时免费"`），
 * 不从「价格为 0」推断——后端零价下发的是字符串 "0"（truthy），按 §9.1 未标 free 的
 * 零价模型仍按付费处理，显示「—」而不是「免费」（qa#624；与 ModelDetailPanel /
 * CatalogCard 的未配价口径一致）。
 *
 * 三种计价模式各走一条分支，别让它们互相兜底（需求方#674）：
 *   · price_tiers 有值 → 按档展示（视频按秒、图片矩阵价）
 *   · mode=per_call   → 单价 + /张，**没有输入/输出两段**
 *   · 其余（token）    → ¥输入 / ¥输出 每M
 */
export function dualPriceText(model: CatalogModelItem): string {
  const currency = model.pricing?.currency === 'USD' ? '$' : '¥'
  if (model.promotion?.free) return i18n.t('modelsExperience.limitedFree')
  if (model.price_tiers && model.price_tiers.length > 0) {
    return model.price_tiers
      .slice(0, 3)
      .map((tier) => `${currency}${trimPriceZeros(tier.price)}/${tier.unit}`)
      .join(' · ')
  }
  // 按次/按张计价（文生图等）：只有一个单价，硬套 token 那套会显示成
  // 「¥0.22 / ¥0 每M」——每张的价被当成输入价、不存在的输出价补成 ¥0、单位错成每 M token。
  // 需求方#674 报的就是这个（Doubao Seedream 5.0 Lite）。单位复用 priceUnitSuffix，
  // 与模型广场卡片、模型详情面板同一函数，避免同一模型在三处显示不同单位（#675）。
  if (model.pricing?.mode === 'per_call') {
    const perCall = model.pricing.per_call_price?.trim() || model.pricing.input_per_1m?.trim()
    if (!perCall || parseFloat(perCall) <= 0) return i18n.t('modelsExperience.freeQuota')
    return `${currency}${trimPriceZeros(perCall)}${priceUnitSuffix(model.price_unit, model.pricing.mode)}`
  }
  const input = model.pricing?.input_per_1m
  const output = model.pricing?.output_per_1m
  const perM = i18n.t('modelsExperience.perM')
  // 判零必须数值化：后端下发的是字符串 "0"，直接当 truthy 判会把未配价模型拼成
  // 「¥0 / ¥0 每M」（qa#624）。NaN > 0 为 false，缺省/脏数据一并落到未配价。
  const hasInput = parseFloat(input ?? '') > 0
  const hasOutput = parseFloat(output ?? '') > 0
  if (!hasInput && !hasOutput) return '—'
  if (!hasInput) return `${currency}${trimPriceZeros(output ?? '0')} ${perM}`
  return `${currency}${trimPriceZeros(input ?? '0')} / ${currency}${trimPriceZeros(output ?? input ?? '0')} ${perM}`
}

/** 是否付费模型：只认服务端显式限免标记 + 价格字段，不做其它推断（§9.1：价格为 0 但未标 free 的仍按付费处理） */
/**
 * 余额拦截条文案用：只有明确标了免费角标的模型才走「免费模型」场景文案。
 * 与 isPaidModel 的区别：未配价（无 pricing / price_tiers）的模型 isPaidModel 返回 false，
 * 但它并不是免费模型，套「免费模型需先充值」文案会误导（shared/modelgo_prd#833 复验 INFO-3）。
 */
export function isFreeModel(model: CatalogModelItem): boolean {
  return Boolean(model.promotion?.free)
}

/** 余额快照：spendable = 主 + 赠送 + 奖励（可消费合计）；main = 可用主余额（现金）。undefined = 未就绪。 */
export interface BalanceSnapshot {
  spendable: number | undefined
  main: number | undefined
}

/**
 * 余额是否锁定该模型的发送（本地预判，后端 billing 闸门才是真源，快照未就绪时不拦、交给后端 4032 兜底）。
 * - 免费模型（shared/modelgo_prd#1091）：**只看主余额 > 0**，赠送 / 奖励余额不计入，负数同样拒；
 *   与 billing `checkFreeModelBalanceGate` 同口径（原 #833 口径是可消费合计 > 0，已收窄）。
 * - 其它模型（#833 / §9.1）：可消费合计 > 0 才能发（#1104：现金欠款但赠金 / 奖励为正仍可用付费模型）。
 */
export function isModelLockedByBalance(model: CatalogModelItem, balance: BalanceSnapshot): boolean {
  const amount = isFreeModel(model) ? balance.main : balance.spendable
  return amount !== undefined && amount <= 0
}

export function isPaidModel(model: CatalogModelItem): boolean {
  if (model.promotion?.free) return false
  if ((model.price_tiers ?? []).some((tier) => parseFloat(tier.price) > 0)) return true
  const input = parseFloat(model.pricing?.input_per_1m ?? '0')
  const output = parseFloat(model.pricing?.output_per_1m ?? '0')
  return (Number.isFinite(input) && input > 0) || (Number.isFinite(output) && output > 0)
}

export function isChatModel(model: CatalogModelItem): boolean {
  const modalities = model.modalities ?? []
  if (modalities.length === 0) return true
  if (modalities.includes('video') || modalities.includes('audio')) return false
  return modalities.includes('text')
}

export function modalityBadges(model: CatalogModelItem) {
  return model.modalities.slice(0, 3).map((modality) => <ModalityBadge key={modality} modality={modality} />)
}

export function quotaPercent(model: CatalogModelItem) {
  if (model.status === 'disabled') return 0
  if (model.zero_data_retention) return 100
  return model.providers_count ? Math.min(100, 64 + model.providers_count * 7) : 86
}

/** 埋点用非加密短哈希（§10.2 dispatch_id_hash 等字段）：只为脱敏，非安全用途 */
export function hashId(input: string): string {
  let h = 0
  for (let i = 0; i < input.length; i++) h = (Math.imul(31, h) + input.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** 埋点耗时分桶（§10.3 playground_model_run_result.latency_bucket），边界为工程经验值 */
export function latencyBucket(ms: number): string {
  if (ms < 1000) return '<1s'
  if (ms < 3000) return '1-3s'
  if (ms < 10000) return '3-10s'
  if (ms < 30000) return '10-30s'
  return '>30s'
}

/** 埋点 Token 分桶（§10.3 playground_model_run_result.token_bucket） */
export function tokenBucket(tokens: number): string {
  if (tokens < 500) return '<500'
  if (tokens < 2000) return '500-2k'
  if (tokens < 8000) return '2k-8k'
  if (tokens < 32000) return '8k-32k'
  return '>32k'
}

/** 埋点附件大小分桶（§10.3 playground_attachment_result.size_bucket） */
export function sizeBucket(bytes: number): string {
  if (bytes < 1024 * 1024) return '<1MB'
  if (bytes < 10 * 1024 * 1024) return '1-10MB'
  if (bytes < 50 * 1024 * 1024) return '10-50MB'
  return '>50MB'
}
