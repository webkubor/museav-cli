/**
 * 模型对比工作台附件层：共享/独立两种输入入口的附件状态与上传/清理处理器
 * （qa#545，PRD §7.4/7.5，AC-07/AC-08，shared#337 兼容弹窗）。只持有关附件自身的
 * 页面内临时状态，不参与会话/跨路由持久化。
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { prettyModelName } from '@/lib/utils'
import { trackEvent } from '@/lib/track'
import { uploadExperienceAttachment, type ExperienceAttachment } from '@/services/experience-sessions'
import { resolveExperienceMessageMedia } from '../models/experience-message-attachments'
import {
  attachmentKindFromMime,
  ATTACHMENT_LIMITS,
  attachmentLimitLabel,
  modelSupportsAttachment,
  taskAttachmentKind,
  sizeBucket,
  extractApiErrorMessage,
  type ExperienceCategoryKey,
  type ExperienceTaskType,
} from '../models/model-experience-data'
import type { ColumnState } from './models-compare-utils'

/** 单个待发送附件：本地 file + blob 预览 + 后端上传后的 resource 信息。 */
type CompareAttachment = { file: File; previewUrl: string; uploaded: ExperienceAttachment }

/** 附件层依赖：由状态层传入的派生值/写句柄（compareTask/compareCategory 以首列模型为准）。 */
export interface CompareAttachmentsDeps {
  columns: ColumnState[] | null
  setColumns: (updater: ColumnState[] | null | ((prev: ColumnState[] | null) => ColumnState[] | null)) => void
  compareCategory: ExperienceCategoryKey
  compareTask: ExperienceTaskType
  allowedAttachmentKinds: Array<keyof typeof ATTACHMENT_LIMITS>
}

