import { LuZap, LuImage, LuAudioLines, LuVideo } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import i18n from '@/i18n'
import { ModalityBadge } from '@/features/models/components/ModalityBadge'
import { trimPriceZeros } from '@/lib/utils'
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
}

export interface ExperienceMessage {
  role: ChatRole
  content: string
  error?: string
  metrics?: ExperienceMessageMetrics
  modelName?: string
  modelLogo?: React.ReactNode
  /** 同步发送时同一轮的组标识，对比页用它来跨列计算最快/成本最低（§7.10/§11.1） */
  dispatchId?: string
  /** 媒体任务（文生图等）的产物，dialogue 任务恒为空 */
  media?: ExperienceMediaResult[]
  /** 用户消息发送时携带的附件 resource_id（媒体任务重试用，PRD §AC-13），dialogue 消息不使用 */
  attachmentResourceIds?: string[]
}

/** 延迟格式化：<1000ms 显示整数 ms，否则显示 x.xx s（App.tsx:17044 formatPlaygroundLatency 逐字对齐） */
export function formatPlaygroundLatency(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`
}

/** 消耗文案：免费模型显示「免费额度」，否则 ≥0.01 显示 2 位小数，否则 4 位（App.tsx:17054 formatPlaygroundSpend 逐字对齐） */
export function formatPlaygroundSpend(metrics: Pick<ExperienceMessageMetrics, 'spend' | 'free'>): string {
  if (metrics.free) return i18n.t('modelsExperience.freeQuota')
  return metrics.spend >= 0.01 ? `¥${metrics.spend.toFixed(2)}` : `¥${metrics.spend.toFixed(4)}`
}

/** Token 数粗估（无 tokenizer，按字符数/4 估算）——仅作 SSE 统计帧到达前的占位，
 *  真实 Token 数以后端 `modelgo.stats` 帧的 input_tokens/output_tokens 为准 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4))
}

/**
 * 历史消息里 status="failed" 行的 error 字段，实测后端存的是上游原始错误信封整个
 * JSON.stringify 之后的字符串（例如护栏拦截会把 {"error":{"code":403,"message":"..."}}
 * 整个当字符串塞进去），不是一句人话——这里做前端兜底清洗，解析不出来才展示原始字符串。
 * 单模型页/对比页共用（qa#546 对比页历史恢复需要同样的清洗）。
 */
export function cleanErrorMessage(raw: string | undefined): string {
  if (!raw) return i18n.t('modelsExperience.sendFailed')
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
  return (err as Error).message || i18n.t('modelsExperience.retryLater')
}

/** 九类体验任务枚举 → 展示文案，取自后端接口文档 §二 task 值域（字面值以文档为准） */
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
  video: ['text_to_video', 'image_to_video'],
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
const TASK_NEEDS_FILE = new Set<ExperienceTaskType>(['image_to_image', 'audio_to_text', 'image_to_video'])

export function taskNeedsFile(task: ExperienceTaskType): boolean {
  return TASK_NEEDS_FILE.has(task)
}

/** needs-file 任务对应的附件类型，供上传区 accept/校验复用 ATTACHMENT_LIMITS */
export function taskAttachmentKind(task: ExperienceTaskType): keyof typeof ATTACHMENT_LIMITS | null {
  if (task === 'image_to_image' || task === 'image_to_video') return 'image'
  if (task === 'audio_to_text') return 'audio'
  return null
}

/** 某个模型在给定一级类别下，实际可体验的任务子集（按 experience_types 过滤；
 *  该字段缺失/为空时退化为该类别全部任务——与 hasPlaygroundExperience/
 *  resolveModelCategory 同一套兜底口径，避免同一份数据两种解读）。用于渲染
 *  「可体验任务」按钮组：>=2 个才需要显式切换，1 个时任务已定、不显示按钮组。 */
export function modelCategoryTasks(model: CatalogModelItem, category: ExperienceCategoryKey): ExperienceTaskType[] {
  const all = EXPERIENCE_CATEGORY_TASKS[category]
  const declared = model.experience_types ?? []
  if (declared.length === 0) return all
  const filtered = all.filter((task) => declared.includes(task))
  return filtered.length > 0 ? filtered : all
}

function taskToCategory(task: string): ExperienceCategoryKey | undefined {
  for (const cat of EXPERIENCE_CATEGORY_ORDER) {
    if (EXPERIENCE_CATEGORY_TASKS[cat].includes(task as ExperienceTaskType)) return cat
  }
  return undefined
}

/**
 * 推断模型所属一级类别。优先取 experience_types（服务端下发的可体验任务，直接
 * 对应 PRD 任务枚举）；缺失时按输出模态兜底（老数据/字段未下发场景）。
 */
export function resolveModelCategory(model: CatalogModelItem): ExperienceCategoryKey {
  for (const task of model.experience_types ?? []) {
    const cat = taskToCategory(task)
    if (cat) return cat
  }
  const out = model.output_modalities ?? model.modalities ?? []
  if (out.includes('video')) return 'video'
  if (out.includes('audio')) return 'audio'
  if (out.includes('image') && !out.includes('text')) return 'image'
  return 'dialogue'
}

/** 模型是否配置了任意可体验任务（PRD 模型广场 §AC-13「暂未开放」判定依据，
 *  原型 App.tsx:4619 `getPlaygroundTasks(model).length === 0` 逐字对齐） */
export function hasPlaygroundExperience(model: CatalogModelItem): boolean {
  return (model.experience_types ?? []).length > 0
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
/** 空态示例 Prompt（逐字取自原型 App.tsx:17000-17023 playgroundSamplePrompts 的 label/prompt，回复由后端真实生成，不搬运原型的 mock replies） */
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
 */
export function dualPriceText(model: CatalogModelItem): string {
  const currency = model.pricing?.currency === 'USD' ? '$' : '¥'
  const input = model.pricing?.input_per_1m
  const output = model.pricing?.output_per_1m
  const perM = i18n.t('modelsExperience.perM')
  if (!input && !output) return i18n.t('modelsExperience.freeQuota')
  if (!input) return `${currency}${trimPriceZeros(output ?? '0')} ${perM}`
  return `${currency}${trimPriceZeros(input)} / ${currency}${trimPriceZeros(output ?? input)} ${perM}`
}

/** 是否付费模型：只认服务端显式限免标记 + 价格字段，不做其它推断（§9.1：价格为 0 但未标 free 的仍按付费处理） */
export function isPaidModel(model: CatalogModelItem): boolean {
  if (model.promotion?.free) return false
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
