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
import { Select } from '@/components/ui/Select'
import { EXPERIENCE_TASK_LABEL, type ExperienceTaskType } from '../model-experience-data'
import '../styles/model-settings-modal.css'

export type ModelTaskType = ExperienceTaskType

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

const TASK_LABEL = EXPERIENCE_TASK_LABEL

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

/** 数字下拉字段（画面比例/分辨率/时长等），逐字对齐原型 PlaygroundSelect（App.tsx:20456-20470） */
function SelectField({
  label,
  value,
  options,
  suffix,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  suffix?: string
  onChange: (value: string) => void
}) {
  return (
    <div className="model-settings-field">
      <label className="model-settings-field-label">{label}</label>
      <Select value={value} onChange={onChange} className="h-9 text-xs rounded-lg">
        {options.map((opt) => (
          <Select.Option key={opt} value={opt}>
            {opt}{suffix ? ` ${suffix}` : ''}
          </Select.Option>
        ))}
      </Select>
    </div>
  )
}

/** 文生图/图生图参数表单：比例/分辨率/质量/数量 + 格式/透明背景/负面提示词/Seed（PRD §7.9 逐字对齐） */
function ImageParamsForm({ values, onChange }: { values: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  const aspectRatio = asString(values.aspect_ratio, '1:1')
  const resolution = asString(values.resolution, '1024')
  const quality = asString(values.quality, 'standard')
  const count = asString(values.count, '1')
  const format = asString(values.format, 'PNG')
  const transparent = asBool(values.transparent, false)
  const negativePrompt = asString(values.negative_prompt)
  const seed = asString(values.seed)

  return (
    <div className="model-settings-form">
      <SelectField label="画面比例" value={aspectRatio} options={['1:1', '4:3', '16:9']} onChange={(v) => onChange('aspect_ratio', v)} />
      <SelectField label="分辨率" value={resolution} options={['1024', '1536', '2048']} onChange={(v) => onChange('resolution', v)} />
      <SelectField label="质量" value={quality} options={['standard', 'high']} onChange={(v) => onChange('quality', v)} />
      <SelectField label="生成数量" value={count} options={['1', '2', '3', '4']} onChange={(v) => onChange('count', v)} />

      <details className="model-settings-advanced" open>
        <summary>高级设置</summary>
        <SelectField label="输出格式" value={format} options={['PNG', 'JPEG', 'WebP']} onChange={(v) => onChange('format', v)} />
        <div className="model-settings-field model-settings-field-row">
          <label className="model-settings-field-label">透明背景</label>
          <Switch checked={transparent} onChange={(checked) => onChange('transparent', checked)} />
        </div>
        <div className="model-settings-field">
          <label className="model-settings-field-label">负面提示词</label>
          <Textarea rows={2} value={negativePrompt} onChange={(e) => onChange('negative_prompt', e.target.value)} />
        </div>
        <div className="model-settings-field">
          <label className="model-settings-field-label">Seed</label>
          <Input type="number" placeholder="随机" value={seed} onChange={(e) => onChange('seed', e.target.value)} />
        </div>
      </details>
    </div>
  )
}

/** 语音合成参数表单：音色/语速/格式 + 风格指令（PRD §7.9 逐字对齐） */
function TTSParamsForm({ values, onChange }: { values: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  const voice = asString(values.voice, '晓辰')
  const speed = asNumber(values.speed, 1)
  const format = asString(values.audio_format, 'MP3')
  const voiceStyle = asString(values.voice_style)

  return (
    <div className="model-settings-form">
      <SelectField label="音色" value={voice} options={['晓辰', '安然', 'Miles']} onChange={(v) => onChange('voice', v)} />
      <div className="model-settings-field">
        <div className="model-settings-field-label-row">
          <label className="model-settings-field-label">语速</label>
          <span className="model-settings-field-value">{speed.toFixed(1)}x</span>
        </div>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.1}
          value={speed}
          onChange={(e) => onChange('speed', Number(e.target.value))}
          className="model-settings-slider"
        />
      </div>
      <SelectField label="音频格式" value={format} options={['MP3', 'WAV', 'M4A']} onChange={(v) => onChange('audio_format', v)} />

      <details className="model-settings-advanced" open>
        <summary>高级设置</summary>
        <div className="model-settings-field">
          <label className="model-settings-field-label">风格指令</label>
          <Textarea
            rows={3}
            placeholder="例如：沉稳、温暖、适合产品介绍"
            value={voiceStyle}
            onChange={(e) => onChange('voice_style', e.target.value)}
          />
        </div>
      </details>
    </div>
  )
}

/** 语音识别参数表单：语言/时间戳/输出格式 + 专有词汇/上下文提示（PRD §7.9 逐字对齐） */
function TranscribeParamsForm({ values, onChange }: { values: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  const language = asString(values.language, '自动识别')
  const timestamps = asString(values.timestamps, '关闭')
  const format = asString(values.transcript_format, '纯文本')
  const terms = asString(values.terms)
  const contextPrompt = asString(values.context_prompt)

  return (
    <div className="model-settings-form">
      <SelectField label="识别语言" value={language} options={['自动识别', '中文', '英文', '日文']} onChange={(v) => onChange('language', v)} />
      <SelectField label="时间戳" value={timestamps} options={['关闭', '分段', '逐词']} onChange={(v) => onChange('timestamps', v)} />
      <SelectField label="输出格式" value={format} options={['纯文本', 'JSON', 'SRT']} onChange={(v) => onChange('transcript_format', v)} />

      <details className="model-settings-advanced" open>
        <summary>高级设置</summary>
        <div className="model-settings-field">
          <label className="model-settings-field-label">专有词汇</label>
          <Textarea rows={2} placeholder="ModelGo、API Gateway" value={terms} onChange={(e) => onChange('terms', e.target.value)} />
        </div>
        <div className="model-settings-field">
          <label className="model-settings-field-label">上下文提示</label>
          <Textarea rows={2} placeholder="可选：补充音频主题" value={contextPrompt} onChange={(e) => onChange('context_prompt', e.target.value)} />
        </div>
      </details>
    </div>
  )
}

/** 文生视频/图生视频参数表单：时长/比例/分辨率/数量 + 负面提示词/Seed/生成音频（PRD §7.9 逐字对齐） */
function VideoParamsForm({ values, onChange }: { values: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  const duration = asString(values.duration, '5')
  const aspectRatio = asString(values.aspect_ratio, '16:9')
  const resolution = asString(values.resolution, '720p')
  const count = asString(values.count, '1')
  const negativePrompt = asString(values.negative_prompt)
  const seed = asString(values.seed)
  const generateAudio = asBool(values.generate_audio, false)

  return (
    <div className="model-settings-form">
      <SelectField label="视频时长" value={duration} options={['5', '8', '10']} suffix="秒" onChange={(v) => onChange('duration', v)} />
      <SelectField label="画面比例" value={aspectRatio} options={['16:9', '9:16', '1:1']} onChange={(v) => onChange('aspect_ratio', v)} />
      <SelectField label="分辨率" value={resolution} options={['720p', '1080p']} onChange={(v) => onChange('resolution', v)} />
      <SelectField label="生成数量" value={count} options={['1', '2']} onChange={(v) => onChange('count', v)} />

      <details className="model-settings-advanced" open>
        <summary>高级设置</summary>
        <div className="model-settings-field">
          <label className="model-settings-field-label">负面提示词</label>
          <Textarea rows={2} value={negativePrompt} onChange={(e) => onChange('negative_prompt', e.target.value)} />
        </div>
        <div className="model-settings-field">
          <label className="model-settings-field-label">Seed</label>
          <Input type="number" placeholder="随机" value={seed} onChange={(e) => onChange('seed', e.target.value)} />
        </div>
        <div className="model-settings-field model-settings-field-row">
          <label className="model-settings-field-label">生成音频</label>
          <Switch checked={generateAudio} onChange={(checked) => onChange('generate_audio', checked)} />
        </div>
      </details>
    </div>
  )
}

/** 按任务类型分发到对应参数表单（PRD §7.9） */
function TaskParamsForm({
  task,
  values,
  onChange,
}: {
  task: ModelTaskType
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
}) {
  if (task === 'text_to_image' || task === 'image_to_image') return <ImageParamsForm values={values} onChange={onChange} />
  if (task === 'text_to_audio') return <TTSParamsForm values={values} onChange={onChange} />
  if (task === 'audio_to_text') return <TranscribeParamsForm values={values} onChange={onChange} />
  return <VideoParamsForm values={values} onChange={onChange} />
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
        <TaskParamsForm task={task} values={values} onChange={onChange} />
      )}
    </Modal>
  )
}

export default ModelSettingsModal
