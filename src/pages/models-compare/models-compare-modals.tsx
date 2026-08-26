/**
 * 模型对比工作台：全部弹窗（拆分后抽取）。
 * 切换/加模型选型、设置、API 调用、移除/退出/同步确认、附件兼容性提示。
 */

import { useTranslation } from 'react-i18next'
import { LuInfo } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Modal } from '@/components/ui/Modal'
import { prettyModelName } from '@/lib/utils'
import { modelVendorLabel } from '@/features/models/model-format'
import { trackEvent } from '@/lib/track'
import { attachmentKindFromMime } from '../models/model-experience-data'
import { ModelPickerDialog } from '../models/components/ModelPickerDialog'
import { ModelsCompareModal } from '../models/components/ModelsCompareModal'
import { ModelSettingsModal } from '../models/components/ModelSettingsModal'
import { ApiQuickCallModal } from '../models/components/ApiQuickCallModal'
import { MAX_COMPARE } from './models-compare-utils'
import type { ModelsCompareContext } from './use-models-compare'

/** 全部弹窗容器：列内切换/加模型/设置/API 调用/移除/退出/同步确认/附件兼容提示 */
export function CompareModals({ ctx }: { ctx: ModelsCompareContext }) {
  const { t } = useTranslation()
  const columns = ctx.columns ?? []
  const settingsIndex = ctx.settingsIndex
  const apiIndex = ctx.apiIndex
  const removeConfirmIndex = ctx.removeConfirmIndex

  return (
    <>
      <ModelPickerDialog
        open={ctx.switchPickerIndex !== null}
        onClose={() => ctx.setSwitchPickerIndex(null)}
        anchorEl={ctx.switchPickerAnchor}
        mode="compareSwitch"
        models={ctx.allModels.filter((m) => ctx.switchPickerIndex === null || !ctx.excludeIdsFor(ctx.switchPickerIndex).includes(m.id))}
        isBalanceZero={ctx.isBalanceZero}
        currentCategory={ctx.compareCategory}
        currentTask={ctx.compareTask}
        onSelect={(model) => {
          void ctx.handleSwitchConfirm(model)
          ctx.setSwitchPickerIndex(null)
        }}
        requiredAttachmentKind={(() => {
          if (ctx.switchPickerIndex === null) return null
          const targetColumn = columns[ctx.switchPickerIndex]
          if (!targetColumn) return null
          const staged = ctx.syncInput ? ctx.attachment : ctx.columnAttachments[targetColumn.conversationId]
          return staged ? attachmentKindFromMime(staged.uploaded.mime) : null
        })()}
      />

      {/* shared/modelgo_prd#335：「添加模型」与模型广场共用同一个对比弹窗 ——
          原型里两处本来就是同一个 MarketplaceCompareModal，移植时被拆成两个组件导致样式分叉。
          已在对比中的列全部作为 lockedIds 固定展示、不可取消；上限仍是 MAX_COMPARE。 */}
      <ModelsCompareModal
        isOpen={ctx.addPickerOpen}
        onClose={() => ctx.setAddPickerOpen(false)}
        allModels={ctx.allModels}
        lockedIds={columns.map((c) => c.model.id)}
        maxSelectable={MAX_COMPARE}
        isBalanceZero={ctx.isBalanceZero}
        anchorCategory={ctx.compareCategory}
        anchorTask={ctx.compareTask}
        onConfirmAdd={ctx.handleAddConfirm}
      />

      {settingsIndex !== null && columns[settingsIndex] && (
        <ModelSettingsModal
          open
          onClose={() => ctx.setSettingsIndex(null)}
          modelName={prettyModelName(columns[settingsIndex].model.display_name, columns[settingsIndex].model.model_id)}
          vendor={modelVendorLabel(columns[settingsIndex].model)}
          maxOutputTokens={Math.max(256, columns[settingsIndex].model.max_output_tokens || 4096)}
          task={ctx.compareTask}
          values={columns[settingsIndex].chatParams}
          onChange={(key, value) => ctx.handleColumnParamChange(settingsIndex, key, value)}
          onReset={() => ctx.handleColumnParamReset(settingsIndex)}
          sessionStats={ctx.sessionStats}
          multipleModels={columns.length > 1}
        />
      )}

      {apiIndex !== null && columns[apiIndex] && (
        <ApiQuickCallModal
          open
          onClose={() => ctx.setApiIndex(null)}
          modelName={prettyModelName(columns[apiIndex].model.display_name, columns[apiIndex].model.model_id)}
          modelId={columns[apiIndex].model.model_id}
          supportedProtocols={columns[apiIndex].model.protocols?.length ? (columns[apiIndex].model.protocols as never) : ['openai_chat_completions']}
          onAction={(action, protocol, language) => trackEvent('playground_api_modal_action', { action, protocol, language, model_id: columns[apiIndex].model.model_id })}
        />
      )}

      <ConfirmModal
        open={removeConfirmIndex !== null}
        onClose={() => {
          if (removeConfirmIndex !== null && columns[removeConfirmIndex]) {
            trackEvent('playground_model_remove', { model_id: columns[removeConfirmIndex].model.model_id, action: 'cancel' })
          }
          ctx.setRemoveConfirmIndex(null)
        }}
        onConfirm={ctx.handleRemoveConfirmed}
        title={t('modelsExperience.compare.removeModelConfirmTitle')}
        description={t('modelsExperience.compare.removeModelConfirmDesc')}
        variant="destructive"
        confirmLabel={t('modelsExperience.compare.removeModel')}
      />

      <ConfirmModal
        open={ctx.exitConfirmOpen}
        onClose={() => ctx.setExitConfirmOpen(false)}
        onConfirm={ctx.handleExitConfirmed}
        title={t('modelsExperience.compare.exitConfirmTitle')}
        description={t('modelsExperience.compare.exitConfirmDesc')}
        confirmLabel={t('modelsExperience.compare.exitCompare')}
      />

      <ConfirmModal
        open={ctx.syncConfirm !== null}
        onClose={() => ctx.setSyncConfirm(null)}
        onConfirm={ctx.confirmSyncSwitch}
        title={t('modelsExperience.compare.syncConfirmTitle')}
        description={t('modelsExperience.compare.syncConfirmDesc', { name: ctx.syncConfirm ? prettyModelName(columns[ctx.syncConfirm.sourceIndex]?.model.display_name, columns[ctx.syncConfirm.sourceIndex]?.model.model_id) : '' })}
        confirmLabel={t('modelsExperience.compare.confirmSync')}
      >
        {ctx.syncConfirm && (
          <>
            {/* 同步前预览将要覆盖到其他列的文本，避免用户误按确认后才发现同步的内容不对（原型逐字对齐） */}
            <pre className="mt-3 whitespace-pre-wrap rounded-md border border-mg-border bg-mg-fill-0/40 p-3 text-xs text-mg-text-2 max-h-40 overflow-y-auto">
              {ctx.syncConfirm.sourceText || t('modelsExperience.compare.syncConfirmBlankDraft')}
            </pre>
            <div className="mt-2 flex items-start gap-1.5 text-xs text-mg-text-3">
              <LuInfo size={14} className="mt-0.5 shrink-0" />
              <span>
                {ctx.syncConfirm.sourceAttachmentName
                  ? t('modelsExperience.compare.syncConfirmAttachmentPresent', { name: ctx.syncConfirm.sourceAttachmentName })
                  : t('modelsExperience.compare.syncConfirmAttachmentCleared')}
              </span>
            </div>
          </>
        )}
      </ConfirmModal>

      {/* 「部分模型支持该附件」提示框（shared#337，PRD 原型 PlaygroundAttachmentCompatibilityDialog
          逐字对齐）：上传后部分列不支持时弹出，分组列出收到附件/仅收到文本的模型，单按钮确认。 */}
      <Modal
        open={ctx.attachmentCompatibility !== null}
        onClose={() => ctx.setAttachmentCompatibility(null)}
        title={t('modelsExperience.compare.attachmentCompatibilityTitle')}
        description={ctx.attachmentCompatibility?.attachmentName}
        size="sm"
        footer={
          <Button variant="brand" onClick={() => ctx.setAttachmentCompatibility(null)}>
            {t('modelsExperience.compare.attachmentCompatibilityConfirm')}
          </Button>
        }
      >
        {ctx.attachmentCompatibility && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <section className="rounded-md border border-mg-border bg-mg-fill-0/40 p-3">
                <p className="text-xs font-semibold text-mg-text-2">
                  {t('modelsExperience.compare.attachmentCompatibilitySupported')}
                </p>
                <ul className="mt-1.5 space-y-1 text-sm text-mg-text-1">
                  {ctx.attachmentCompatibility.supportedModelNames.map((name) => <li key={name}>{name}</li>)}
                </ul>
              </section>
              <section className="rounded-md border border-mg-border bg-mg-fill-0/40 p-3">
                <p className="text-xs font-semibold text-mg-text-2">
                  {t('modelsExperience.compare.attachmentCompatibilityUnsupported')}
                </p>
                <ul className="mt-1.5 space-y-1 text-sm text-mg-text-1">
                  {ctx.attachmentCompatibility.unsupportedModelNames.map((name) => <li key={name}>{name}</li>)}
                </ul>
              </section>
            </div>
            {/* 提示行成型为 info 条（#337 reopen：裸文本视觉上"没对齐"），样式在 compare.css */}
            <div className="models-compare-dialog-note">
              <LuInfo size={14} />
              <span>{t('modelsExperience.compare.attachmentCompatibilityNote')}</span>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
