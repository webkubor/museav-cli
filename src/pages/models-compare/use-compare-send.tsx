/**
 * 模型对比工作台发送层：单列发送/媒体轮询/dispatch 结算/共享与独立发送入口/失败重试
 * （PRD 1.0.4 模型体验 §6.2/7.3/7.4/7.9/7.10，§5.2-5.4，AC-13/AC-18）。
 * 依赖状态层 use-models-compare-state.tsx 提供的派生值/写句柄，不持有任何本地状态。
 */

import {
  streamExperienceMessage,
  sendExperienceMediaMessage,
  getExperienceMessage,
  type ExperienceStatsEvent,
} from '@/services/experience-sessions'
import { modelVendorLabel } from '@/features/models/model-format'
import { prettyModelName } from '@/lib/utils'
import { trackEvent } from '@/lib/track'
import {
  isPaidModel,
  estimateTokens,
  formatPlaygroundLatency,
  hashId,
  latencyBucket,
  tokenBucket,
  cleanErrorMessage,
  extractApiErrorMessage,
  buildMediaArtifactTitle,
  buildMediaArtifactDetail,
  resolveModelCategory,
  attachmentKindFromMime,
  modelSupportsAttachment,
  isOfflineModel,
  type ExperienceMessage,
  type ExperienceTaskType,
} from '../models/model-experience-data'
import type { DispatchAttachment } from './models-compare-utils'
import type { CompareState } from './use-models-compare-state'

