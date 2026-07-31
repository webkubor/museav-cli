/**
 * 逐模型设置弹窗（PRD §7.6 / §7.9）
 * 每个模型列顶部「设置」入口的专属弹窗：只展示当前模型 + 当前任务适用参数，
 * 参数变化只影响当前模型的预估费用；不提供全局统一参数栏。
 * 配置以会话内 modelId 为键保存 —— 由外部（父组件）管理 values/onChange/onReset，
 * 本组件是纯受控组件，不持有任何参数状态。
 */
import { useTranslation } from 'react-i18next'
import { LuRotateCcw, LuSettings2, LuSlidersHorizontal } from 'react-icons/lu'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Switch } from '@/components/ui/Switch'
import { Select } from '@/components/ui/Select'
import { experienceTaskLabel, type ExperienceTaskType } from '../model-experience-data'
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
  /** 是否处于多模型对比会话（原型 App.tsx:19468 session.columns.length > 1）。
   *  true 时图像/视频的「生成数量」锁定为 1 并显示说明文案（App.tsx:20321-20322/20363-20364：
   *  多模型会话里每个模型固定生成 1 份，不允许再叠乘）。 */
  multipleModels?: boolean
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
  const { t } = useTranslation()
  const temperature = asNumber(values.temperature, 1)
  const topP = asNumber(values.top_p, 1)
  const maxTokens = asNumber(values.max_tokens, Math.min(4096, maxOutputTokens))
  const stream = asBool(values.stream, true)
  // 键名必须是 system_prompt（下划线）——后端只认这个键（shared/modelgo_prd#315：
  // 此前存 systemPrompt 驼峰，config 落库成功但网关拼请求时取不到，系统提示词整体失效；
  // 2026-07-31 test 环境实测 system_prompt 生效、systemPrompt/system 均被无视）
  const systemPrompt = asString(values.system_prompt)

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
          <span className="model-settings-field-value">{t('modelsExperience.settings.maxLimit')} {formatNumber(maxOutputTokens)}</span>
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
          {t('modelsExperience.settings.stream')}
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
          placeholder={t('modelsExperience.settings.systemPromptPlaceholder')}
          value={systemPrompt}
          onChange={(e) => onChange('system_prompt', e.target.value)}
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
  disabled,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  suffix?: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="model-settings-field">
      <label className="model-settings-field-label">{label}</label>
      <Select value={value} onChange={onChange} disabled={disabled} className="h-9 text-xs rounded-lg">
        {options.map((opt) => (
          <Select.Option key={opt} value={opt}>
            {opt}{suffix ? ` ${suffix}` : ''}
          </Select.Option>
        ))}
      </Select>
    </div>
  )
}

/**
 * 文生图/图生图参数表单：比例/分辨率/质量/数量 + 格式/透明背景/负面提示词/Seed（PRD §7.9 逐字对齐）
 * 注意：SelectField 的 options 是发给后端的参数值（非纯展示文案），只翻译 label，不翻译 options
 * 里的选项值——那些是接口约定的枚举，翻译了会改变实际传给后端的值。
 */
function ImageParamsForm({ values, onChange, multipleModels = false }: { values: Record<string, unknown>; onChange: (key: string, value: unknown) => void; multipleModels?: boolean }) {
  const { t } = useTranslation()
  const aspectRatio = asString(values.aspect_ratio, '1:1')
  const resolution = asString(values.resolution, '1024')
  const quality = asString(values.quality, 'standard')
  const count = multipleModels ? '1' : asString(values.count, '1')
  const format = asString(values.format, 'PNG')
  const transparent = asBool(values.transparent, false)
  const negativePrompt = asString(values.negative_prompt)
  const seed = asString(values.seed)

  return (
    <div className="model-settings-form">
      <SelectField label={t('modelsExperience.settings.aspectRatio')} value={aspectRatio} options={['1:1', '4:3', '16:9']} onChange={(v) => onChange('aspect_ratio', v)} />
      <SelectField label={t('modelsExperience.settings.resolution')} value={resolution} options={['1024', '1536', '2048']} onChange={(v) => onChange('resolution', v)} />
      <SelectField label={t('modelsExperience.settings.quality')} value={quality} options={['standard', 'high']} onChange={(v) => onChange('quality', v)} />
      <SelectField disabled={multipleModels} label={t('modelsExperience.settings.count')} value={count} options={multipleModels ? ['1'] : ['1', '2', '3', '4']} onChange={(v) => onChange('count', v)} />
      {multipleModels && <p className="model-settings-inline-note">{t('modelsExperience.settings.multiModelCountNoteImage')}</p>}

      <details className="model-settings-advanced" open>
        <summary>{t('modelsExperience.settings.advanced')}</summary>
        <SelectField label={t('modelsExperience.settings.outputFormat')} value={format} options={['PNG', 'JPEG', 'WebP']} onChange={(v) => onChange('format', v)} />
        <div className="model-settings-field model-settings-field-row">
          <label className="model-settings-field-label">{t('modelsExperience.settings.transparentBg')}</label>
          <Switch checked={transparent} onChange={(checked) => onChange('transparent', checked)} />
        </div>
        <div className="model-settings-field">
          <label className="model-settings-field-label">{t('modelsExperience.settings.negativePrompt')}</label>
          <Textarea rows={2} value={negativePrompt} onChange={(e) => onChange('negative_prompt', e.target.value)} />
        </div>
        <div className="model-settings-field">
          <label className="model-settings-field-label">Seed</label>
          <Input type="number" placeholder={t('modelsExperience.settings.random')} value={seed} onChange={(e) => onChange('seed', e.target.value)} />
        </div>
      </details>
    </div>
  )
}

