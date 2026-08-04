/**
 * 模型对比工作台：多列对比网格（拆分后抽取）。
 * 每列 = 模型条 + 消息列表 + 余额/下线提示 + 独立输入区。
 */

import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { LuChevronDown, LuCode, LuPaperclip, LuSettings2, LuTriangleAlert, LuX } from 'react-icons/lu'
import { Composer } from '@/components/ui/Composer'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { prettyModelName, cn } from '@/lib/utils'
import { modelVendorLabel } from '@/features/models/model-format'
import { trackEvent } from '@/lib/track'
import {
  isOfflineModel,
  dualPriceText,
  experienceTaskLabel,
  categoryEmptyCopy,
  categoryPlaceholder,
  attachmentKindFromMime,
  attachmentLimitLabel,
  modelSupportsAttachment,
  ATTACHMENT_LIMITS,
  isPaidModel,
} from '../models/model-experience-data'
import { ExperienceMessageList } from '../models/components/ExperienceMessageList'
import { TaskFileDropZone } from '../models/components/TaskFileDropZone'
import type { ModelsCompareContext } from './use-models-compare'
import type { ColumnState } from './models-compare-utils'

/** 对比列网格 + 独立输入模式共用的隐藏 file input */
export function CompareColumns({ ctx }: { ctx: ModelsCompareContext }) {
  const columns = ctx.columns ?? []
  const { columnFileInputRef, pendingAttachmentColumnRef } = ctx
  return (
    <>
      <div className="models-compare-columns" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((column, idx) => (
          <CompareColumnCard key={column.conversationId || idx} ctx={ctx} column={column} idx={idx} />
        ))}
      </div>

      {/* 独立输入模式各列共用一个隐藏 file input，点哪列的附件按钮就把目标列存进 ref
         （PRD §AC-07/§AC-08，qa#553）；accept 取全部类别允许类型的并集，实际类型/大小
         校验在 handleColumnFileSelect 里按该列模型精确判断。 */}
      {!ctx.syncInput && (
        <input
          ref={columnFileInputRef}
          type="file"
          accept={ctx.allowedAttachmentKinds.map((k) => ATTACHMENT_LIMITS[k].accept).join(',')}
          className="hidden"
          onChange={(e) => {
            const idx = pendingAttachmentColumnRef.current
            if (idx !== null) void ctx.handleColumnFileSelect(idx, e.target.files?.[0])
          }}
        />
      )}
    </>
  )
}