/** 附件层：共享/独立两种入口的附件状态、上传校验与清理处理器。 */
export function useCompareAttachments(deps: CompareAttachmentsDeps) {
  const { t } = useTranslation()
  const { columns, setColumns, compareCategory, compareTask, allowedAttachmentKinds } = deps

  // §7.4/7.5 共享附件入口（qa#545）：同步态用这一份，独立态每列各自一份（见下方
  // columnAttachments，qa#553 补齐 AC-07/AC-08 缺口）。每轮最多一个附件，纯页面内
  // 临时态，不需要跨路由持久化。
  const [attachment, setAttachment] = useState<CompareAttachment | null>(null)
  const [attachmentUploading, setAttachmentUploading] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  /** 共享附件仅部分模型支持时的提示弹框（shared#337，PRD 原型 PlaygroundAttachmentCompatibilityDialog）：
   *  上传成功后检测到部分列不支持该附件类型时弹出，列出「收到文本与附件 / 仅收到文本」两组模型。 */
  const [attachmentCompatibility, setAttachmentCompatibility] = useState<{
    attachmentName: string
    supportedModelNames: string[]
    unsupportedModelNames: string[]
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const transientPreviewUrlsRef = useRef(new Set<string>())

  // 独立输入模式每列各自的附件（PRD §AC-07「每列有独立输入区和当前模型可用的附件入口」）。
  // 按 conversationId 而非数组下标存——加/删列时下标会重排，conversationId 在列的生命周期内稳定。
  const [columnAttachments, setColumnAttachments] = useState<Record<string, CompareAttachment>>({})
  const [columnAttachmentUploading, setColumnAttachmentUploading] = useState<Record<string, boolean>>({})
  const [columnAttachmentErrors, setColumnAttachmentErrors] = useState<Record<string, string>>({})
  const columnFileInputRef = useRef<HTMLInputElement>(null)
  const pendingAttachmentColumnRef = useRef<number | null>(null)

  useEffect(() => () => {
    transientPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  function clearAttachment(revokePreview = true) {
    setAttachment((prev) => {
      if (prev && revokePreview) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
    setAttachmentError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  /** 将发送中仍在使用的本地预览换成 resource_id 对应的短期 URL，再释放 blob URL。 */
  function replaceColumnMessageAttachmentPreview(
    dispatchId: string,
    currentAttachment: { previewUrl: string; uploaded: ExperienceAttachment },
  ) {
    transientPreviewUrlsRef.current.add(currentAttachment.previewUrl)
    void resolveExperienceMessageMedia([currentAttachment.uploaded]).then(({ media }) => {
      if (media.length === 0) return
      URL.revokeObjectURL(currentAttachment.previewUrl)
      transientPreviewUrlsRef.current.delete(currentAttachment.previewUrl)
      setColumns((prev) => prev?.map((column) => ({
        ...column,
        history: column.history.map((message) => (
          message.role === 'user' &&
          message.dispatchId === dispatchId &&
          message.attachmentResourceIds?.includes(currentAttachment.uploaded.resource_id)
            ? { ...message, media }
            : message
        )),
      })) ?? prev)
    })
  }

  /** 共享附件上传（qa#545，§7.4/7.5）：只做类型/大小校验和上传，不因"部分模型不支持"而拦截
   *  上传——支持哪些列由发送时逐列判断（modelSupportsAttachment），差异分发在 handleSyncSend。
   *  dialogue 类走通用回形针（allowedAttachmentKinds），needs-file 任务改走 TaskFileDropZone，
   *  两条入口共用这同一份上传状态与后端调用。 */
  async function handleFileSelect(file: File | null | undefined) {
    if (!file || !columns) return
    const cols = columns
    setAttachmentError(null)
    const kind = attachmentKindFromMime(file.type)
    const permittedKinds = compareCategory === 'dialogue' ? allowedAttachmentKinds : ([taskAttachmentKind(compareTask)].filter(Boolean) as Array<keyof typeof ATTACHMENT_LIMITS>)
    if (!kind || !permittedKinds.includes(kind)) {
      setAttachmentError(`${t('modelsExperience.compare.categoryAttachmentUnsupported')}${permittedKinds.map((k) => attachmentLimitLabel(k)).join(t('modelsExperience.listSeparator'))}`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    if (file.size > ATTACHMENT_LIMITS[kind].maxBytes) {
      setAttachmentError(t('modelsExperience.attachmentTooLarge', { limit: attachmentLimitLabel(kind) }))
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    const previewUrl = URL.createObjectURL(file)
    setAttachmentUploading(true)
    try {
      const uploaded = await uploadExperienceAttachment(file)
      setAttachment({ file, previewUrl, uploaded })
      const supportingCount = cols.filter((c) => modelSupportsAttachment(c.model, kind)).length
      // 部分支持 → 弹「部分模型支持该附件」提示框（shared#337，原型上传后即弹、非发送时才提示）；
      // 全支持/全不支持不弹（后者由类别校验或发送兜底，标题"部分模型"也对不上）。
      if (supportingCount > 0 && supportingCount < cols.length) {
        const modelName = (c: ColumnState) => prettyModelName(c.model.display_name, c.model.model_id, c.model.vendor ?? c.model.provider)
        setAttachmentCompatibility({
          attachmentName: file.name,
          supportedModelNames: cols.filter((c) => modelSupportsAttachment(c.model, kind)).map(modelName),
          unsupportedModelNames: cols.filter((c) => !modelSupportsAttachment(c.model, kind)).map(modelName),
        })
      }
      trackEvent('playground_attachment_result', {
        kind, size_bucket: sizeBucket(file.size), result: 'success',
        supporting_model_count: supportingCount, unsupported_model_count: cols.length - supportingCount,
        distribution_mode: 'compare',
      })
    } catch (err) {
      URL.revokeObjectURL(previewUrl)
      setAttachmentError(extractApiErrorMessage(err))
      trackEvent('playground_attachment_result', {
        kind, size_bucket: sizeBucket(file.size), result: 'fail',
        supporting_model_count: 0, unsupported_model_count: cols.length, distribution_mode: 'compare',
      })
    } finally {
      setAttachmentUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function clearColumnAttachment(conversationId: string, revokePreview = true) {
    setColumnAttachments((prev) => {
      const existing = prev[conversationId]
      if (!existing) return prev
      if (revokePreview) URL.revokeObjectURL(existing.previewUrl)
      const next = { ...prev }
      delete next[conversationId]
      return next
    })
    setColumnAttachmentErrors((prev) => {
      if (!(conversationId in prev)) return prev
      const next = { ...prev }
      delete next[conversationId]
      return next
    })
  }

  /** 独立输入模式每列各自的附件上传（PRD §AC-07/§AC-08）：校验/大小按当前列模型实际
   *  支持的附件类型判断（比 allowedAttachmentKinds 更准——同类别里未必所有模型都收
   *  同一种输入模态），跟共享附件入口的上传/校验逻辑同构，只是作用域缩到单列。 */
  async function handleColumnFileSelect(idx: number, file: File | null | undefined) {
    if (!file || !columns) return
    const column = columns[idx]
    const conversationId = column.conversationId
    setColumnAttachmentErrors((prev) => {
      if (!(conversationId in prev)) return prev
      const next = { ...prev }
      delete next[conversationId]
      return next
    })
    const kind = attachmentKindFromMime(file.type)
    const permittedKinds = compareCategory === 'dialogue' ? allowedAttachmentKinds : ([taskAttachmentKind(compareTask)].filter(Boolean) as Array<keyof typeof ATTACHMENT_LIMITS>)
    if (!kind || !permittedKinds.includes(kind) || !modelSupportsAttachment(column.model, kind)) {
      setColumnAttachmentErrors((prev) => ({
        ...prev,
        [conversationId]: `${t('modelsExperience.attachmentUnsupported')}${permittedKinds.filter((k) => modelSupportsAttachment(column.model, k)).map((k) => attachmentLimitLabel(k)).join(t('modelsExperience.listSeparator')) || t('modelsExperience.compare.none')}`,
      }))
      if (columnFileInputRef.current) columnFileInputRef.current.value = ''
      return
    }
    if (file.size > ATTACHMENT_LIMITS[kind].maxBytes) {
      setColumnAttachmentErrors((prev) => ({ ...prev, [conversationId]: t('modelsExperience.attachmentTooLarge', { limit: attachmentLimitLabel(kind) }) }))
      if (columnFileInputRef.current) columnFileInputRef.current.value = ''
      return
    }
    const previewUrl = URL.createObjectURL(file)
    setColumnAttachmentUploading((prev) => ({ ...prev, [conversationId]: true }))
    try {
      const uploaded = await uploadExperienceAttachment(file)
      setColumnAttachments((prev) => ({ ...prev, [conversationId]: { file, previewUrl, uploaded } }))
      trackEvent('playground_attachment_result', {
        kind, size_bucket: sizeBucket(file.size), result: 'success',
        supporting_model_count: 1, unsupported_model_count: 0, distribution_mode: 'single',
      })
    } catch (err) {
      URL.revokeObjectURL(previewUrl)
      setColumnAttachmentErrors((prev) => ({ ...prev, [conversationId]: extractApiErrorMessage(err) }))
      trackEvent('playground_attachment_result', {
        kind, size_bucket: sizeBucket(file.size), result: 'fail',
        supporting_model_count: 0, unsupported_model_count: 1, distribution_mode: 'single',
      })
    } finally {
      setColumnAttachmentUploading((prev) => ({ ...prev, [conversationId]: false }))
      if (columnFileInputRef.current) columnFileInputRef.current.value = ''
    }
  }

  return {
    attachment,
    attachmentUploading,
    attachmentError,
    setAttachmentError,
    attachmentCompatibility,
    setAttachmentCompatibility,
    fileInputRef,
    columnAttachments,
    setColumnAttachments,
    columnAttachmentUploading,
    columnAttachmentErrors,
    setColumnAttachmentErrors,
    columnFileInputRef,
    pendingAttachmentColumnRef,
    clearAttachment,
    replaceColumnMessageAttachmentPreview,
    handleFileSelect,
    clearColumnAttachment,
    handleColumnFileSelect,
  }
}

/** 附件层返回值，供状态层并入其返回的扁平 ctx。 */
export type CompareAttachments = ReturnType<typeof useCompareAttachments>
