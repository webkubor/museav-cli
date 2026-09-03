/**
 * 模型对比工作台：共享输入区（拆分后抽取）。
 * 同步态下的余额提示 / 共享附件行 / needs-file 上传区 / 共享 Composer / 历史错误条。
 */

import { useTranslation } from 'react-i18next'
import { LuPaperclip, LuTriangleAlert, LuX } from 'react-icons/lu'
import { Composer } from '@/components/ui/Composer'
import {
  categoryPlaceholder,
  attachmentKindFromMime,
  attachmentLimitLabel,
  modelSupportsAttachment,
  ATTACHMENT_LIMITS,
  isFreeModel,
} from '../models/model-experience-data'
import { ExperienceBalanceNotice } from '../models/ExperienceBalanceNotice'
import { TaskFileDropZone } from '../models/components/TaskFileDropZone'
import type { ModelsCompareContext } from './use-models-compare'

/** 共享输入区：仅同步输入模式渲染主体，独立模式这里只保留历史错误提示条 */
export function CompareSharedComposer({ ctx }: { ctx: ModelsCompareContext }) {
  const { t } = useTranslation()
  const columns = ctx.columns ?? []
  const { fileInputRef, stream } = ctx

  return (
    <>
      {/* 需求方 #833（1.0.6）：余额为 0 时免费/付费模型一律锁定；全列免费才用免费模型场景文案 */}
      {ctx.syncInput && ctx.isBalanceZero && columns.length > 0 && (
        <ExperienceBalanceNotice
          free={columns.every((c) => isFreeModel(c.model))}
          lockedModelCount={columns.length}
        />
      )}

      {/* 共享附件预览/校验错误（qa#545 §7.4/7.5，仅 dialogue 类走通用回形针）：只在同步
          输入态展示——独立输入模式每列各自打字，附件是同步态的共享概念。 */}
      {ctx.syncInput && ctx.compareCategory === 'dialogue' && (ctx.attachment || ctx.attachmentError) && (
        <div className="models-experience-attachment-row">
          {ctx.attachment && (
            <div className="models-experience-attachment-chip">
              {attachmentKindFromMime(ctx.attachment.uploaded.mime) === 'image' ? (
                <img src={ctx.attachment.previewUrl} alt={t('modelsExperience.attachmentPreview')} />
              ) : (
                <span className="models-experience-attachment-name">{ctx.attachment.file.name}</span>
              )}
              <button type="button" aria-label={t('modelsExperience.removeAttachment')} onClick={() => ctx.clearAttachment()}>
                <LuX size={12} />
              </button>
            </div>
          )}
          {ctx.attachment && (() => {
            const kind = attachmentKindFromMime(ctx.attachment.uploaded.mime)
            const supportingCount = kind ? columns.filter((c) => modelSupportsAttachment(c.model, kind)).length : 0
            // 只在"部分支持"时显示（shared#337 对齐原型：全支持不提示，主要告知走弹框，这行仅作常驻提醒）
            if (supportingCount === 0 || supportingCount >= columns.length) return null
            return (
              <span className="models-compare-attachment-support">
                {t('modelsExperience.compare.attachmentSupportCount', { supporting: supportingCount, total: columns.length })}
              </span>
            )
          })()}
          {ctx.attachmentError && <span className="models-experience-attachment-error">{ctx.attachmentError}</span>}
        </div>
      )}

      {/* needs-file 任务(image_to_image/audio_to_text/image_to_video)的专门上传区，同步态下
          全列共用一份（跟单模型页同款组件，PRD PlaygroundTaskInput 逐字对齐） */}
      {ctx.syncInput && ctx.compareNeedsFileTask && (
        <TaskFileDropZone
          task={ctx.compareTask}
          file={ctx.attachment ? { name: ctx.attachment.file.name, sizeBytes: ctx.attachment.file.size, previewUrl: ctx.attachment.previewUrl } : null}
          error={ctx.attachmentError}
          uploading={ctx.attachmentUploading}
          onFileChange={(file) => void ctx.handleFileSelect(file)}
          onRemove={ctx.clearAttachment}
        />
      )}

      {ctx.syncInput && (
        <>
          {ctx.compareCategory === 'dialogue' && (
            <input
              ref={fileInputRef}
              type="file"
              accept={ctx.allowedAttachmentKinds.map((k) => ATTACHMENT_LIMITS[k].accept).join(',')}
              className="hidden"
              onChange={(e) => void ctx.handleFileSelect(e.target.files?.[0])}
            />
          )}
          <Composer
            value={ctx.sharedDraft}
            onChange={ctx.setSharedDraft}
            onSend={ctx.handleSyncSend}
            isStreaming={columns.some((c) => c.streaming)}
            disabled={ctx.isBalanceZero}
            onStop={() => stream.abortAll()}
            placeholder={ctx.compareTask === 'image_to_image'
              ? t('modelsExperience.taskPlaceholder.image_to_image')
              : t('modelsExperience.compare.sharedPlaceholder', { placeholder: categoryPlaceholder(ctx.compareCategory), count: columns.length })}
            sendLabel={t('modelsExperience.send')}
            className="models-experience-composer-wrap models-compare-shared-composer"
            sendEnabled={ctx.compareTask === 'audio_to_text' ? !!ctx.attachment : undefined}
            textareaSlot={ctx.compareTask === 'audio_to_text' ? (
              <div className="models-task-transcribe-ready">{t('modelsExperience.transcribeReady')}</div>
            ) : undefined}
            activeChip={
              ctx.compareCategory === 'dialogue' ? (
                <div className="models-experience-composer-left">
                  <button
                    type="button"
                    className="models-experience-icon-btn"
                    aria-label={t('modelsExperience.addAttachment')}
                    title={`${t('modelsExperience.attachmentSupports')}${ctx.allowedAttachmentKinds.map((k) => attachmentLimitLabel(k)).join(t('modelsExperience.listSeparator'))}`}
                    disabled={ctx.attachmentUploading || !!ctx.attachment}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <LuPaperclip size={14} />
                  </button>
                  {/* 只在上传中给状态反馈；常驻的「同步发送给全部已选模型」按需求方 shared#340
                      去掉——顶部已有「同步输入」开关和「同一输入发送给 N 个模型」说明，重复且占位。 */}
                  {ctx.attachmentUploading && (
                    <span className="models-experience-composer-hint">{t('modelsExperience.attachmentUploading')}</span>
                  )}
                </div>
              ) : undefined
            }
          />
        </>
      )}

      {ctx.historyActionError && (
        <div className="models-experience-inline-error" role="alert">
          <LuTriangleAlert size={14} />
          <span>{ctx.historyActionError}</span>
        </div>
      )}
    </>
  )
}
