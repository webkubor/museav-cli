/**
 * 逐模型设置弹窗（PRD §7.6 / §7.9）
 * 每个模型列顶部「设置」入口的专属弹窗：只展示当前模型 + 当前任务适用参数，
 * 参数变化只影响当前模型的预估费用；不提供全局统一参数栏。
 * 配置以会话内 modelId 为键保存 —— 由外部（父组件）管理 values/onChange/onReset，
 * 本组件是纯受控组件，不持有任何参数状态。
 */
import { LuRotateCcw, LuSettings2 } from 'react-icons/lu'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Switch } from '@/components/ui/Switch'
import '../styles/model-settings-modal.css'

// 九类体验任务枚举，取自后端 2026-07-27 已合入 test 的《模型体验(Playground V1)前端接口文档》
// §二 task 值域，字面值以文档为准（不是 PRD 文字里的猜测名）
export type ModelTaskType =
  | 'text_to_text'
  | 'image_to_text'
  | 'video_to_text'
  | 'text_to_image'
  | 'image_to_image'
  | 'text_to_audio'
  | 'audio_to_text'
  | 'text_to_video'
  | 'image_to_video'

/** 对话组三个任务（PRD §7.9「对话」参数集适用于三者，接口都走 SSE） */
const DIALOGUE_TASKS: readonly ModelTaskType[] = ['text_to_text', 'image_to_text', 'video_to_text']

export interface ModelSettingsSessionStats {
  requestCount: number
  tokens: number
  cost: number
}

export interface ModelSettingsModalProps {
  open: boolean
  onClose: () => void
  modelName: string
  /** 弹窗副标题「厂商 · 任务」，逐字对齐原型 App.tsx:20223（playground-settings-modal-head） */
  vendor?: string
  task: ModelTaskType
  /** 模型真实 max_output_tokens，用于 max_tokens 输入上限（原型 effectiveMaxOutput = max(256, model.maxOutput||4096)，App.tsx:20232） */
  maxOutputTokens?: number
  /** 当前参数值（外部管理状态，本组件是受控组件） */
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  onReset: () => void
  /** 本会话累计（只包含该模型在本会话中的成功/计费结果，mock 数据由外部传入） */
  sessionStats: ModelSettingsSessionStats
}

const TASK_LABEL: Record<ModelTaskType, string> = {
  text_to_text: '对话',
  image_to_text: '对话',
  video_to_text: '对话',
  text_to_image: '文生图',
  image_to_image: '图生图',
  text_to_audio: '语音合成',
  audio_to_text: '语音识别',
  text_to_video: '文生视频',
  image_to_video: '图生视频',
}

function formatNumber(value: number): string {
  return Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value)
}

