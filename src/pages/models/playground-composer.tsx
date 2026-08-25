import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { LuPaperclip, LuTriangleAlert, LuX } from 'react-icons/lu'
import { Composer } from '@/components/ui/Composer'
import type { CatalogModelItem } from '@/types'
import {
  ATTACHMENT_LIMITS,
  attachmentKindFromMime,
  attachmentLimitLabel,
  categoryPlaceholder,
  isOfflineModel,
  isPaidModel,
  type ExperienceCategoryKey,
  type ExperienceTaskType,
} from './model-experience-data'
import { ExperienceBalanceNotice } from './ExperienceBalanceNotice'
import { TaskFileDropZone } from './components/TaskFileDropZone'
import { TaskSwitch } from './components/TaskSwitch'
import type { PlaygroundPendingAttachment } from './playground-utils'

export interface PlaygroundComposerProps {
  selectedModel: CatalogModelItem | null
  category: ExperienceCategoryKey
  effectiveTask: ExperienceTaskType
  categoryTasks: ExperienceTaskType[]
  isDialogue: boolean
  isSelectedModelOffline: boolean
  needsFileTask: boolean
  isBlockedByBalance: boolean
  isStreaming: boolean
  allowedAttachmentKinds: Array<keyof typeof ATTACHMENT_LIMITS>
  attachment: PlaygroundPendingAttachment | null
  attachmentUploading: boolean
  attachmentError: string | null
  composerEstimatedSpend: string
  input: string
  inputRef: RefObject<HTMLTextAreaElement | null>
  fileInputRef: RefObject<HTMLInputElement | null>
  onInputChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  onTaskSwitch: (task: ExperienceTaskType) => void
  onFileChange: (file: File | null | undefined) => void
  onRemoveAttachment: () => void
}

/** 消息区下方的整块 composer 区域：余额/下线状态条、页面级任务切换、附件预览/上传区与输入框。
 *  与消息列表解耦成独立组件，把 models 页 index.tsx 的 JSX 拆薄。 */
