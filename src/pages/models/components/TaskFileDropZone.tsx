/**
 * needs-file 任务(image_to_image/audio_to_text/image_to_video)的专门上传区，
 * 替换掉这三个任务下的通用回形针 + chip 模式（PRD 原型 PlaygroundTaskInput
 * App.tsx:19877-19929 逐字对齐，2026-07-29 本地起 PRD 原型用 ego-lite 实测过
 * 布局：缩略图/文件名 + "点击替换" + 移除按钮，位于文本框上方，未上传时是
 * 虚线拖拽区）。单模型页/对比页共用。
 */
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCloudUpload, LuFileAudio, LuX } from 'react-icons/lu'
import {
  ATTACHMENT_LIMITS,
  attachmentLimitLabel,
  taskAttachmentKind,
  type ExperienceTaskType,
} from '../model-experience-data'

export interface TaskFileDropZoneFile {
  name: string
  sizeBytes: number
  previewUrl?: string
}

export interface TaskFileDropZoneProps {
  task: ExperienceTaskType
  file: TaskFileDropZoneFile | null
  error?: string | null
  uploading?: boolean
  onFileChange: (file: File) => void
  onRemove: () => void
}

export function TaskFileDropZone({ task, file, error, uploading, onFileChange, onRemove }: TaskFileDropZoneProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const kind = taskAttachmentKind(task)
  if (!kind) return null
  const isAudio = kind === 'audio'
  const limit = ATTACHMENT_LIMITS[kind]

  function handleFiles(files: FileList | null) {
    const picked = files?.[0]
    if (picked) onFileChange(picked)
  }

  return (
    <div className="models-task-drop-field">
      <label
        className={`models-task-drop-zone${file ? ' has-file' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          handleFiles(e.dataTransfer.files)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={limit.accept}
          aria-label={t(`modelsExperience.taskUpload.${task}`)}
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
        {file ? (
          <>
            {!isAudio && file.previewUrl ? (
              <img src={file.previewUrl} alt={t('modelsExperience.attachmentPreview')} />
            ) : (
              <LuFileAudio size={22} />
            )}
            <span className="models-task-drop-meta">
              <strong>{file.name}</strong>
              <span>{(file.sizeBytes / 1024 / 1024).toFixed(2)} MB · {t('modelsExperience.taskUpload.clickToReplace')}</span>
            </span>
            <button
              type="button"
              aria-label={t('modelsExperience.removeAttachment')}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onRemove()
              }}
            >
              <LuX size={14} />
            </button>
          </>
        ) : (
          <>
            <LuCloudUpload size={20} />
            <span className="models-task-drop-meta">
              <strong>
                {uploading ? t('modelsExperience.attachmentUploading') : t(`modelsExperience.taskUpload.${task}`)}
              </strong>
              <span>{attachmentLimitLabel(kind)}</span>
            </span>
          </>
        )}
      </label>
      {error && <span className="models-task-drop-error" role="alert">{error}</span>}
    </div>
  )
}

export default TaskFileDropZone
