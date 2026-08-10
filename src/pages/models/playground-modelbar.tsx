import { useTranslation } from 'react-i18next'
import { LuChevronDown, LuCode, LuSettings2, LuColumns2 } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { modelVendorLabel } from '@/features/models/model-format'
import { prettyModelName } from '@/lib/utils'
import type { CatalogModelItem } from '@/types'
import { dualPriceText, experienceTaskLabel, isOfflineModel, type ExperienceTaskType } from './model-experience-data'

export interface PlaygroundModelBarProps {
  selectedModel: CatalogModelItem | null
  task: ExperienceTaskType
  onOpenPicker: (anchor: HTMLElement) => void
  onOpenApiCall: () => void
  onOpenSettings: () => void
  onCompare: () => void
}

/** 单模型工作台头部（PRD §7.2 + 原型 App.tsx:19116-19135 逐字对照）：
 *  左侧模型选择器（头像+模型名+厂商·任务+价格chip），右侧纯图标 API调用/模型设置 + 文字版模型对比。
 *  原型头部没有 model_id 明文复制入口——那个入口挪进了 API 调用弹窗（PRD §7.7）。 */
export function PlaygroundModelBar({
  selectedModel,
  task,
  onOpenPicker,
  onOpenApiCall,
  onOpenSettings,
  onCompare,
}: PlaygroundModelBarProps) {
  const { t } = useTranslation()
  const offline = Boolean(selectedModel && isOfflineModel(selectedModel))
  const modelName = selectedModel
    ? prettyModelName(selectedModel.display_name, selectedModel.model_id, modelVendorLabel(selectedModel, ''))
    : ''
  const vendor = selectedModel ? modelVendorLabel(selectedModel) : ''
  const taskLabel = experienceTaskLabel(task)

  return (
    <div className="models-experience-modelbar">
      <button
        type="button"
        className="models-experience-model-trigger"
        onClick={(e) => onOpenPicker(e.currentTarget)}
      >
        {selectedModel && (
          <>
            {offline ? (
              <span className="models-experience-model-avatar is-offline">!</span>
            ) : (
              <ModelIcon model={selectedModel} size={32} rounded="rounded-md" />
            )}
            <div className="min-w-0">
              <div className="models-experience-modelbar-title">
                {offline ? t('modelsExperience.modelOffline') : modelName}
              </div>
              <div className="models-experience-modelbar-sub">
                {vendor} · {taskLabel}
              </div>
            </div>
            {offline ? (
              <span className="models-experience-price-chip is-offline">{t('modelsExperience.modelOffline')}</span>
            ) : (
              <span className="models-experience-price-chip">
                {selectedModel && dualPriceText(selectedModel)}
              </span>
            )}
            <LuChevronDown size={15} className="text-mg-text-3 shrink-0" />
          </>
        )}
      </button>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          className="models-experience-icon-btn"
          aria-label={t('modelsExperience.openApiCall')}
          disabled={!selectedModel || offline}
          title={selectedModel ? (offline ? t('modelsExperience.modelOffline') : t('modelsExperience.viewApiExample', { name: modelName })) : t('modelsExperience.openApiCall')}
          onClick={onOpenApiCall}
        >
          <LuCode size={14} />
        </button>
        <button
          type="button"
          className="models-experience-icon-btn"
          aria-label={t('modelsExperience.openModelSettings')}
          disabled={!selectedModel || offline}
          title={selectedModel ? (offline ? t('modelsExperience.modelOffline') : t('modelsExperience.configureModel', { name: modelName })) : t('modelsExperience.openModelSettings')}
          onClick={onOpenSettings}
        >
          <LuSettings2 size={14} />
        </button>
        {/* qa#543：对比入口不再限对话类——PRD §6.2/§7.3 要求图像/音频/视频也能进入对比 */}
        {/* 视觉改版（Figma「模型体验」稿）：对比入口为反白胶囊按钮，浮在渐变卡上 */}
        <Button
          variant="outline"
          size="sm"
          className="rounded-full bg-mg-bg-0"
          onClick={onCompare}
        >
          <LuColumns2 size={13} /> {t('modelsExperience.modelCompare')}
        </Button>
      </div>
    </div>
  )
}
