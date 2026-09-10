import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/ui/PageHeader'
import { modelVendorLabel } from '@/features/models/model-format'
import { prettyModelName } from '@/lib/utils'
import { trackEvent } from '@/lib/track'
import {
  attachmentKindFromMime,
  categoryEmptyCopy,
  playgroundSamplePrompts,
} from './model-experience-data'
import { useModelsPlayground } from './use-models-playground'
import { PlaygroundModelBar } from './playground-modelbar'
import { PlaygroundComposer } from './playground-composer'
import { HistorySessionSidebar } from './components/HistorySessionSidebar'
import { ExperienceModelCard } from './ExperienceModelCard'
import { ExperienceMessageList } from './components/ExperienceMessageList'
import { ModelPickerDialog } from './components/ModelPickerDialog'
import { ModelSettingsModal } from './components/ModelSettingsModal'
import { ApiQuickCallModal } from './components/ApiQuickCallModal'
import { ModelsCompareModal } from './components/ModelsCompareModal'
import './styles/model-experience-layout.css'
import './styles/model-picker.css'
import './styles/model-featured-card.css'
import './styles/model-list.css'
import './styles/model-chat.css'
import './styles/model-composer.css'
import './styles/model-params.css'
import './styles/model-experience-responsive.css'

/** 单模型体验页（/models/playground）：页面壳 + 编排，逻辑在 useModelsPlayground。 */
export default function ModelsPage() {
  const { t } = useTranslation()
  const {
    navigate,
    inputRef,
    allModels,
    selectedModel,
    selectedCategory,
    isDialogue,
    isSelectedModelOffline,
    effectiveTask,
    categoryTasks,
    needsFileTask,
    allowedAttachmentKinds,
    messages,
    sessionId,
    chatParams,
    sessionStats,
    isBalanceZero,
    isBlockedByBalance,
    freeModelGate,
    composerEstimatedSpend,
    historyCollapsed,
    setHistoryCollapsed,
    historySessions,
    pickerOpen,
    setPickerOpen,
    pickerAnchor,
    settingsOpen,
    setSettingsOpen,
    apiCallOpen,
    setApiCallOpen,
    compareAddOpen,
    setCompareAddOpen,
    input,
    setInput,
    isStreaming,
    attachment,
    attachmentUploading,
    attachmentError,
    fileInputRef,
    handleOpenPicker,
    handleOpenApiCall,
    handleOpenCompare,
    handlePick,
    handleTaskSwitch,
    openSettings,
    handleChatParamChange,
    handleResetChatParams,
    startNewSession,
    openHistorySession,
    renameHistorySession,
    deleteHistorySession,
    sendPrompt,
    handleFileSelect,
    clearAttachment,
    stopStreaming,
    retryMediaMessage,
  } = useModelsPlayground()

  return (
    <div className="models-experience-page models-playground-page">
      <PageHeader title={t('modelsExperience.page.title')} description={t('modelsExperience.page.description')} className="models-experience-page-header" />
      <div className="models-experience-shell">
        {/* 历史会话固定侧栏（PRD §7.8）：收起态窄图标轨，展开 248px；接真实 GET /experience/sessions，
            展开时拉取列表，点击会话用 GET messages 恢复消息到当前视图 */}
        <HistorySessionSidebar
          collapsed={historyCollapsed}
          onToggleCollapsed={(collapsed) => {
            if (!collapsed) trackEvent('playground_history_action', { action: 'open' })
            setHistoryCollapsed(collapsed)
          }}
          sessions={historySessions}
          activeSessionId={sessionId ?? undefined}
          onSelectSession={(id) => void openHistorySession(id)}
          onNewSession={() => {
            trackEvent('playground_history_action', { action: 'new' })
            startNewSession()
          }}
          onRenameSession={(id, name) => void renameHistorySession(id, name)}
          onDeleteSession={(id) => {
            trackEvent('playground_history_action', { action: 'delete' })
            return deleteHistorySession(id)
          }}
        />

        <div className="models-experience-main">
          <div className="models-experience-workbench">
            <section className="models-experience-chat is-single">
              <PlaygroundModelBar
                selectedModel={selectedModel}
                task={effectiveTask}
                onOpenPicker={handleOpenPicker}
                onOpenApiCall={handleOpenApiCall}
                onOpenSettings={() => void openSettings()}
                onCompare={handleOpenCompare}
              />

              <ExperienceMessageList
                messages={messages}
                isStreaming={isStreaming}
                isMediaTask={!isDialogue}
                isAsyncMediaTask={selectedCategory === 'video'}
                onRetry={retryMediaMessage}
                assistantModel={selectedModel}
                emptyState={
                  /* 需求方 #834：选中模型时空态整块换成模型卡片 —— 原型
                     （modelgo_prd/src/App.tsx:20887）就是「有模型给 WelcomeCard、
                     没模型才给提示块」的二选一，卡片不是加在引导文案旁边的挂件。
                     模型缺失/已下线时保留原有的玻璃球 + 分类文案（Figma「模型体验」稿；
                     示例 Prompt 在输入框下方，见 Composer 之后）。 */
                  selectedModel && !isSelectedModelOffline ? (
                    <div className="models-experience-empty">
                      <ExperienceModelCard model={selectedModel} task={effectiveTask} />
                    </div>
                  ) : (
                    <div className="models-experience-empty">
                      <span className="models-experience-empty-orb" aria-hidden="true">
                        <span className="models-experience-empty-orb-refract-a" />
                        <span className="models-experience-empty-orb-refract-b" />
                        <span className="models-experience-empty-orb-rim" />
                      </span>
                      <strong>{categoryEmptyCopy(effectiveTask).title}</strong>
                      <span>{categoryEmptyCopy(effectiveTask).hint}</span>
                    </div>
                  )
                }
              />

              <PlaygroundComposer
                selectedModel={selectedModel}
                category={selectedCategory}
                effectiveTask={effectiveTask}
                categoryTasks={categoryTasks}
                isDialogue={isDialogue}
                isSelectedModelOffline={isSelectedModelOffline}
                needsFileTask={needsFileTask}
                isBlockedByBalance={isBlockedByBalance}
                freeModelGate={freeModelGate}
                isStreaming={isStreaming}
                allowedAttachmentKinds={allowedAttachmentKinds}
                attachment={attachment}
                attachmentUploading={attachmentUploading}
                attachmentError={attachmentError}
                composerEstimatedSpend={composerEstimatedSpend}
                input={input}
                inputRef={inputRef}
                fileInputRef={fileInputRef}
                onInputChange={setInput}
                onSend={sendPrompt}
                onStop={stopStreaming}
                onTaskSwitch={handleTaskSwitch}
                onFileChange={(file) => void handleFileSelect(file)}
                onRemoveAttachment={() => clearAttachment()}
              />

              {/* 空态示例 Prompt 卡片（PRD §7.2 文案不变；位置按 Figma 稿从空态区挪到输入框下方，
                  仅对话类且尚无消息时展示，点击回填输入框） */}
              {isDialogue && !isSelectedModelOffline && messages.length === 0 && (
                <div className="models-experience-sample-cards">
                  {playgroundSamplePrompts().map((sample) => (
                    <button
                      key={sample.label}
                      type="button"
                      onClick={() => {
                        setInput(sample.prompt)
                        window.setTimeout(() => inputRef.current?.focus(), 80)
                      }}
                    >
                      {sample.prompt}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      <ModelPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        anchorEl={pickerAnchor}
        mode="single"
        models={allModels}
        isBalanceZero={isBalanceZero}
        onSelect={handlePick}
        currentTask={effectiveTask}
        requiredAttachmentKind={attachment ? attachmentKindFromMime(attachment.uploaded.mime) : null}
      />

      {selectedModel && (
        <ModelSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          modelName={prettyModelName(selectedModel.display_name, selectedModel.model_id, modelVendorLabel(selectedModel, ''))}
          modelId={selectedModel.model_id}
          vendor={modelVendorLabel(selectedModel)}
          maxOutputTokens={Math.max(256, selectedModel.max_output_tokens || 4096)}
          task={effectiveTask}
          values={chatParams}
          onChange={handleChatParamChange}
          onReset={handleResetChatParams}
          sessionStats={sessionStats}
        />
      )}

      {selectedModel && (
        <ApiQuickCallModal
          open={apiCallOpen}
          onClose={() => setApiCallOpen(false)}
          modelName={prettyModelName(selectedModel.display_name, selectedModel.model_id, modelVendorLabel(selectedModel, ''))}
          modelId={selectedModel.model_id}
          supportedProtocols={selectedModel.protocols?.length ? (selectedModel.protocols as never) : ['openai_chat_completions']}
          onAction={(action, protocol, language) => trackEvent('playground_api_modal_action', { action, protocol, language, model_id: selectedModel.model_id })}
        />
      )}

      {/* PRD §7.3：单模型点「模型对比」打开统一候选弹窗，可勾选第 2/3 个模型；
          当前模型固定展示为「已选模型」不可取消；确认后一次性带着完整模型组进入对比页。
          shared/modelgo_prd#335：与模型广场共用 ModelsCompareModal —— 原型里这两处本来
          就是同一个 MarketplaceCompareModal，移植时被拆成了两个组件、样式跟着分叉。 */}
      {selectedModel && (
        <ModelsCompareModal
          isOpen={compareAddOpen}
          onClose={() => setCompareAddOpen(false)}
          allModels={allModels}
          lockedIds={[selectedModel.id]}
          maxSelectable={3}
          isBalanceZero={isBalanceZero}
          anchorCategory={selectedCategory}
          anchorTask={effectiveTask}
          onConfirmAdd={(added) => {
            if (added.length === 0) return
            trackEvent('playground_compare_enter', { sidebar_was_collapsed: historyCollapsed })
            navigate('/models/compare', { state: { selectedIds: [selectedModel.id, ...added.map((m) => m.id)], compareTask: effectiveTask } })
          }}
        />
      )}
    </div>
  )
}