/** 发送层：在状态层之上实现单列发送、媒体异步轮询与 dispatch 结算。 */
export function useCompareSend(state: CompareState) {
  const {
    t,
    columns,
    setColumns,
    sharedDraft,
    setSharedDraft,
    attachment,
    setAttachmentError,
    clearAttachment,
    replaceColumnMessageAttachmentPreview,
    clearColumnAttachment,
    columnAttachments,
    setColumnAttachmentErrors,
    pendingByDispatch,
    abortRefs,
    compareTask,
    compareNeedsFileTask,
    updateColumn,
    applyAssistant,
    refreshHistorySessions,
    isBalanceZero,
  } = state

  /** 单列发送——按该列模型的一级类别分叉（§6.2/§7.3/§7.9）：对话类走 SSE 流式，
   *  图像/音频类走同步媒体调用，视频类同步下发后转异步轮询。sync 模式下多列共用同一个
   *  dispatchId，用于事后计算最快/成本最低。 */
  async function sendOne(idx: number, prompt: string, dispatchId: string, attachment?: DispatchAttachment) {
    if (!columns) return
    const column = columns[idx]
    if (!column || column.streaming || !prompt) return
    const category = resolveModelCategory(column.model)
    if (category === 'dialogue') {
      await sendDialogueOne(idx, prompt, dispatchId, attachment)
    } else {
      await sendMediaOne(idx, prompt, dispatchId, attachment)
    }
  }

  async function sendDialogueOne(idx: number, prompt: string, dispatchId: string, attachment?: DispatchAttachment) {
    const column = columns![idx]
    updateColumn(idx, {
      streaming: true,
      history: [...column.history, {
        role: 'user', content: prompt, dispatchId, media: attachment?.media,
        attachmentResourceIds: attachment?.resourceIds,
      }, { role: 'assistant', content: '', dispatchId }],
    })
    abortRefs.current[idx]?.abort()
    const controller = new AbortController()
    abortRefs.current[idx] = controller
    const startedAt = Date.now()
    let stats: ExperienceStatsEvent | null = null

    try {
      const reply = await streamExperienceMessage({
        conversationId: column.conversationId,
        dispatchId,
        content: prompt,
        attachments: attachment?.resourceIds ?? [],
        signal: controller.signal,
        onDelta: (delta) => applyAssistant(idx, (content) => content + delta),
        onStats: (event) => { stats = event },
      })
      const modelLabel = prettyModelName(column.model.display_name, column.model.model_id, modelVendorLabel(column.model, ''))
      const hasStats = stats !== null
      const s = stats as ExperienceStatsEvent | null
      const totalMs = hasStats ? s!.total_ms : Date.now() - startedAt
      const inputTokens = hasStats ? s!.input_tokens : estimateTokens(prompt)
      const outputTokens = hasStats ? s!.output_tokens : estimateTokens(reply)
      const spend = hasStats ? Number(s!.actual_spend ?? s!.estimated_spend ?? 0) : 0
      const free = hasStats ? s!.free : (!Number(column.model.pricing?.input_per_1m ?? 0) && !Number(column.model.pricing?.output_per_1m ?? 0))
      const firstTokenMs = hasStats ? s!.first_token_ms : totalMs
      setColumns((prev) =>
        prev
          ? prev.map((c, i) => {
              if (i !== idx) return c
              const next = [...c.history]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') {
                next[next.length - 1] = {
                  ...last,
                  metrics: {
                    model: modelLabel,
                    inputTokens,
                    outputTokens,
                    firstTokenLatency: formatPlaygroundLatency(firstTokenMs),
                    totalLatency: formatPlaygroundLatency(totalMs),
                    spend,
                    free,
                    totalMs,
                  },
                }
              }
              return { ...c, history: next }
            })
          : prev,
      )
      trackEvent('playground_model_run_result', {
        model_id: column.model.model_id,
        status: 'succeeded',
        latency_bucket: latencyBucket(totalMs),
        token_bucket: tokenBucket(inputTokens + outputTokens),
        billing_status: free ? 'free' : 'billed',
      }, { result: 'success' })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      const errorCode = (err as { data?: { code?: string } } | undefined)?.data?.code
      setColumns((prev) =>
        prev
          ? prev.map((c, i) => {
              if (i !== idx) return c
              const next = [...c.history]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') next[next.length - 1] = { ...last, error: `${t('modelsExperience.requestFailed')}${extractApiErrorMessage(err)}` }
              return { ...c, history: next }
            })
          : prev,
      )
      trackEvent('playground_model_run_result', {
        model_id: column.model.model_id,
        status: 'failed',
        latency_bucket: latencyBucket(Date.now() - startedAt),
        token_bucket: tokenBucket(0),
        billing_status: 'unbilled',
      }, { result: 'fail', error_code: errorCode })
    } finally {
      updateColumn(idx, { streaming: false })
      settleDispatch(dispatchId)
    }
  }

  /** 图像/音频/视频类列发送（§5.2 同步 JSON / §5.3-5.4 视频异步轮询），qa#543/qa#545。
   *  不带附件时走各类别默认任务（text_to_image/text_to_audio/text_to_video）；带附件时
   *  仍然只传 attachments，task 在会话创建时已固定，后端按实际是否带附件处理。 */
  async function sendMediaOne(idx: number, prompt: string, dispatchId: string, attachment?: DispatchAttachment) {
    const column = columns![idx]
    const modelLabel = prettyModelName(column.model.display_name, column.model.model_id, modelVendorLabel(column.model, ''))
    // 发送这一刻的任务/参数配置算标题明细（PRD §7.10 artifact.title/detail），响应回来前
    // 用户可能已经改了这一列的设置，不能等结果回来时再读当前 chatParams
    const chatParamsAtSend = column.chatParams
    const artifactTitle = buildMediaArtifactTitle(prompt, undefined, compareTask)
    updateColumn(idx, {
      streaming: true,
      history: [
        ...column.history,
        { role: 'user', content: prompt, dispatchId, media: attachment?.media, attachmentResourceIds: attachment?.resourceIds },
        { role: 'assistant', content: '', dispatchId },
      ],
    })
    const startedAt = Date.now()
    let isAsyncVideo = false

    try {
      const { message, attachment_urls } = await sendExperienceMediaMessage({
        conversationId: column.conversationId,
        dispatchId,
        content: prompt,
        attachments: attachment?.resourceIds ?? [],
      })

      if (message.status === 'running' && message.async_task_id) {
        isAsyncVideo = true
        applyAssistant(idx, () => `${t('modelsExperience.videoGenerating')}[${t('modelsExperience.videoGeneratingLink')}](/logs?task_id=${encodeURIComponent(message.async_task_id!)})…`)
        void pollVideoColumn(idx, column.conversationId, message.id, modelLabel, dispatchId, artifactTitle, compareTask, chatParamsAtSend)
        return
      }

      const media = message.attachments.map((a, i) => ({
        kind: a.kind,
        url: attachment_urls[a.resource_id] ?? '',
        title: artifactTitle,
        detail: buildMediaArtifactDetail(compareTask, chatParamsAtSend, i),
      }))
      const spend = Number(message.actual_spend ?? 0)
      const totalMs = message.total_ms ?? Date.now() - startedAt
      setColumns((prev) =>
        prev
          ? prev.map((c, i) => {
              if (i !== idx) return c
              const next = [...c.history]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') {
                next[next.length - 1] = {
                  ...last,
                  content: message.content,
                  media: media.length > 0 ? media : undefined,
                  error: message.status === 'failed' ? (message.content ? undefined : t('modelsExperience.modelRunFailed')) : undefined,
                  metrics: {
                    model: modelLabel, inputTokens: 0, outputTokens: 0, firstTokenLatency: '',
                    totalLatency: formatPlaygroundLatency(totalMs), spend, free: spend === 0, totalMs,
                  },
                }
              }
              return { ...c, history: next }
            })
          : prev,
      )
      trackEvent('playground_model_run_result', {
        model_id: column.model.model_id,
        status: message.status === 'failed' ? 'failed' : 'succeeded',
        latency_bucket: latencyBucket(totalMs),
        token_bucket: tokenBucket(0),
        billing_status: spend === 0 ? 'free' : 'billed',
      }, { result: message.status === 'failed' ? 'fail' : 'success' })
    } catch (err) {
      const message = `${t('modelsExperience.requestFailed')}${extractApiErrorMessage(err)}`
      setColumns((prev) =>
        prev
          ? prev.map((c, i) => {
              if (i !== idx) return c
              const next = [...c.history]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') next[next.length - 1] = { ...last, error: message }
              return { ...c, history: next }
            })
          : prev,
      )
      const errorCode = (err as { data?: { field_errors?: Array<{ code?: string }> } } | undefined)?.data?.field_errors?.[0]?.code
      trackEvent('playground_model_run_result', {
        model_id: column.model.model_id,
        status: 'failed',
        latency_bucket: latencyBucket(Date.now() - startedAt),
        token_bucket: tokenBucket(0),
        billing_status: 'unbilled',
      }, { result: 'fail', error_code: errorCode })
    } finally {
      updateColumn(idx, { streaming: false })
      // 视频异步分支的 dispatch 结算延后到 pollVideoColumn 轮询终态，这里不提前计入
      if (!isAsyncVideo) settleDispatch(dispatchId)
    }
  }

  /** 视频列异步轮询（§5.4）：running 继续轮询，succeeded/failed 为终态。每列各自独立的
   *  轮询循环，互不阻塞——多列视频任务同时进行时各自按自己的节奏完成。 */
  async function pollVideoColumn(
    idx: number,
    conversationId: string,
    messageId: string,
    modelLabel: string,
    dispatchId: string,
    artifactTitle: string,
    task: ExperienceTaskType,
    chatParamsAtSend: Record<string, unknown>,
  ) {
    for (;;) {
      await new Promise((resolve) => window.setTimeout(resolve, 5000))
      try {
        const { message, attachment_urls } = await getExperienceMessage(conversationId, messageId)
        if (message.status === 'running') continue
        setColumns((prev) => {
          if (!prev) return prev
          return prev.map((c, i) => {
            if (i !== idx) return c
            const next = [...c.history]
            const last = next[next.length - 1]
            if (last?.role !== 'assistant') return c
            if (message.status === 'failed') {
              next[next.length - 1] = { ...last, error: message.error ? cleanErrorMessage(message.error) : t('modelsExperience.videoGenerateFailed'), content: '' }
              return { ...c, history: next }
            }
            const media = message.attachments.map((a, mediaIdx) => ({
              kind: a.kind,
              url: attachment_urls[a.resource_id] ?? '',
              title: artifactTitle,
              detail: buildMediaArtifactDetail(task, chatParamsAtSend, mediaIdx),
            }))
            next[next.length - 1] = {
              ...last,
              content: '',
              media: media.length > 0 ? media : undefined,
              metrics: {
                model: modelLabel, inputTokens: 0, outputTokens: 0, firstTokenLatency: '',
                totalLatency: formatPlaygroundLatency(message.total_ms ?? 0),
                spend: Number(message.actual_spend ?? 0), free: Number(message.actual_spend ?? 0) === 0,
                totalMs: message.total_ms,
              },
            }
            return { ...c, history: next }
          })
        })
        trackEvent('playground_model_run_result', {
          model_id: columns?.[idx]?.model.model_id ?? '',
          status: message.status === 'failed' ? 'failed' : 'succeeded',
          latency_bucket: latencyBucket(message.total_ms ?? 0),
          token_bucket: tokenBucket(0),
          billing_status: Number(message.actual_spend ?? 0) === 0 ? 'free' : 'billed',
        }, { result: message.status === 'failed' ? 'fail' : 'success' })
        settleDispatch(dispatchId)
        return
      } catch {
        // 单次轮询失败不放弃，继续等下一轮（同单模型页 §8.3：保留最后已知状态，允许稍后重试）
      }
    }
  }

  /** dispatch 组内所有列都完成后，计算最快/成本最低标记（§7.10） */
  function settleDispatch(dispatchId: string) {
    const remaining = (pendingByDispatch.current.get(dispatchId) ?? 1) - 1
    pendingByDispatch.current.set(dispatchId, remaining)
    if (remaining > 0) return
    // 一轮发送全部落地后同步历史侧栏：新建的会话、后端按首条提问自动生成的标题、
    // 以及更新时间排序都要立刻反映出来。对比页此前完全没有这个刷新（只在展开侧栏时拉一次），
    // 会话记录要手动刷浏览器才出现（需求方 shared#346）。放在 settleDispatch 而不是各列的
    // 发送函数里：这里是同步/独立/重试/异步视频四条路径共同的收口点，且各列 finally 都会走到，
    // 成功失败都覆盖，一轮只发一次请求。
    void refreshHistorySessions()
    setColumns((prev) => {
      if (!prev) return prev
      const rounds = prev
        .map((c, i) => ({ i, msg: c.history.find((m) => m.dispatchId === dispatchId && m.role === 'assistant' && m.metrics) }))
        .filter((r): r is { i: number; msg: ExperienceMessage } => !!r.msg)
      if (rounds.length < 2) return prev
      const fastestIdx = rounds.reduce((best, r) => ((r.msg.metrics!.totalMs ?? Infinity) < (rounds[best].msg.metrics!.totalMs ?? Infinity) ? rounds.indexOf(r) : best), 0)
      const cheapestIdx = rounds.reduce((best, r) => (r.msg.metrics!.spend < rounds[best].msg.metrics!.spend ? rounds.indexOf(r) : best), 0)
      return prev.map((c, i) => {
        const round = rounds.find((r) => r.i === i)
        if (!round) return c
        const isFastest = rounds.indexOf(round) === fastestIdx
        const isCheapest = rounds.indexOf(round) === cheapestIdx
        return {
          ...c,
          history: c.history.map((m) =>
            m === round.msg ? { ...m, metrics: { ...m.metrics!, fastest: isFastest, cheapest: isCheapest } } : m,
          ),
        }
      })
    })
  }

  /** §7.4/7.5 差异分发（qa#545）：附件只发给该列模型支持该附件类型的列，不支持的列仍然
   *  发送纯文本 prompt（不带附件、不整列跳过）——PRD 原型 playground-attachment-compatibility
   *  弹窗的文案"发送时仍会同时调用全部模型"逐字对应这个默认行为。 */
  function handleSyncSend() {
    const prompt = sharedDraft.trim()
    if (!columns) return
    if (compareTask !== 'audio_to_text' && !prompt) return
    if (compareNeedsFileTask && !attachment) {
      setAttachmentError(compareTask === 'audio_to_text' ? t('modelsExperience.attachmentRequiredAudio') : t('modelsExperience.attachmentRequiredImage'))
      return
    }
    // 下线模型不参与共享发送（PRD §AC-18：无发送按钮/不可发送），只统计在线列
    const onlineIndexes = columns.reduce<number[]>((acc, c, idx) => {
      if (!isOfflineModel(c.model)) acc.push(idx)
      return acc
    }, [])
    if (onlineIndexes.length === 0) return
    if (isBalanceZero && columns.some((c, idx) => onlineIndexes.includes(idx) && isPaidModel(c.model))) return
    const dispatchId = crypto.randomUUID()
    pendingByDispatch.current.set(dispatchId, onlineIndexes.length)
    const currentAttachment = attachment
    const attachedKind = currentAttachment ? attachmentKindFromMime(currentAttachment.uploaded.mime) : null
    const supportingCount = currentAttachment && attachedKind
      ? columns.filter((c) => modelSupportsAttachment(c.model, attachedKind)).length
      : 0
    trackEvent('playground_send', {
      dispatch_id_hash: hashId(dispatchId),
      attachment_kind_set: attachedKind ?? 'none',
      eligible_column_count: onlineIndexes.length,
      attachment_recipient_count: supportingCount,
    })
    setSharedDraft('')
    clearAttachment(false)
    onlineIndexes.forEach((idx) => {
      const c = columns[idx]
      const supports = currentAttachment && attachedKind ? modelSupportsAttachment(c.model, attachedKind) : false
      const dispatchAttachment: DispatchAttachment | undefined = supports && currentAttachment
        ? {
            resourceIds: [currentAttachment.uploaded.resource_id],
            media: [{ kind: attachedKind ?? 'image', url: currentAttachment.previewUrl }],
          }
        : undefined
      void sendOne(idx, prompt, dispatchId, dispatchAttachment)
    })
    if (currentAttachment) replaceColumnMessageAttachmentPreview(dispatchId, currentAttachment)
  }

  function handleIndependentSend(idx: number) {
    if (!columns) return
    const prompt = columns[idx].draft.trim()
    if (compareTask !== 'audio_to_text' && !prompt) return
    if (isBalanceZero && isPaidModel(columns[idx].model)) return
    const conversationId = columns[idx].conversationId
    const colAttachment = columnAttachments[conversationId]
    if (compareNeedsFileTask && !colAttachment) {
      setColumnAttachmentErrors((prev) => ({
        ...prev,
        [conversationId]: compareTask === 'audio_to_text' ? t('modelsExperience.attachmentRequiredAudio') : t('modelsExperience.attachmentRequiredImage'),
      }))
      return
    }
    const attachedKind = colAttachment ? attachmentKindFromMime(colAttachment.uploaded.mime) : null
    const dispatchId = crypto.randomUUID()
    pendingByDispatch.current.set(dispatchId, 1)
    trackEvent('playground_send', {
      dispatch_id_hash: hashId(dispatchId),
      attachment_kind_set: attachedKind ?? 'none',
      eligible_column_count: 1,
      attachment_recipient_count: colAttachment ? 1 : 0,
    })
    updateColumn(idx, { draft: '' })
    const dispatchAttachment: DispatchAttachment | undefined = colAttachment
      ? { resourceIds: [colAttachment.uploaded.resource_id], media: [{ kind: attachedKind ?? 'image', url: colAttachment.previewUrl }] }
      : undefined
    clearColumnAttachment(conversationId, false)
    void sendOne(idx, prompt, dispatchId, dispatchAttachment)
    if (colAttachment) replaceColumnMessageAttachmentPreview(dispatchId, colAttachment)
  }

  /** 媒体结果失败重试（PRD §AC-13）：原样复用失败那条用户消息的文本与附件 resource_id */
  function retryMediaMessage(idx: number, userMessage: ExperienceMessage) {
    if (!columns || !userMessage.content || columns[idx]?.streaming) return
    if (isBalanceZero && isPaidModel(columns[idx].model)) return
    const dispatchId = crypto.randomUUID()
    void sendOne(idx, userMessage.content, dispatchId, {
      resourceIds: userMessage.attachmentResourceIds ?? [],
      media: userMessage.media,
    })
  }

  return {
    handleSyncSend,
    handleIndependentSend,
    retryMediaMessage,
  }
}
