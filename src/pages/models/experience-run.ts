/**
 * 模型体验「一次模型调用」的共享运行时（单模型页 /models/playground 与对比页
 * /models/compare 共用）
 *
 * 抽这一层的判断依据：两页的发送流程整体是同构的，但**状态写法差异很大**——单模型页写
 * 一个消息数组 + 一个 isStreaming boolean，对比页写列数组里每列自己的 history 与
 * streaming，还要做 dispatch 结算。把整条发送流程合成一个大 hook，差异只能靠一堆回调
 * 参数往外抛，复杂度换了个地方暴露，业务层反而更难读。
 *
 * 所以只抽三处**零差异**的机械重复，各自独立可用、无开关参数：
 *   - trackModelRun：run_result 埋点（原先 9 处逐字重复的字段映射）
 *   - buildDialogueMetrics / buildMediaMetrics：统计条字段拼装（stats 优先 + 本地兜底）
 *   - pollMediaTask：视频异步任务轮询到终态（原先两处各 25 行的 for(;;) 循环）
 *
 * 发送流程的编排（插消息、置 streaming、try/catch/finally 收尾）留在各自页面里——
 * 那部分是两页真正不同的地方，摊开写比参数化更好读。
 */
import { getExperienceMessage, type ExperienceStatsEvent, type SendMediaMessageResult } from '@/services/experience-sessions'
import { reportOnboardingStep } from '@/store/use-onboarding-store'
import { trackEvent } from '@/lib/track'
import {
  formatPlaygroundLatency,
  latencyBucket,
  tokenBucket,
  type ExperienceMessageMetrics,
} from './model-experience-data'

/**
 * 模型调用结果埋点（playground_model_run_result）。
 * 对话/媒体/异步视频、成功/失败共六条路径同一套字段，只有取值不同。
 */
export function trackModelRun(params: {
  modelId: string
  failed: boolean
  /** 总耗时毫秒，用于延迟分桶 */
  totalMs: number
  /** 输入+输出 token 合计；媒体任务传 0 */
  tokens?: number
  /** 是否免费；失败路径传 undefined，记为 unbilled */
  free?: boolean
  /** 失败时的后端错误码 */
  errorCode?: string
}) {
  const { modelId, failed, totalMs, tokens = 0, free, errorCode } = params
  trackEvent(
    'playground_model_run_result',
    {
      model_id: modelId,
      status: failed ? 'failed' : 'succeeded',
      latency_bucket: latencyBucket(totalMs),
      token_bucket: tokenBucket(tokens),
      billing_status: free === undefined ? 'unbilled' : free ? 'free' : 'billed',
    },
    failed ? { result: 'fail', ...(errorCode ? { error_code: errorCode } : {}) } : { result: 'success' },
  )

  // 新手指南第 2 步「选择模型并完成体验」：只认**成功**结果，进页面/选模型/失败重试都不算
  // （规格 §7 表 + §12「体验失败不完成对应步骤」）。体验页与对比页共用本函数，所以挂在这里
  // 而不是各自的 send 里，避免漏一条路径。
  // ⚠️ evidenceId 用 modelId 是 Mock 阶段的替代：这一层拿不到体验运行结果 ID，
  // 后端契约（store/use-onboarding-store.ts 末尾）要的是「成功的体验运行结果 ID」。
  if (!failed) reportOnboardingStep('playground', 'playground_success', modelId)
}

/** stats 帧缺失时的本地兜底值（各页按自己的口径算好后传进来） */
export interface DialogueMetricsFallback {
  inputTokens: number
  outputTokens: number
  firstTokenMs: number
  totalMs: number
  spend: number
  free: boolean
}

/**
 * 对话类统计条：有 stats 帧就用它，异常缺失时用调用方给的本地估算兜底，
 * 避免消息区完全没有统计信息。
 */
export function buildDialogueMetrics(params: {
  modelLabel: string
  stats: ExperienceStatsEvent | null
  fallback: DialogueMetricsFallback
}): ExperienceMessageMetrics {
  const { modelLabel, stats, fallback } = params
  const source = stats
    ? {
        inputTokens: stats.input_tokens,
        outputTokens: stats.output_tokens,
        firstTokenMs: stats.first_token_ms,
        totalMs: stats.total_ms,
        spend: Number(stats.actual_spend ?? stats.estimated_spend ?? 0),
        free: stats.free,
      }
    : fallback
  return {
    model: modelLabel,
    inputTokens: source.inputTokens,
    outputTokens: source.outputTokens,
    firstTokenLatency: formatPlaygroundLatency(source.firstTokenMs),
    totalLatency: formatPlaygroundLatency(source.totalMs),
    spend: source.spend,
    free: source.free,
    totalMs: source.totalMs,
  }
}

/**
 * 媒体类（图像/音频/视频）统计条：没有 token 与首 token 概念，只有耗时与花费。
 * 免费判定按花费为 0（媒体接口不返回 free 标记）。
 */
export function buildMediaMetrics(params: {
  modelLabel: string
  spend: number
  totalMs: number
}): ExperienceMessageMetrics {
  const { modelLabel, spend, totalMs } = params
  return {
    model: modelLabel,
    inputTokens: 0,
    outputTokens: 0,
    firstTokenLatency: '',
    totalLatency: formatPlaygroundLatency(totalMs),
    spend,
    free: spend === 0,
    totalMs,
  }
}

/**
 * 视频异步任务轮询（接口文档 5.3/5.4）：running 继续等，succeeded/failed 是终态。
 *
 * 单次轮询失败不放弃、继续等下一轮（PRD §8.3：保留最后已知状态，允许稍后重试）——
 * 这也意味着后端一直不给终态时它不会自己结束，调用方拿到结果前该列/该条消息保持
 * 「生成中」的展示态，与原实现一致。
 */
export async function pollMediaTask(
  conversationId: string,
  messageId: string,
  opts?: { intervalMs?: number },
): Promise<SendMediaMessageResult> {
  const intervalMs = opts?.intervalMs ?? 5000
  for (;;) {
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs))
    try {
      const result = await getExperienceMessage(conversationId, messageId)
      if (result.message.status === 'running') continue
      return result
    } catch {
      // 单次轮询失败不放弃，继续等下一轮
    }
  }
}
