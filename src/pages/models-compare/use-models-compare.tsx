/**
 * 模型对比工作台数据层：交互处理器组合层（PRD 1.0.4 模型体验 §7.1/7.3/7.4/8.1-8.3）。
 * 状态/副作用/会话生命周期见 use-models-compare-state.tsx，附件处理见
 * use-compare-attachments.tsx，发送流程见 use-compare-send.tsx；本文件把三者组合成
 * 与旧扁平 ctx 同形状的上下文，并保留输入模式切换/移除/退出/加模型/设置等弹窗处理器。
 *
 * 真源：飞书《ModelGo Console 重构 PRD：模型体验页面（v0.1）》+ 后端
 * 《模型体验(Playground V1)前端接口文档》2026-07-27 + Swagger（modelgo-web-api）核实到的
 * 真实列级端点（PRD 接口文档 §3.8 对应的表格在飞书内嵌 sheet 里，工具权限读不到，
 * 是从 https://modelgo-web-api.test.modelgo.com/swagger/doc.json 里查到 POST/PATCH/DELETE
 * .../conversations 和 .../configs 的真实路径与请求体形状，不是瞎猜）。
 */

import {
  addExperienceConversation,
  removeExperienceConversation,
  switchExperienceConversationModel,
  listExperienceModelConfigs,
  saveExperienceModelConfig,
  resetExperienceModelConfig,
  getExperienceSessionStats,
  matchesModelConfigId,
} from '@/services/experience-sessions'
import type { CatalogModelItem } from '@/types'
import { trackEvent } from '@/lib/track'
import { appToast } from '@/lib/app-toast'
import {
  attachmentKindFromMime,
  modelSupportsAttachment,
  normalizeChatParams,
} from '../models/model-experience-data'
import { MAX_COMPARE, type ColumnState } from './models-compare-utils'
import { useCompareSend } from './use-compare-send'
import { useModelsCompareState } from './use-models-compare-state'