function CompareColumnCard({ ctx, column, idx }: { ctx: ModelsCompareContext; column: ColumnState; idx: number }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { abortRefs, columnFileInputRef, pendingAttachmentColumnRef } = ctx

  return (
    <section
      className={cn(
        'models-experience-chat models-compare-column',
        idx === ctx.activeColumnIndex && 'is-active-mobile',
      )}
    >
      <div className="models-experience-modelbar">
        <button
          type="button"
          className="models-experience-model-trigger"
          onClick={(e) => {
            trackEvent('playground_model_picker_open', { picker_type: 'compareSwitch', browse_category: ctx.compareCategory })
            ctx.setSwitchPickerAnchor(e.currentTarget)
            ctx.setSwitchPickerIndex(idx)
          }}
        >
          {isOfflineModel(column.model) ? (
            <span className="models-experience-model-avatar is-offline">!</span>
          ) : (
            <ModelIcon model={column.model} size={32} rounded="rounded-md" />
          )}
          <div className="min-w-0">
            <div className="models-experience-modelbar-title">
              {isOfflineModel(column.model) ? t('modelsExperience.modelOffline') : prettyModelName(column.model.display_name, column.model.model_id, modelVendorLabel(column.model, ''))}
            </div>
            <div className="models-experience-modelbar-sub">{modelVendorLabel(column.model)} · {experienceTaskLabel(ctx.compareTask)}</div>
          </div>
          {isOfflineModel(column.model) ? (
            <span className="models-experience-price-chip is-offline">{t('modelsExperience.modelOffline')}</span>
          ) : (
            <span className="models-experience-price-chip">{dualPriceText(column.model)}</span>
          )}
          <LuChevronDown size={13} className="text-mg-text-3 shrink-0" />
        </button>
        {/* shrink-0：三列挤压时收缩空间应该全落在左边可截断的模型条上，不能让
            设置/删除这组常驻控件被一起挤没（shared/modelgo_prd#317） */}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="models-experience-icon-btn"
            aria-label={t('modelsExperience.openApiCall')}
            title={isOfflineModel(column.model) ? t('modelsExperience.modelOffline') : t('modelsExperience.openApiCall')}
            disabled={isOfflineModel(column.model)}
            onClick={() => {
              trackEvent('playground_api_modal_action', { action: 'open', protocol: '', language: '', model_id: column.model.model_id })
              ctx.setApiIndex(idx)
            }}
          >
            <LuCode size={13} />
          </button>
          <button
            type="button"
            className="models-experience-icon-btn"
            aria-label={t('modelsExperience.openModelSettings')}
            title={isOfflineModel(column.model) ? t('modelsExperience.modelOffline') : t('modelsExperience.openModelSettings')}
            disabled={isOfflineModel(column.model)}
            onClick={() => void ctx.openColumnSettings(idx)}
          >
            <LuSettings2 size={13} />
          </button>
          <button type="button" className="models-experience-icon-btn" aria-label={t('modelsExperience.compare.removeModel')} title={t('modelsExperience.compare.removeModel')} onClick={() => ctx.setRemoveConfirmIndex(idx)}>
            <LuX size={13} />
          </button>
        </div>
      </div>

      <ExperienceMessageList
        messages={column.history}
        isStreaming={column.streaming}
        showModelNameInMeta={false}
        isMediaTask={ctx.compareCategory !== 'dialogue'}
        isAsyncMediaTask={ctx.compareCategory === 'video'}
        onRetry={(userMessage) => ctx.retryMediaMessage(idx, userMessage)}
        assistantModel={column.model}
        emptyState={
          <div className="models-experience-empty">
            {(() => {
              const EmptyIcon = categoryEmptyCopy(ctx.compareTask).icon
              return <EmptyIcon size={18} />
            })()}
            <strong>{categoryEmptyCopy(ctx.compareTask).title}</strong>
            <span>{categoryEmptyCopy(ctx.compareTask).hint}</span>
          </div>
        }
      />

      {ctx.isBalanceZero && isPaidModel(column.model) && (
        <div className="playground-balance-notice" role="alert">
          <LuTriangleAlert size={15} />
          <span>
            <strong>{t('modelsExperience.balanceInsufficientTitle')}</strong>
            {t('modelsExperience.balanceInsufficientHint')}
          </span>
          <button
            type="button"
            onClick={() => {
              trackEvent('playground_recharge_click', { locked_model_count: 1 })
              navigate('/billing', { state: { entrySource: 'recharge_cta' } })
            }}
          >
            {t('modelsExperience.recharge')}
          </button>
        </div>
      )}

      {!ctx.syncInput && isOfflineModel(column.model) ? (
        // 下线模型：composer 整体替换为提示，禁止发送（PRD §AC-18，对齐原型
        // App.tsx:18634-18641，用户需从上方模型条换成同类同任务的在线模型）
        <div className="playground-balance-notice" role="status">
          <LuTriangleAlert size={15} />
          <span>
            <strong>{t('modelsExperience.modelOffline')}</strong>
            {t('modelsExperience.modelOfflineHint')}
          </span>
        </div>
      ) : !ctx.syncInput && (() => {
        // 独立输入模式的列内附件入口（PRD §AC-07/§AC-08，qa#553 补齐）：dialogue 类
        // 按当前列模型实际支持的附件类型开放通用回形针；needs-file 任务改用下面的
        // TaskFileDropZone（跟单模型页同款），纯文本任务不显示任何附件入口。
        const columnKinds = ctx.compareCategory === 'dialogue' ? ctx.allowedAttachmentKinds.filter((k) => modelSupportsAttachment(column.model, k)) : []
        const colAttachment = ctx.columnAttachments[column.conversationId]
        const colUploading = ctx.columnAttachmentUploading[column.conversationId]
        const colError = ctx.columnAttachmentErrors[column.conversationId]
        return (
          // onFocusCapture 记录"最后聚焦列"，独立→同步切换时用它当来源列（§7.4）
          <div onFocusCapture={() => ctx.setLastFocusedIndex(idx)}>
            {ctx.compareCategory === 'dialogue' && (colAttachment || colError) && (
              <div className="models-experience-attachment-row">
                {colAttachment && (
                  <div className="models-experience-attachment-chip">
                    {attachmentKindFromMime(colAttachment.uploaded.mime) === 'image' ? (
                      <img src={colAttachment.previewUrl} alt={t('modelsExperience.attachmentPreview')} />
                    ) : (
                      <span className="models-experience-attachment-name">{colAttachment.file.name}</span>
                    )}
                    <button type="button" aria-label={t('modelsExperience.removeAttachment')} onClick={() => ctx.clearColumnAttachment(column.conversationId)}>
                      <LuX size={12} />
                    </button>
                  </div>
                )}
                {colError && <span className="models-experience-attachment-error">{colError}</span>}
              </div>
            )}
            {ctx.compareNeedsFileTask && (
              <TaskFileDropZone
                task={ctx.compareTask}
                file={colAttachment ? { name: colAttachment.file.name, sizeBytes: colAttachment.file.size, previewUrl: colAttachment.previewUrl } : null}
                error={colError}
                uploading={colUploading}
                onFileChange={(file) => void ctx.handleColumnFileSelect(idx, file)}
                onRemove={() => ctx.clearColumnAttachment(column.conversationId)}
              />
            )}
            <Composer
              value={column.draft}
              onChange={(v) => ctx.updateColumn(idx, { draft: v })}
              onSend={() => ctx.handleIndependentSend(idx)}
              isStreaming={column.streaming}
              disabled={ctx.isBalanceZero && isPaidModel(column.model)}
              onStop={() => abortRefs.current[idx]?.abort()}
              placeholder={ctx.compareTask === 'image_to_image'
                ? t('modelsExperience.taskPlaceholder.image_to_image')
                : t('modelsExperience.compare.columnPlaceholder', { name: prettyModelName(column.model.display_name, column.model.model_id, modelVendorLabel(column.model, '')), placeholder: categoryPlaceholder(ctx.compareCategory) })}
              sendLabel={t('modelsExperience.send')}
              className="models-experience-composer-wrap models-compare-composer"
              sendEnabled={ctx.compareTask === 'audio_to_text' ? !!colAttachment : undefined}
              textareaSlot={ctx.compareTask === 'audio_to_text' ? (
                <div className="models-task-transcribe-ready">{t('modelsExperience.transcribeReady')}</div>
              ) : undefined}
              activeChip={
                columnKinds.length > 0 ? (
                  <button
                    type="button"
                    className="models-experience-icon-btn"
                    aria-label={t('modelsExperience.addAttachment')}
                    title={`${t('modelsExperience.attachmentSupports')}${columnKinds.map((k) => attachmentLimitLabel(k)).join(t('modelsExperience.listSeparator'))}`}
                    disabled={colUploading || !!colAttachment}
                    onClick={() => {
                      pendingAttachmentColumnRef.current = idx
                      columnFileInputRef.current?.click()
                    }}
                  >
                    <LuPaperclip size={14} />
                  </button>
                ) : (
                  <span />
                )
              }
            />
          </div>
        )
      })()}
    </section>
  )
}