export function PlaygroundComposer({
  selectedModel,
  category,
  effectiveTask,
  categoryTasks,
  isDialogue,
  isSelectedModelOffline,
  needsFileTask,
  isBlockedByBalance,
  isStreaming,
  allowedAttachmentKinds,
  attachment,
  attachmentUploading,
  attachmentError,
  composerEstimatedSpend,
  input,
  inputRef,
  fileInputRef,
  onInputChange,
  onSend,
  onStop,
  onTaskSwitch,
  onFileChange,
  onRemoveAttachment,
}: PlaygroundComposerProps) {
  const { t } = useTranslation()

  return (
    <>
      {/* §9.1 余额资格状态机 + 需求方 #833（1.0.6）：可消费合计为 0 时免费/付费模型
          均锁定发送，按场景引导充值（文案与充值入口见 ExperienceBalanceNotice） */}
      {isBlockedByBalance && (
        <ExperienceBalanceNotice
          free={!!selectedModel && !isPaidModel(selectedModel)}
          lockedModelCount={1}
        />
      )}

      {/* 下线模型（PRD §AC-18，对齐原型 App.tsx:18634-18641）：composer 整体替换为
          提示，禁止发送，用户需从上方模型条更换同任务在线模型后继续。 */}
      {selectedModel && isOfflineModel(selectedModel) && (
        <div className="playground-balance-notice" role="status">
          <LuTriangleAlert size={15} />
          <span>
            <strong>{t('modelsExperience.modelOffline')}</strong>
            {t('modelsExperience.modelOfflineHint')}
          </span>
        </div>
      )}

      {/* 页面级「可体验任务」切换（原型 PlaygroundCapabilitySwitch 的落地位——
          .models-task-switch 样式当初就按"选中项决定下方 TaskFileDropZone"设计，
          但组件此前只挂在 ModelPickerDialog 里，页面上无入口）。dialogue 类子任务
          由附件反推（resolveDialogueTask），不渲染；<2 个任务时组件自身返回 null。 */}
      {!isSelectedModelOffline && !isDialogue && (
        <TaskSwitch tasks={categoryTasks} value={effectiveTask} onChange={onTaskSwitch} />
      )}

      {/* 附件预览/错误（§7.5，仅 dialogue 类走通用回形针）：每轮最多一个附件，发送后清空 */}
      {!isSelectedModelOffline && isDialogue && (attachment || attachmentError) && (
        <div className="models-experience-attachment-row">
          {attachment && (
            <div className="models-experience-attachment-chip">
              {attachmentKindFromMime(attachment.uploaded.mime) === 'image' ? (
                <img src={attachment.previewUrl} alt={t('modelsExperience.attachmentPreview')} />
              ) : (
                <span className="models-experience-attachment-name">{attachment.file.name}</span>
              )}
              <button type="button" aria-label={t('modelsExperience.removeAttachment')} onClick={onRemoveAttachment}>
                <LuX size={12} />
              </button>
            </div>
          )}
          {attachmentError && <span className="models-experience-attachment-error">{attachmentError}</span>}
        </div>
      )}

      {/* needs-file 任务(image_to_image/audio_to_text/image_to_video) 的专门上传区，
          替换掉回形针（PRD PlaygroundTaskInput App.tsx:19877-19929 逐字对齐，
          2026-07-29 本地起 PRD 原型用 ego-lite 实测过） */}
      {!isSelectedModelOffline && needsFileTask && (
        <TaskFileDropZone
          task={effectiveTask}
          file={attachment ? { name: attachment.file.name, sizeBytes: attachment.file.size, previewUrl: attachment.previewUrl } : null}
          error={attachmentError}
          uploading={attachmentUploading}
          onFileChange={onFileChange}
          onRemove={onRemoveAttachment}
        />
      )}

      {/* PRD §7.2：单模型状态不展示"同步输入"开关、不展示"清空结果"按钮、不重复展示模型ID复制入口。
          底部动作行左侧是预估费用（原型 App.tsx:18523 playground-composer-hint 逐字对齐）+ 附件入口
          （§7.5，纯文本任务不显示附件入口——对话类允许图片/视频回形针，needs-file 任务改用上面的
          专门上传区，text_to_image/text_to_audio/text_to_video 都没有附件入口）。
          下线模型不渲染这一套，composer 区域整体换成上面的下线提示（PRD §AC-18）。 */}
      {!isSelectedModelOffline && (
        <>
          {isDialogue && (
            <input
              ref={fileInputRef}
              type="file"
              accept={allowedAttachmentKinds.map((k) => ATTACHMENT_LIMITS[k].accept).join(',')}
              className="hidden"
              onChange={(e) => { void onFileChange(e.target.files?.[0]) }}
            />
          )}
          <Composer
            ref={inputRef}
            value={input}
            onChange={onInputChange}
            onSend={onSend}
            isStreaming={isStreaming}
            disabled={isBlockedByBalance}
            onStop={onStop}
            placeholder={effectiveTask === 'image_to_image' ? t('modelsExperience.taskPlaceholder.image_to_image') : categoryPlaceholder(category)}
            sendLabel={t('modelsExperience.send')}
            className="models-experience-composer-wrap"
            sendEnabled={
              effectiveTask === 'audio_to_text'
                ? !!attachment
                // 图生图/图生视频/视频生视频等 needs-file 任务：没附件发送不可点（prd#980 验收口径），
                // sendPrompt 里的预检提示仍保留兜底
                : needsFileTask
                  ? !!attachment && input.trim().length > 0
                  : undefined
            }
            textareaSlot={effectiveTask === 'audio_to_text' ? (
              <div className="models-task-transcribe-ready">{t('modelsExperience.transcribeReady')}</div>
            ) : undefined}
            activeChip={
              isDialogue ? (
                <div className="models-experience-composer-left">
                  {allowedAttachmentKinds.length > 0 && (
                    <button
                      type="button"
                      className="models-experience-icon-btn"
                      aria-label={t('modelsExperience.addAttachment')}
                      title={`${t('modelsExperience.attachmentSupports')}${allowedAttachmentKinds.map((k) => attachmentLimitLabel(k)).join(t('modelsExperience.listSeparator'))}`}
                      disabled={attachmentUploading || !!attachment}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <LuPaperclip size={14} />
                    </button>
                  )}
                  <span className="models-experience-composer-hint">
                    {attachmentUploading ? t('modelsExperience.attachmentUploading') : (
                      <>{t('modelsExperience.estimatedSpend')} <strong>{composerEstimatedSpend}</strong></>
                    )}
                  </span>
                </div>
              ) : (
                <span className="models-experience-composer-hint">
                  {t('modelsExperience.estimatedSpend')} <strong>{composerEstimatedSpend}</strong>
                </span>
              )
            }
          />
        </>
      )}
    </>
  )
}