/** 费用格式：≥0.01 或恰好为 0 显示 2 位小数，否则 4 位（原型 App.tsx:20440 逐字对齐） */
function formatSessionSpend(spend: number): string {
  return spend >= 0.01 || spend === 0 ? `¥${spend.toFixed(2)}` : `¥${spend.toFixed(4)}`
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && !Number.isNaN(v) ? v : fallback
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

/**
 * 对话任务参数表单：temperature、top_p、max_tokens、流式输出、System Prompt。
 * 逐字对齐原型 App.tsx:20280-20309 PlaygroundTaskConfigPanel 的 chat 分支——
 * 是一个扁平字段列表，不分「基础参数/System Prompt」两个子分组（那是我之前自己发挥加的）。
 */
function ChatParamsForm({
  values,
  onChange,
  maxOutputTokens,
}: {
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  maxOutputTokens: number
}) {
  const temperature = asNumber(values.temperature, 1)
  const topP = asNumber(values.top_p, 1)
  const maxTokens = asNumber(values.max_tokens, Math.min(4096, maxOutputTokens))
  const stream = asBool(values.stream, true)
  const systemPrompt = asString(values.systemPrompt)

  return (
    <div className="model-settings-form">
      <div className="model-settings-field">
        <div className="model-settings-field-label-row">
          <label htmlFor="ms-temperature" className="model-settings-field-label">
            temperature
          </label>
          <span className="model-settings-field-value">{temperature.toFixed(1)}</span>
        </div>
        <input
          id="ms-temperature"
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={temperature}
          onChange={(e) => onChange('temperature', Number(e.target.value))}
          className="model-settings-slider"
        />
      </div>

      <div className="model-settings-field">
        <div className="model-settings-field-label-row">
          <label htmlFor="ms-top-p" className="model-settings-field-label">
            top_p
          </label>
          <span className="model-settings-field-value">{topP.toFixed(2)}</span>
        </div>
        <input
          id="ms-top-p"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={topP}
          onChange={(e) => onChange('top_p', Number(e.target.value))}
          className="model-settings-slider"
        />
      </div>

      <div className="model-settings-field">
        <div className="model-settings-field-label-row">
          <label htmlFor="ms-max-tokens" className="model-settings-field-label">
            max_tokens
          </label>
          <span className="model-settings-field-value">上限 {formatNumber(maxOutputTokens)}</span>
        </div>
        <Input
          id="ms-max-tokens"
          type="number"
          min={256}
          max={maxOutputTokens}
          step={256}
          value={maxTokens}
          onChange={(e) => {
            const value = Number(e.target.value)
            if (Number.isNaN(value)) return
            onChange('max_tokens', Math.max(256, Math.min(maxOutputTokens, Math.round(value))))
          }}
        />
      </div>

      <div className="model-settings-field model-settings-field-row">
        <label htmlFor="ms-stream" className="model-settings-field-label">
          流式输出
        </label>
        <Switch id="ms-stream" checked={stream} onChange={(checked) => onChange('stream', checked)} />
      </div>

      <div className="model-settings-field">
        <label htmlFor="ms-system-prompt" className="model-settings-field-label">
          System Prompt
        </label>
        <Textarea
          id="ms-system-prompt"
          rows={3}
          placeholder="可选：设定角色、语气与边界"
          value={systemPrompt}
          onChange={(e) => onChange('systemPrompt', e.target.value)}
        />
      </div>
    </div>
  )
}

/** 任务参数表单占位：文生图/图生图、语音合成、语音识别、文生视频/图生视频（TODO 待补充） */
function PlaceholderParamsForm({ task }: { task: ModelTaskType }) {
  // TODO(PRD §7.9)：按任务类型补充真实参数表单，参见 PRD 任务参数表：
  // 文生图/图生图 -> 比例/分辨率/质量/数量 + 格式/透明背景/负面提示词/Seed
  // 语音合成 -> 音色/语速/格式 + 风格指令
  // 语音识别 -> 语言/时间戳/输出格式 + 专有词汇/上下文提示
  // 文生视频/图生视频 -> 时长/比例/分辨率/数量 + 负面提示词/Seed/生成音频
  return <div className="model-settings-placeholder">「{TASK_LABEL[task]}」任务参数表单待补充（TODO）</div>
}

export function ModelSettingsModal({
  open,
  onClose,
  modelName,
  task,
  vendor,
  maxOutputTokens = 4096,
  values,
  onChange,
  onReset,
  sessionStats,
}: ModelSettingsModalProps) {
  const isDialogue = DIALOGUE_TASKS.includes(task)

  const footer = (
    <div className="model-settings-footer">
      <div className="model-settings-stats">
        <div className="model-settings-stat">
          <span className="model-settings-stat-label">请求数</span>
          <span className="model-settings-stat-value">{sessionStats.requestCount}</span>
        </div>
        {isDialogue && (
          <div className="model-settings-stat">
            <span className="model-settings-stat-label">Tokens</span>
            <span className="model-settings-stat-value">{formatNumber(sessionStats.tokens)}</span>
          </div>
        )}
        <div className="model-settings-stat">
          <span className="model-settings-stat-label">费用</span>
          <span className="model-settings-stat-value">{formatSessionSpend(sessionStats.cost)}</span>
        </div>
      </div>
      <Button variant="outline" size="sm" icon={<LuRotateCcw size={14} />} onClick={onReset}>
        重置
      </Button>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <LuSettings2 size={18} className="text-brand-base" />
          <span className="flex flex-col">
            <span>{modelName} 设置</span>
            <span className="text-xs font-normal text-mg-text-3">{vendor ?? 'ModelGo'} · {TASK_LABEL[task]}</span>
          </span>
        </span>
      }
      footer={footer}
    >
      {isDialogue ? (
        <ChatParamsForm values={values} onChange={onChange} maxOutputTokens={maxOutputTokens} />
      ) : (
        <PlaceholderParamsForm task={task} />
      )}
    </Modal>
  )
}

export default ModelSettingsModal
