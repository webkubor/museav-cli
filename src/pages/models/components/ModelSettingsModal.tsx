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
  task: ModelTaskType
  /** 当前参数值（外部管理状态，本组件是受控组件） */
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  onReset: () => void
  /** 本会话累计（只包含该模型在本会话中的成功/计费结果，mock 数据由外部传入） */
  sessionStats: ModelSettingsSessionStats
}

// 对话任务默认参数上限，仅作为输入约束提示；真实模型上限以外部数据为准（此处先用固定值占位）
const CHAT_MAX_TOKENS_CAP = 32000

function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && !Number.isNaN(v) ? v : fallback
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

/** 对话任务参数表单：temperature、top_p、max_tokens、流式输出、System Prompt */
function ChatParamsForm({
  values,
  onChange,
}: {
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
}) {
  const temperature = asNumber(values.temperature, 1)
  const topP = asNumber(values.top_p, 1)
  const maxTokens = asNumber(values.max_tokens, 4096)
  const stream = asBool(values.stream, true)
  const systemPrompt = asString(values.systemPrompt)

  return (
    <div className="model-settings-form">
      <section className="model-settings-section">
        <h4 className="model-settings-section-title">基础参数</h4>

        <div className="model-settings-field">
          <div className="model-settings-field-label-row">
            <label htmlFor="ms-temperature" className="model-settings-field-label">
              Temperature
            </label>
            <span className="model-settings-field-value">{temperature.toFixed(2)}</span>
          </div>
          <input
            id="ms-temperature"
            type="range"
            min={0}
            max={2}
            step={0.01}
            value={temperature}
            onChange={(e) => onChange('temperature', Number(e.target.value))}
            className="model-settings-slider"
          />
        </div>

        <div className="model-settings-field">
          <div className="model-settings-field-label-row">
            <label htmlFor="ms-top-p" className="model-settings-field-label">
              Top P
            </label>
            <span className="model-settings-field-value">{topP.toFixed(2)}</span>
          </div>
          <input
            id="ms-top-p"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={topP}
            onChange={(e) => onChange('top_p', Number(e.target.value))}
            className="model-settings-slider"
          />
        </div>

        <div className="model-settings-field">
          <label htmlFor="ms-max-tokens" className="model-settings-field-label">
            Max Tokens
          </label>
          <Input
            id="ms-max-tokens"
            type="number"
            min={1}
            max={CHAT_MAX_TOKENS_CAP}
            value={maxTokens}
            onChange={(e) => onChange('max_tokens', Number(e.target.value))}
          />
          <p className="model-settings-hint">max_tokens 不得超过模型上限（{CHAT_MAX_TOKENS_CAP}）</p>
        </div>

        <div className="model-settings-field model-settings-field-row">
          <label htmlFor="ms-stream" className="model-settings-field-label">
            流式输出
          </label>
          <Switch id="ms-stream" checked={stream} onChange={(checked) => onChange('stream', checked)} />
        </div>
      </section>

      <section className="model-settings-section">
        <h4 className="model-settings-section-title">System Prompt</h4>
        <Textarea
          rows={5}
          placeholder="可选，为当前模型设置系统提示词"
          value={systemPrompt}
          onChange={(e) => onChange('systemPrompt', e.target.value)}
        />
      </section>
    </div>
  )
}

/** 任务参数表单占位：文生图/图生图、语音合成、语音识别、文生视频/图生视频（TODO 待补充） */
function PlaceholderParamsForm({ task }: { task: ModelTaskType }) {
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
  values,
  onChange,
  onReset,
  sessionStats,
}: ModelSettingsModalProps) {
  const footer = (
    <div className="model-settings-footer">
      <div className="model-settings-stats">
        <div className="model-settings-stat">
          <span className="model-settings-stat-label">请求数</span>
          <span className="model-settings-stat-value">{sessionStats.requestCount}</span>
        </div>
        <div className="model-settings-stat">
          <span className="model-settings-stat-label">Tokens</span>
          <span className="model-settings-stat-value">{sessionStats.tokens}</span>
        </div>
        <div className="model-settings-stat">
          <span className="model-settings-stat-label">预估费用</span>
          <span className="model-settings-stat-value">¥{sessionStats.cost.toFixed(4)}</span>
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
          {modelName} 的设置
        </span>
      }
      footer={footer}
    >
      {DIALOGUE_TASKS.includes(task) ? (
        <ChatParamsForm values={values} onChange={onChange} />
      ) : (
        <PlaceholderParamsForm task={task} />
      )}
    </Modal>
  )
}

export default ModelSettingsModal
