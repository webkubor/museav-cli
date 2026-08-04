/**
 * 模型对比工作台：顶部工具栏 + 窄屏列切换 Tab（拆分后抽取）。
 */

import { useTranslation } from 'react-i18next'
import { LuColumns2, LuLogOut, LuPlus } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { trackEvent } from '@/lib/track'
import { prettyModelName, cn } from '@/lib/utils'
import { modelVendorLabel } from '@/features/models/model-format'
import { experienceTaskLabel } from '../models/model-experience-data'
import { MAX_COMPARE, columnStatus } from './models-compare-utils'
import type { ModelsCompareContext } from './use-models-compare'

/** 顶部工具栏：任务/数量说明 + 同步输入开关 + 加模型/退出对比 */
export function CompareToolbar({ ctx }: { ctx: ModelsCompareContext }) {
  const { t } = useTranslation()
  const columns = ctx.columns ?? []
  return (
    <div className="models-compare-toolbar">
      <div className="models-compare-toolbar-left">
        <LuColumns2 size={15} className="text-brand-base" />
        <strong>{t('modelsExperience.compare.toolbarTitle')}</strong>
        {/* 原型 App.tsx:19104 用的是「任务」标签(文生视频)不是类别(视频)，且措辞是
            「同一输入发送给 N 个模型 · 最多 M 个」，不是简写的「N / M 个模型」 */}
        <span className="models-compare-toolbar-meta">{experienceTaskLabel(ctx.compareTask)} · {t('modelsExperience.compare.modelCount', { count: columns.length, max: MAX_COMPARE })}</span>
      </div>
      <div className="models-compare-toolbar-right">
        <label className="flex items-center gap-2 select-none cursor-pointer">
          <span className="text-xs font-semibold text-mg-text-3">{t('modelsExperience.compare.syncInput')}</span>
          <Switch checked={ctx.syncInput} onChange={ctx.handleToggleSync} />
        </label>
        <Button
          variant="outline"
          size="sm"
          disabled={columns.length >= MAX_COMPARE}
          onClick={() => {
            trackEvent('playground_model_picker_open', { picker_type: 'compareAdd', browse_category: ctx.compareCategory })
            ctx.setAddPickerOpen(true)
          }}
        >
          <LuPlus size={13} /> {t('modelsExperience.compare.addModel')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => ctx.setExitConfirmOpen(true)}>
          <LuLogOut size={13} /> {t('modelsExperience.compare.exitCompare')}
        </Button>
      </div>
    </div>
  )
}

/** 窄屏一次展示一个模型列，顶部 Tab 切换；宽屏由 CSS 隐藏，不影响并排布局（§8.5） */
export function CompareMobileTabs({ ctx }: { ctx: ModelsCompareContext }) {
  const { t } = useTranslation()
  const columns = ctx.columns ?? []
  return (
    <div className="models-compare-mobile-tabs" role="tablist" aria-label={t('modelsExperience.compare.switchColumnTabs')}>
      {columns.map((column, idx) => {
        const status = columnStatus(column)
        return (
          <button
            key={column.conversationId || idx}
            type="button"
            role="tab"
            aria-selected={idx === ctx.activeColumnIndex}
            className={cn('models-compare-mobile-tab', idx === ctx.activeColumnIndex && 'is-active')}
            onClick={() => ctx.setActiveColumnIndex(idx)}
          >
            <span
              className={cn('models-compare-mobile-tab-dot', `is-${status}`)}
              aria-hidden="true"
            />
            {prettyModelName(column.model.display_name, column.model.model_id, modelVendorLabel(column.model, ''))}
          </button>
        )
      })}
    </div>
  )
}