/** 语音合成参数表单：音色/语速/格式 + 风格指令（PRD §7.9 逐字对齐） */
function TTSParamsForm({ values, onChange }: { values: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  const { t } = useTranslation()
  const voice = asString(values.voice, '晓辰')
  const speed = asNumber(values.speed, 1)
  const format = asString(values.audio_format, 'MP3')
  const voiceStyle = asString(values.voice_style)

  return (
    <div className="model-settings-form">
      <SelectField label={t('modelsExperience.settings.voice')} value={voice} options={['晓辰', '安然', 'Miles']} onChange={(v) => onChange('voice', v)} />
      <div className="model-settings-field">
        <div className="model-settings-field-label-row">
          <label className="model-settings-field-label">{t('modelsExperience.settings.speed')}</label>
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
      <SelectField label={t('modelsExperience.settings.audioFormat')} value={format} options={['MP3', 'WAV', 'M4A']} onChange={(v) => onChange('audio_format', v)} />

      <details className="model-settings-advanced" open>
        <summary>{t('modelsExperience.settings.advanced')}</summary>
        <div className="model-settings-field">
          <label className="model-settings-field-label">{t('modelsExperience.settings.voiceStyle')}</label>
          <Textarea
            rows={3}
            placeholder={t('modelsExperience.settings.voiceStylePlaceholder')}
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
  const { t } = useTranslation()
  const language = asString(values.language, '自动识别')
  const timestamps = asString(values.timestamps, '关闭')
  const format = asString(values.transcript_format, '纯文本')
  const terms = asString(values.terms)
  const contextPrompt = asString(values.context_prompt)

  return (
    <div className="model-settings-form">
      <SelectField label={t('modelsExperience.settings.recognitionLanguage')} value={language} options={['自动识别', '中文', '英文', '日文']} onChange={(v) => onChange('language', v)} />
      <SelectField label={t('modelsExperience.settings.timestamps')} value={timestamps} options={['关闭', '分段', '逐词']} onChange={(v) => onChange('timestamps', v)} />
      <SelectField label={t('modelsExperience.settings.outputFormat')} value={format} options={['纯文本', 'JSON', 'SRT']} onChange={(v) => onChange('transcript_format', v)} />

      <details className="model-settings-advanced" open>
        <summary>{t('modelsExperience.settings.advanced')}</summary>
        <div className="model-settings-field">
          <label className="model-settings-field-label">{t('modelsExperience.settings.terms')}</label>
          <Textarea rows={2} placeholder="ModelGo、API Gateway" value={terms} onChange={(e) => onChange('terms', e.target.value)} />
        </div>
        <div className="model-settings-field">
          <label className="model-settings-field-label">{t('modelsExperience.settings.contextPrompt')}</label>
          <Textarea rows={2} placeholder={t('modelsExperience.settings.contextPromptPlaceholder')} value={contextPrompt} onChange={(e) => onChange('context_prompt', e.target.value)} />
        </div>
      </details>
    </div>
  )
}

/** 文生视频/图生视频参数表单：生成方式(只读)+时长/比例/分辨率/数量 + 负面提示词/Seed/生成音频（PRD §7.9 逐字对齐） */
function VideoParamsForm({ task, values, onChange, multipleModels = false }: { task: ModelTaskType; values: Record<string, unknown>; onChange: (key: string, value: unknown) => void; multipleModels?: boolean }) {
  const { t } = useTranslation()
  const duration = asString(values.duration, '5')
  const aspectRatio = asString(values.aspect_ratio, '16:9')
  const resolution = asString(values.resolution, '720p')
  const count = multipleModels ? '1' : asString(values.count, '1')
  const negativePrompt = asString(values.negative_prompt)
  const seed = asString(values.seed)
  const generateAudio = asBool(values.generate_audio, false)

  return (
    <div className="model-settings-form">
      <div className="model-settings-field model-settings-field-row">
        <label className="model-settings-field-label">{t('modelsExperience.settings.generationMode')}</label>
        <span className="text-xs font-semibold text-mg-text-1">{experienceTaskLabel(task)}</span>
      </div>
      <SelectField label={t('modelsExperience.settings.videoDuration')} value={duration} options={['5', '8', '10']} suffix={t('modelsExperience.settings.seconds')} onChange={(v) => onChange('duration', v)} />
      <SelectField label={t('modelsExperience.settings.aspectRatio')} value={aspectRatio} options={['16:9', '9:16', '1:1']} onChange={(v) => onChange('aspect_ratio', v)} />
      <SelectField label={t('modelsExperience.settings.resolution')} value={resolution} options={['720p', '1080p']} onChange={(v) => onChange('resolution', v)} />
      <SelectField disabled={multipleModels} label={t('modelsExperience.settings.count')} value={count} options={multipleModels ? ['1'] : ['1', '2']} onChange={(v) => onChange('count', v)} />
      {multipleModels && <p className="model-settings-inline-note">{t('modelsExperience.settings.multiModelCountNoteVideo')}</p>}

      <details className="model-settings-advanced" open>
        <summary>{t('modelsExperience.settings.advanced')}</summary>
        <div className="model-settings-field">
          <label className="model-settings-field-label">{t('modelsExperience.settings.negativePrompt')}</label>
          <Textarea rows={2} value={negativePrompt} onChange={(e) => onChange('negative_prompt', e.target.value)} />
        </div>
        <div className="model-settings-field">
          <label className="model-settings-field-label">Seed</label>
          <Input type="number" placeholder={t('modelsExperience.settings.random')} value={seed} onChange={(e) => onChange('seed', e.target.value)} />
        </div>
        <div className="model-settings-field model-settings-field-row">
          <label className="model-settings-field-label">{t('modelsExperience.settings.generateAudio')}</label>
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
  multipleModels,
}: {
  task: ModelTaskType
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  multipleModels: boolean
}) {
  if (task === 'text_to_image' || task === 'image_to_image') return <ImageParamsForm values={values} onChange={onChange} multipleModels={multipleModels} />
  if (task === 'text_to_audio') return <TTSParamsForm values={values} onChange={onChange} />
  if (task === 'audio_to_text') return <TranscribeParamsForm values={values} onChange={onChange} />
  return <VideoParamsForm task={task} values={values} onChange={onChange} multipleModels={multipleModels} />
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
  multipleModels = false,
}: ModelSettingsModalProps) {
  const { t } = useTranslation()
  const isDialogue = DIALOGUE_TASKS.includes(task)

  /** 会话累计：原型 playground-session-summary 是 body 末尾的纵向条目（label 左 / 值右），
   *  不是横排 footer；重置按钮在顶部 head 里，不跟累计并排。 */
  const sessionSummary = (
    <div className="model-settings-summary">
      <h4 className="model-settings-summary-title">{t('modelsExperience.settings.sessionSummary')}</h4>
      <div className="model-settings-summary-line">
        <span>{t('modelsExperience.settings.requestCount')}</span>
        <strong>{sessionStats.requestCount}</strong>
      </div>
      {isDialogue && (
        <div className="model-settings-summary-line">
          <span>Tokens</span>
          <strong>{formatNumber(sessionStats.tokens)}</strong>
        </div>
      )}
      <div className="model-settings-summary-line">
        <span>{t('modelsExperience.settings.cost')}</span>
        <strong>{formatSessionSpend(sessionStats.cost)}</strong>
      </div>
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
            <span>{t('modelsExperience.settings.modalTitle', { name: modelName })}</span>
            <span className="text-xs font-normal text-mg-text-3">{vendor ?? 'ModelGo'} · {experienceTaskLabel(task)}</span>
          </span>
        </span>
      }
    >
      {/* 原型 playground-params-head：「参数配置」标题 + 右侧重置，位于表单之上（App.tsx:20271-20274） */}
      <div className="model-settings-head">
        <h3 className="model-settings-head-title">
          <LuSlidersHorizontal size={15} />
          {t('modelsExperience.settings.paramsConfig')}
        </h3>
        <Button variant="ghost" size="sm" icon={<LuRotateCcw size={13} />} onClick={onReset}>
          {t('modelsExperience.settings.reset')}
        </Button>
      </div>

      {/* 原型 playground-config-context：任务名 + 模型名的只读上下文块（App.tsx:20276-20279） */}
      <div className="model-settings-context">
        <span>{experienceTaskLabel(task)}</span>
        <strong>{modelName}</strong>
      </div>

      {isDialogue ? (
        <ChatParamsForm values={values} onChange={onChange} maxOutputTokens={maxOutputTokens} />
      ) : (
        <TaskParamsForm task={task} values={values} onChange={onChange} multipleModels={multipleModels} />
      )}

      {sessionSummary}
    </Modal>
  )
}

export default ModelSettingsModal
