/**
 * 模型对比工作台（PRD 1.0.4 模型体验 §7.3/7.4/8.1-8.3）页面壳。
 * 逻辑与状态编排在 use-models-compare.tsx，区块组件见 models-compare-components.tsx。
 */

import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { trackEvent } from '@/lib/track'
import { HistorySessionSidebar } from '../models/components/HistorySessionSidebar'
import '../models/styles/model-experience-layout.css'
import '../models/styles/model-chat.css'
import '../models/styles/model-composer.css'
import '../models/styles/model-picker-dialog.css'
import '../models/styles/model-settings-modal.css'
import '../models/styles/api-quick-call-modal.css'
import './compare.css'
import {
  CompareToolbar,
  CompareMobileTabs,
  CompareColumns,
  CompareSharedComposer,
  CompareModals,
} from './models-compare-components'
import { useModelsCompare } from './use-models-compare'

export default function ModelsComparePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const ctx = useModelsCompare()

  if (ctx.bootError) {
    return (
      <div className="models-experience-page">
        <PageHeader title={t('modelsExperience.compare.pageTitle')} description={ctx.bootError} className="mb-4" />
        <div className="models-experience-shell">
          {/* 没有 selectedIds（刷新/直接开 URL）不代表用户没有正在进行的会话——历史侧栏照样带出来，
              能从里面点回刚才的对比会话，不是只有"返回重新选模型"一条路（见 boot 的 useEffect）。 */}
          <HistorySessionSidebar
            collapsed={ctx.historyCollapsed}
            onToggleCollapsed={(collapsed) => {
              if (!collapsed) trackEvent('playground_history_action', { action: 'open' })
              ctx.setHistoryCollapsed(collapsed)
            }}
            sessions={ctx.historySessions}
            onSelectSession={(id) => void ctx.openHistorySession(id)}
            onNewSession={() => navigate('/models/playground')}
            onRenameSession={(id, name) => void ctx.renameHistorySession(id, name)}
          />
          <div className="models-experience-main">
            <Button variant="brand" onClick={() => navigate('/models/playground')}>{t('modelsExperience.compare.backToExperience')}</Button>
          </div>
        </div>
      </div>
    )
  }

  if (!ctx.columns) {
    return (
      <div className="models-experience-page">
        <PageHeader title={t('modelsExperience.compare.pageTitle')} description={t('modelsExperience.compare.preparing')} className="mb-4" />
      </div>
    )
  }

  return (
    <div className="models-experience-page">
      <PageHeader title={t('modelsExperience.page.title')} description={t('modelsExperience.compare.description')} className="mb-4" />

      <div className="models-experience-shell">
        {/* §7.8 历史会话侧栏（qa#546）：与单模型页同款受控组件，展开时拉取列表；选中会话
            按 conversation_id 分组还原成多列（见 openHistorySession），新建会话退回单模型页
            重新走"选模型 → 模型对比"入口（对比页本身没有内嵌选模型态）。 */}
        <HistorySessionSidebar
          collapsed={ctx.historyCollapsed}
          onToggleCollapsed={(collapsed) => {
            if (!collapsed) trackEvent('playground_history_action', { action: 'open' })
            ctx.setHistoryCollapsed(collapsed)
          }}
          sessions={ctx.historySessions}
          activeSessionId={ctx.sessionId ?? undefined}
          onSelectSession={(id) => void ctx.openHistorySession(id)}
          onNewSession={() => {
            trackEvent('playground_history_action', { action: 'new' })
            ctx.startNewSession()
          }}
          onRenameSession={(id, name) => void ctx.renameHistorySession(id, name)}
        />

        <div className="models-experience-main">
          <CompareToolbar ctx={ctx} />
          <CompareMobileTabs ctx={ctx} />
          <CompareColumns ctx={ctx} />
          <CompareSharedComposer ctx={ctx} />
          <CompareModals ctx={ctx} />
        </div>
      </div>
    </div>
  )
}