/** 页面数据层：组合状态层/附件层/发送层，并承载输入模式切换与弹窗/会话管理处理器。 */
export function useModelsCompare() {
  const state = useModelsCompareState()
  const {
    t,
    navigate,
    restoreSavedPreference,
    setBootError,
    columns,
    setColumns,
    sessionId,
    setSessionStats,
    setSyncInput,
    sharedDraft,
    setSharedDraft,
    lastFocusedIndex,
    removeConfirmIndex,
    setRemoveConfirmIndex,
    switchPickerIndex,
    syncConfirm,
    setSyncConfirm,
    setSettingsIndex,
    attachment,
    clearAttachment,
    clearColumnAttachment,
    columnAttachments,
    setColumnAttachments,
    abortRefs,
    updateColumn,
    abortColumnStream,
  } = state
  const send = useCompareSend(state)

  /** §7.4：独立→同步，若各列草稿不一致需要确认；一致则直接切换不打扰用户。
   *  切到同步后各列独立附件没有对应的"合并成一个共享附件"语义，清空（用户需要的话
   *  在共享入口重新上传）；切回独立时反过来——共享附件按兼容性下放到各列（AC-07）。 */
  function handleToggleSync(next: boolean) {
    if (!columns) return
    if (next) {
      const source = columns[lastFocusedIndex] ?? columns[0]
      const allSame = columns.every((c) => c.draft === source.draft)
      const sourceAttachmentName = columnAttachments[source.conversationId]?.file.name ?? null
      const sourceHasAttachment = Boolean(sourceAttachmentName)
      Object.keys(columnAttachments).forEach((conversationId) => clearColumnAttachment(conversationId))
      if (allSame) {
        setSharedDraft(source.draft)
        setSyncInput(true)
        trackEvent('playground_input_mode_change', {
          from_mode: 'independent', to_mode: 'sync', requires_confirmation: false,
          source_has_attachment: sourceHasAttachment, attachment_recipient_count: 0,
        }, { result: 'success' })
        return
      }
      setSyncConfirm({ sourceIndex: lastFocusedIndex, sourceText: source.draft, sourceAttachmentName })
      trackEvent('playground_input_mode_change', {
        from_mode: 'independent', to_mode: 'sync', requires_confirmation: true,
        source_has_attachment: sourceHasAttachment, attachment_recipient_count: 0,
      })
      return
    }
    // 同步→独立：文本复制到每列草稿；共享附件按兼容性下放到支持的列（AC-07「保留兼容附件」）
    setColumns((prev) => (prev ? prev.map((c) => ({ ...c, draft: sharedDraft })) : prev))
    let recipientCount = 0
    if (attachment && columns) {
      const kind = attachmentKindFromMime(attachment.uploaded.mime)
      if (kind) {
        const seeded = attachment
        setColumnAttachments((prevMap) => {
          const next = { ...prevMap }
          columns.forEach((c) => {
            if (modelSupportsAttachment(c.model, kind)) {
              next[c.conversationId] = seeded
              recipientCount += 1
            }
          })
          return next
        })
      }
      clearAttachment()
    }
    setSyncInput(false)
    trackEvent('playground_input_mode_change', {
      from_mode: 'sync', to_mode: 'independent', requires_confirmation: false,
      source_has_attachment: Boolean(attachment), attachment_recipient_count: recipientCount,
    }, { result: 'success' })
  }

  function confirmSyncSwitch() {
    if (!syncConfirm) return
    setSharedDraft(syncConfirm.sourceText)
    setSyncInput(true)
    setSyncConfirm(null)
    trackEvent('playground_input_mode_change', {
      from_mode: 'independent', to_mode: 'sync', requires_confirmation: true,
      source_has_attachment: false, attachment_recipient_count: 0,
    }, { result: 'success' })
  }

  async function handleRemoveConfirmed() {
    if (removeConfirmIndex === null || !columns || !sessionId) return
    const target = columns[removeConfirmIndex]
    trackEvent('playground_model_remove', { model_id: target.model.model_id, action: 'confirm' })
    if (columns.length <= 2) {
      // §7.3：移除至单模型按退出对比同样规则处理——保留最左侧主模型，恢复侧栏。
      // 原型口径（App.tsx removeCompareModel + 确认弹窗文案）：只有被移除那列的记录
      // 永久丢失，保留列的会话原样带回单模型页——所以要传 resume 语义让单模型页
      // 恢复该会话，而不是只带 selectedModelId 让它开新会话（shared/modelgo_prd#339：
      // 之前主模型的会话内容被一并清空）。
      const keepColumn = columns[0].model.model_id === target.model.model_id ? columns[1] : columns[0]
      try {
        await removeExperienceConversation(sessionId, target.conversationId)
      } catch {
        // 真实删列失败也不阻塞回退到单模型页——用户的主要诉求是离开对比
      }
      restoreSavedPreference()
      navigate('/models/playground', {
        state: {
          selectedModelId: keepColumn.model.model_id,
          resumeSessionId: sessionId,
          resumeConversationId: keepColumn.conversationId,
        },
      })
      return
    }
    try {
      await removeExperienceConversation(sessionId, target.conversationId)
      setColumns((prev) => (prev ? prev.filter((_, i) => i !== removeConfirmIndex) : prev))
      setRemoveConfirmIndex(null)
    } catch (err) {
      setBootError(`${t('modelsExperience.compare.removeModelFailed')}${(err as Error).message || t('modelsExperience.retryLater')}`)
    }
  }

  async function handleExitConfirmed() {
    if (!columns) return
    trackEvent('playground_compare_exit', { action: 'confirm' })
    // 原型 exitComparison：session 只剩最左主列（columns: [retainedColumn]），其余列彻底移除。
    // 之前只做前端导航、没删 session 里其余列的 conversation，历史会话列表按
    // session.models 渲染就仍显示对比模型（shared/modelgo_prd#343）。
    if (sessionId) {
      await Promise.allSettled(
        columns.slice(1).map((c) => removeExperienceConversation(sessionId, c.conversationId)),
      ) // 删除失败不阻塞导航——用户的主要诉求是离开对比（同删列路径容错）
    }
    restoreSavedPreference()
    // 原型 exitComparison 保留最左主列及其会话记录（丢失的只有其余对比列），
    // 与上面「删到剩一列」同一根因、同一收敛：带 resume 语义回单模型页
    navigate('/models/playground', {
      state: {
        selectedModelId: columns[0].model.model_id,
        resumeSessionId: sessionId,
        resumeConversationId: columns[0].conversationId,
      },
    })
  }

  /** §7.3：加模型——调真实加列端点，只追加新列，不影响已有列的对话历史 */
  async function handleAddConfirm(added: CatalogModelItem[]) {
    if (!columns || !sessionId || added.length === 0) return
    try {
      const toAdd = added.slice(0, MAX_COMPARE - columns.length)
      const baseCount = columns.length
      const newConversations = await Promise.all(toAdd.map((model) => addExperienceConversation(sessionId, model.model_id)))
      setColumns((prev) => {
        if (!prev) return prev
        const newColumns: ColumnState[] = toAdd.map((model, i) => ({
          model,
          conversationId: newConversations[i].id,
          history: [],
          streaming: false,
          draft: '',
          chatParams: {},
        }))
        abortRefs.current = [...abortRefs.current, ...newColumns.map(() => null)]
        return [...prev, ...newColumns]
      })
      toAdd.forEach((model, i) => {
        trackEvent('playground_model_add', { model_id: model.model_id, next_count: baseCount + i + 1 })
      })
    } catch (err) {
      setBootError(`${t('modelsExperience.compare.addModelFailed')}${(err as Error).message || t('modelsExperience.retryLater')}`)
    }
  }

  /** §7.1：对比列内切换模型（shared/modelgo_prd#336）——后端 PATCH 语义已改（observer
   *  f776c33）：模型实际变化时服务端同事务删除该 conversation 的全部消息（刷新/历史恢复
   *  也干净），重选同一模型不视为「换」、历史不动。前端与之对齐：换模型成功后中断该列
   *  进行中的流式输出并清空本地消息，从干净上下文开始；同模型则保留现状。 */
  async function handleSwitchConfirm(model: CatalogModelItem) {
    if (switchPickerIndex === null || !columns || !sessionId) return
    const idx = switchPickerIndex
    const target = columns[idx]
    const modelChanged = model.model_id !== target.model.model_id
    try {
      await switchExperienceConversationModel(sessionId, target.conversationId, model.model_id)
      if (modelChanged) {
        abortColumnStream(idx)
        updateColumn(idx, { model, chatParams: {}, history: [], streaming: false })
      }
      trackEvent('playground_model_select', { from_model_id: target.model.model_id, to_model_id: model.model_id }, { result: 'success' })
    } catch (err) {
      setBootError(`${t('modelsExperience.compare.switchModelFailed')}${(err as Error).message || t('modelsExperience.retryLater')}`)
      trackEvent('playground_model_select', { from_model_id: target.model.model_id, to_model_id: model.model_id }, { result: 'fail' })
    }
  }

  /** 打开设置弹窗：拉取该列模型已持久化的配置 + 本会话累计统计（真实端点见 Swagger） */
  async function openColumnSettings(idx: number) {
    trackEvent('playground_settings_action', { action: 'open' })
    setSettingsIndex(idx)
    if (!sessionId || !columns) return
    const model = columns[idx].model
    try {
      const [{ items: configs }, { items: stats }] = await Promise.all([
        listExperienceModelConfigs(sessionId),
        getExperienceSessionStats(sessionId),
      ])
      const savedConfig = configs.find((c) => matchesModelConfigId(c.model_id, model.model_id))
      if (savedConfig) updateColumn(idx, { chatParams: normalizeChatParams(savedConfig.config) })
      const modelStats = stats.find((s) => s.model_id === model.model_id)
      if (modelStats) {
        setSessionStats({
          requestCount: modelStats.requests,
          tokens: modelStats.total_tokens,
          cost: Number(modelStats.actual_spend ?? modelStats.estimated_spend ?? 0),
        })
      }
    } catch {
      // 拉取失败不阻塞设置弹窗使用
    }
  }

  function handleColumnParamChange(idx: number, key: string, value: unknown) {
    if (!columns) return
    trackEvent('playground_settings_action', { action: 'modify', parameter_name: key })
    const next = { ...columns[idx].chatParams, [key]: value }
    updateColumn(idx, { chatParams: next })
    // sessionId 在会话建好前为空，本地 chatParams 已生效，静默跳过持久化即可
    if (sessionId) {
      saveExperienceModelConfig(sessionId, columns[idx].model.model_id, next).catch((err) => {
        appToast.requestError(err, t('modelsExperience.settings.saveFailed'))
      })
    }
  }

  function handleColumnParamReset(idx: number) {
    if (!columns) return
    trackEvent('playground_settings_action', { action: 'reset' })
    updateColumn(idx, { chatParams: {} })
    if (sessionId) {
      resetExperienceModelConfig(sessionId, columns[idx].model.model_id).catch((err) => {
        appToast.requestError(err, t('modelsExperience.settings.resetFailed'))
      })
    }
  }

  return {
    ...state,
    ...send,
    handleToggleSync,
    confirmSyncSwitch,
    handleRemoveConfirmed,
    handleExitConfirmed,
    handleAddConfirm,
    handleSwitchConfirm,
    openColumnSettings,
    handleColumnParamChange,
    handleColumnParamReset,
  }
}

/** 页面上下文：useModelsCompare 的返回值，供子组件作为 ctx 传入。 */
export type ModelsCompareContext = ReturnType<typeof useModelsCompare>
