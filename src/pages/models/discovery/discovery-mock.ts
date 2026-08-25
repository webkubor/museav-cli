/**
 * 模型发现页的 Mock 数据层（§8 开工顺序第 2 步）。
 *
 * 真源：PRD 原型 `modelgo_prd/src/ModelDiscoveryPage.tsx` 的 `discoveryConfigs`
 * / `agentDiscoveryConfig`。这里抄的是**字段结构与文案口径**，不是原型的视觉。
 *
 * 数据量刻意收窄：原型 mock 有上千行，本文件每个模态只留 6-8 个模型 —— 够覆盖
 * Top5、榜单分页、已接入/未接入两态、缺失值（`—`）这些 UI 状态就行。等第 6 步接
 * 真实接口时整个文件被 adapter 替换，不值得先把假数据铺满。
 *
 * 命名跟着 PRD 原型：模态叫「模态」不叫「类型」，未接入模型的 `id` 为 undefined
 * （详情不可达，见 §2.3 表格「暂未接入模型行」）。
 */

export type ModalityKey = 'agent' | 'text' | 'image' | 'video' | 'audio'
export type ScopeKey = 'all' | 'supported'
export type RankingMetric = 'overall' | 'value' | 'usage'

/** 一个模型在榜单/散点里的一行。id 缺失 = 平台未接入，不可进详情。 */
export interface DiscoveryModel {
  id?: string
  name: string
  provider: string
  supported: boolean
  score: string
  performance: string
  price: string
  usage: string
  release?: string
}

export interface DiscoveryConfig {
  label: string
  /** Agent 模态没有二级任务，其余模态有；空数组表示不渲染任务栏 */
  tasks: string[]
  scoreLabel: string
  summary: Array<{ label: string; model: string; value: string; unit: string }>
  yMetrics: string[]
  xMetrics: string[]
  presets: Array<{ label: string; y: number; x: number }>
  models: DiscoveryModel[]
  specialties: Array<{
    title: string
    description: string
    rows: Array<{ model: string; value: string }>
  }>
}

export const MODALITY_OPTIONS: Array<{ key: ModalityKey; label: string }> = [
  { key: 'agent', label: 'Agent' },
  { key: 'text', label: '文本' },
  { key: 'image', label: '图像' },
  { key: 'video', label: '视频' },
  { key: 'audio', label: '音频' },
]

export const RANKING_METRIC_OPTIONS: Array<{ key: RankingMetric; label: string }> = [
  { key: 'overall', label: '综合评价' },
  { key: 'value', label: '性价比' },
  { key: 'usage', label: '使用量' },
]

const TEXT: DiscoveryConfig = {
  label: '文本',
  tasks: ['文本对话', '代码生成'],
  scoreLabel: 'Intelligence Index',
  summary: [
    { label: '评分最高', model: 'Claude Opus 5', value: '63.1', unit: 'Index' },
    { label: '开源模型评分最高', model: 'DeepSeek V4 Flash', value: '55.9', unit: 'Index' },
    { label: '性价比最高', model: 'DeepSeek V4 Flash', value: '223.6', unit: 'Index / USD' },
    { label: '速度最快', model: 'GLM 5.2', value: '245', unit: 'Tokens / 秒' },
    { label: '近 7 日使用量最高', model: 'GLM 5.2', value: '8.2B', unit: 'Tokens' },
  ],
  yMetrics: ['Intelligence Index', 'Coding Index', 'Agentic Index'],
  xMetrics: ['输入价格', '输出价格', '输出速度', '首 Token 延迟', '近 7 日使用量'],
  presets: [
    { label: '质量 × 价格', y: 0, x: 0 },
    { label: '质量 × 速度', y: 0, x: 2 },
    { label: '质量 × 延迟', y: 0, x: 3 },
    { label: '质量 × 使用量', y: 0, x: 4 },
  ],
  models: [
    { name: 'Claude Opus 5', provider: 'Anthropic', supported: false, score: '63.1', performance: '188 tok/s', price: '$15/M', usage: '—', release: '2026-07' },
    { id: 'gpt-5.5', name: 'GPT-5.5', provider: 'OpenAI', supported: true, score: '61.7', performance: '182 tok/s', price: '$0.80/M', usage: '6.4B', release: '2026-06' },
    { id: 'glm-5.2', name: 'GLM 5.2', provider: 'Z.ai', supported: true, score: '58.9', performance: '245 tok/s', price: '$0.28/M', usage: '8.2B', release: '2026-08' },
    { id: 'qwen3.7-max', name: 'Qwen3.7 Max', provider: 'Qwen', supported: true, score: '56.8', performance: '216 tok/s', price: '$0.42/M', usage: '3.9B', release: '2026-08' },
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'DeepSeek', supported: true, score: '55.9', performance: '230 tok/s', price: '$0.25/M', usage: '5.6B', release: '2026-07' },
    { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', provider: 'Moonshot', supported: true, score: '54.2', performance: '198 tok/s', price: '$0.36/M', usage: '2.1B', release: '2026-08' },
    { name: 'Gemini 3.6 Flash', provider: 'Google', supported: false, score: '53.4', performance: '260 tok/s', price: '$0.19/M', usage: '—', release: '2026-08' },
    { id: 'minimax-m2.7', name: 'MiniMax M2.7', provider: 'MiniMax', supported: true, score: '51.8', performance: '204 tok/s', price: '$0.31/M', usage: '980M', release: '2026-06' },
  ],
  specialties: [
    {
      title: '综合评价',
      description: 'Intelligence Index 综合得分，越高越好',
      rows: [
        { model: 'Claude Opus 5', value: '63.1' },
        { model: 'GPT-5.5', value: '61.7' },
        { model: 'GLM 5.2', value: '58.9' },
        { model: 'Qwen3.7 Max', value: '56.8' },
        { model: 'DeepSeek V4 Flash', value: '55.9' },
      ],
    },
    {
      title: '单次任务成本',
      description: '按典型对话长度折算，含输入/输出/缓存三段',
      rows: [
        { model: 'DeepSeek V4 Flash', value: '$0.0031' },
        { model: 'GLM 5.2', value: '$0.0035' },
        { model: 'MiniMax M2.7', value: '$0.0039' },
        { model: 'Kimi K2.7 Code', value: '$0.0045' },
        { model: 'GPT-5.5', value: '$0.0100' },
      ],
    },
    {
      title: '输出速度',
      description: '每秒输出 Token 数，越高越好',
      rows: [
        { model: 'Gemini 3.6 Flash', value: '260 tok/s' },
        { model: 'GLM 5.2', value: '245 tok/s' },
        { model: 'DeepSeek V4 Flash', value: '230 tok/s' },
        { model: 'Qwen3.7 Max', value: '216 tok/s' },
        { model: 'MiniMax M2.7', value: '204 tok/s' },
      ],
    },
    {
      title: '平台使用量',
      description: '近 7 日 ModelGo 平台调用 Token 量',
      rows: [
        { model: 'GLM 5.2', value: '8.2B' },
        { model: 'GPT-5.5', value: '6.4B' },
        { model: 'DeepSeek V4 Flash', value: '5.6B' },
        { model: 'Qwen3.7 Max', value: '3.9B' },
        { model: 'Kimi K2.7 Code', value: '2.1B' },
      ],
    },
  ],
}

const IMAGE: DiscoveryConfig = {
  label: '图像',
  tasks: ['文生图', '图片编辑'],
  scoreLabel: 'Image Arena Score',
  summary: [
    { label: '评分最高', model: 'Seedream 5.0', value: '1186', unit: 'Elo' },
    { label: '性价比最高', model: 'Seedream 5.0 Lite', value: '32.4', unit: 'Elo / USD' },
    { label: '速度最快', model: 'GPT Image 2', value: '7.9', unit: '秒 / 张' },
    { label: '近 7 日使用量最高', model: 'Seedream 5.0', value: '590K', unit: '张' },
  ],
  yMetrics: ['Image Arena Score', '指令跟随'],
  xMetrics: ['单张价格', '生成耗时', '近 7 日使用量'],
  presets: [
    { label: '质量 × 价格', y: 0, x: 0 },
    { label: '质量 × 耗时', y: 0, x: 1 },
    { label: '质量 × 使用量', y: 0, x: 2 },
  ],
  models: [
    { id: 'seedream-5-0', name: 'Seedream 5.0', provider: 'ByteDance', supported: true, score: '1186', performance: '9.4 秒', price: '¥0.26/张', usage: '590K', release: '2026-08' },
    { id: 'gpt-image-2', name: 'GPT Image 2', provider: 'OpenAI', supported: true, score: '1172', performance: '7.9 秒', price: '$0.04/张', usage: '410K', release: '2026-07' },
    { name: 'Imagen 4', provider: 'Google', supported: false, score: '1165', performance: '8.6 秒', price: '$0.04/张', usage: '—', release: '2026-06' },
    { id: 'seedream-5-0-lite', name: 'Seedream 5.0 Lite', provider: 'ByteDance', supported: true, score: '1141', performance: '5.2 秒', price: '¥0.12/张', usage: '336K', release: '2026-08' },
    { id: 'flux-2-pro', name: 'FLUX.2 Pro', provider: 'Black Forest Labs', supported: true, score: '1128', performance: '11.3 秒', price: '$0.05/张', usage: '128K', release: '2026-05' },
    { name: 'Midjourney v8', provider: 'Midjourney', supported: false, score: '1119', performance: '—', price: '—', usage: '—', release: '2026-07' },
  ],
  specialties: [
    { title: '综合评价', description: 'Image Arena Elo 得分', rows: [{ model: 'Seedream 5.0', value: '1186' }, { model: 'GPT Image 2', value: '1172' }, { model: 'Imagen 4', value: '1165' }, { model: 'Seedream 5.0 Lite', value: '1141' }, { model: 'FLUX.2 Pro', value: '1128' }] },
    { title: '单张成本', description: '按标准分辨率单张出图折算', rows: [{ model: 'Seedream 5.0 Lite', value: '¥0.12' }, { model: 'Seedream 5.0', value: '¥0.26' }, { model: 'GPT Image 2', value: '¥0.29' }, { model: 'FLUX.2 Pro', value: '¥0.36' }] },
    { title: '生成耗时', description: '单张平均生成秒数，越低越好', rows: [{ model: 'Seedream 5.0 Lite', value: '5.2 秒' }, { model: 'GPT Image 2', value: '7.9 秒' }, { model: 'Imagen 4', value: '8.6 秒' }, { model: 'Seedream 5.0', value: '9.4 秒' }, { model: 'FLUX.2 Pro', value: '11.3 秒' }] },
    { title: '平台使用量', description: '近 7 日出图张数', rows: [{ model: 'Seedream 5.0', value: '590K' }, { model: 'GPT Image 2', value: '410K' }, { model: 'Seedream 5.0 Lite', value: '336K' }, { model: 'FLUX.2 Pro', value: '128K' }] },
  ],
}

const VIDEO: DiscoveryConfig = {
  label: '视频',
  tasks: ['文生视频', '图生视频'],
  scoreLabel: 'Video Arena Score',
  summary: [
    { label: '评分最高', model: 'Kling 3.0', value: '1129', unit: 'Elo' },
    { label: '性价比最高', model: 'Kling 3.0 Omni', value: '18.7', unit: 'Elo / USD' },
    { label: '速度最快', model: 'Seedance 2.0', value: '58', unit: '秒 / 5s 片段' },
    { label: '近 7 日使用量最高', model: 'Kling 3.0', value: '210K', unit: '片段' },
  ],
  yMetrics: ['Video Arena Score', '动态一致性'],
  xMetrics: ['每分钟价格', '生成耗时', '近 7 日使用量'],
  presets: [
    { label: '质量 × 价格', y: 0, x: 0 },
    { label: '质量 × 耗时', y: 0, x: 1 },
  ],
  models: [
    { id: 'kling-v3', name: 'Kling 3.0', provider: 'Kuaishou', supported: true, score: '1129', performance: '96 秒', price: '¥1.40/min', usage: '210K', release: '2026-08' },
    { id: 'seedance-2-0', name: 'Seedance 2.0', provider: 'ByteDance', supported: true, score: '1118', performance: '58 秒', price: '¥1.10/min', usage: '164K', release: '2026-07' },
    { name: 'Veo 4', provider: 'Google', supported: false, score: '1112', performance: '—', price: '—', usage: '—', release: '2026-08' },
    { id: 'kling-v3-omni', name: 'Kling 3.0 Omni', provider: 'Kuaishou', supported: true, score: '1096', performance: '112 秒', price: '¥0.90/min', usage: '87K', release: '2026-08' },
    { name: 'Sora 2', provider: 'OpenAI', supported: false, score: '1084', performance: '—', price: '—', usage: '—', release: '2026-05' },
  ],
  specialties: [
    { title: '综合评价', description: 'Video Arena Elo 得分', rows: [{ model: 'Kling 3.0', value: '1129' }, { model: 'Seedance 2.0', value: '1118' }, { model: 'Veo 4', value: '1112' }, { model: 'Kling 3.0 Omni', value: '1096' }] },
    { title: '每分钟成本', description: '按 1 分钟成片折算', rows: [{ model: 'Kling 3.0 Omni', value: '¥0.90' }, { model: 'Seedance 2.0', value: '¥1.10' }, { model: 'Kling 3.0', value: '¥1.40' }] },
    { title: '生成耗时', description: '5 秒片段平均生成秒数', rows: [{ model: 'Seedance 2.0', value: '58 秒' }, { model: 'Kling 3.0', value: '96 秒' }, { model: 'Kling 3.0 Omni', value: '112 秒' }] },
    { title: '平台使用量', description: '近 7 日生成片段数', rows: [{ model: 'Kling 3.0', value: '210K' }, { model: 'Seedance 2.0', value: '164K' }, { model: 'Kling 3.0 Omni', value: '87K' }] },
  ],
}

const AUDIO: DiscoveryConfig = {
  label: '音频',
  tasks: ['语音合成（TTS）', '语音识别（STT）'],
  scoreLabel: 'Audio MOS',
  summary: [
    { label: '评分最高', model: 'CosyVoice 3', value: '4.62', unit: 'MOS' },
    { label: '性价比最高', model: 'CosyVoice 3 Turbo', value: '58.2', unit: 'MOS / USD' },
    { label: '速度最快', model: 'CosyVoice 3 Turbo', value: '0.42', unit: '实时率' },
    { label: '近 7 日使用量最高', model: 'CosyVoice 3', value: '1.2M', unit: '字符' },
  ],
  yMetrics: ['Audio MOS', '音色相似度'],
  xMetrics: ['每万字符价格', '实时率', '近 7 日使用量'],
  presets: [
    { label: '质量 × 价格', y: 0, x: 0 },
    { label: '质量 × 实时率', y: 0, x: 1 },
  ],
  models: [
    { id: 'cosyvoice-3', name: 'CosyVoice 3', provider: 'FunAudioLLM', supported: true, score: '4.62', performance: '0.68 实时率', price: '¥1.20/万字', usage: '1.2M', release: '2026-07' },
    { id: 'cosyvoice-3-turbo', name: 'CosyVoice 3 Turbo', provider: 'FunAudioLLM', supported: true, score: '4.48', performance: '0.42 实时率', price: '¥0.60/万字', usage: '860K', release: '2026-08' },
    { name: 'ElevenLabs v4', provider: 'ElevenLabs', supported: false, score: '4.71', performance: '—', price: '—', usage: '—', release: '2026-06' },
    { id: 'minimax-speech-3', name: 'MiniMax Speech 3', provider: 'MiniMax', supported: true, score: '4.35', performance: '0.55 实时率', price: '¥0.90/万字', usage: '420K', release: '2026-08' },
  ],
  specialties: [
    { title: '综合评价', description: 'MOS 主观听感评分', rows: [{ model: 'ElevenLabs v4', value: '4.71' }, { model: 'CosyVoice 3', value: '4.62' }, { model: 'CosyVoice 3 Turbo', value: '4.48' }, { model: 'MiniMax Speech 3', value: '4.35' }] },
    { title: '每万字成本', description: '按标准音色合成折算', rows: [{ model: 'CosyVoice 3 Turbo', value: '¥0.60' }, { model: 'MiniMax Speech 3', value: '¥0.90' }, { model: 'CosyVoice 3', value: '¥1.20' }] },
    { title: '实时率', description: '合成时长 / 音频时长，越低越快', rows: [{ model: 'CosyVoice 3 Turbo', value: '0.42' }, { model: 'MiniMax Speech 3', value: '0.55' }, { model: 'CosyVoice 3', value: '0.68' }] },
    { title: '平台使用量', description: '近 7 日合成字符数', rows: [{ model: 'CosyVoice 3', value: '1.2M' }, { model: 'CosyVoice 3 Turbo', value: '860K' }, { model: 'MiniMax Speech 3', value: '420K' }] },
  ],
}

/** Agent 模态：没有二级任务（tasks 为空），额外有热门应用排行（见 AGENT_APP_RANKING） */
const AGENT: DiscoveryConfig = {
  label: 'Agent',
  tasks: [],
  scoreLabel: 'Agentic Index',
  summary: [
    { label: '评分最高', model: 'Claude Opus 5', value: '58.4', unit: 'Index' },
    { label: '性价比最高', model: 'GLM 5.2', value: '208.9', unit: 'Index / USD' },
    { label: '速度最快', model: 'GLM 5.2', value: '245', unit: 'Tokens / 秒' },
    { label: '近 7 日使用量最高', model: 'Claude Opus 5', value: '4.8B', unit: 'Tokens' },
  ],
  yMetrics: ['Agentic Index', '工具调用成功率'],
  xMetrics: ['输入价格', '输出价格', '输出速度', '近 7 日使用量'],
  presets: [
    { label: '能力 × 价格', y: 0, x: 0 },
    { label: '能力 × 速度', y: 0, x: 2 },
    { label: '能力 × 使用量', y: 0, x: 3 },
  ],
  models: [
    { name: 'Claude Opus 5', provider: 'Anthropic', supported: false, score: '58.4', performance: '188 tok/s', price: '$15/M', usage: '4.8B', release: '2026-07' },
    { id: 'gpt-5.5', name: 'GPT-5.5', provider: 'OpenAI', supported: true, score: '56.1', performance: '182 tok/s', price: '$0.80/M', usage: '3.2B', release: '2026-06' },
    { id: 'glm-5.2', name: 'GLM 5.2', provider: 'Z.ai', supported: true, score: '52.7', performance: '245 tok/s', price: '$0.28/M', usage: '2.6B', release: '2026-08' },
    { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', provider: 'Moonshot', supported: true, score: '50.3', performance: '198 tok/s', price: '$0.36/M', usage: '1.4B', release: '2026-08' },
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'DeepSeek', supported: true, score: '48.9', performance: '176 tok/s', price: '$0.55/M', usage: '910M', release: '2026-07' },
  ],
  specialties: [
    { title: '综合评价', description: 'Agentic Index 综合得分', rows: [{ model: 'Claude Opus 5', value: '58.4' }, { model: 'GPT-5.5', value: '56.1' }, { model: 'GLM 5.2', value: '52.7' }, { model: 'Kimi K2.7 Code', value: '50.3' }, { model: 'DeepSeek V4 Pro', value: '48.9' }] },
    { title: '单次任务成本', description: '按典型 Agent 工作流折算', rows: [{ model: 'GLM 5.2', value: '$0.021' }, { model: 'Kimi K2.7 Code', value: '$0.028' }, { model: 'DeepSeek V4 Pro', value: '$0.034' }, { model: 'GPT-5.5', value: '$0.061' }] },
    { title: '输出速度', description: '每秒输出 Token 数', rows: [{ model: 'GLM 5.2', value: '245 tok/s' }, { model: 'Kimi K2.7 Code', value: '198 tok/s' }, { model: 'Claude Opus 5', value: '188 tok/s' }, { model: 'GPT-5.5', value: '182 tok/s' }] },
    { title: '平台使用量', description: '近 7 日 Agent 场景调用量', rows: [{ model: 'Claude Opus 5', value: '4.8B' }, { model: 'GPT-5.5', value: '3.2B' }, { model: 'GLM 5.2', value: '2.6B' }, { model: 'Kimi K2.7 Code', value: '1.4B' }] },
  ],
}

export const DISCOVERY_CONFIGS: Record<ModalityKey, DiscoveryConfig> = {
  agent: AGENT,
  text: TEXT,
  image: IMAGE,
  video: VIDEO,
  audio: AUDIO,
}

/**
 * 热门 Agent 应用排行（仅 Agent 模态可见，§3.7）。
 * 三个周期各自是**独立的静态快照** —— 切周期不在前端跨周期重算名次。
 * 应用图标按 PRD 特例用应用名首字符，不用 OpenRouter Logo。
 */
export const AGENT_APP_RANKING: Record<'day' | 'week' | 'month', Array<{ name: string; usage: string }>> = {
  day: [
    { name: 'Claude Code', usage: '1.42B' }, { name: 'Cursor', usage: '980M' },
    { name: 'Cline', usage: '612M' }, { name: 'Codex CLI', usage: '458M' },
    { name: 'Roo Code', usage: '331M' }, { name: 'Windsurf', usage: '287M' },
    { name: 'Continue', usage: '196M' }, { name: 'Aider', usage: '154M' },
    { name: 'OpenHands', usage: '121M' }, { name: 'Zed', usage: '98M' },
    { name: 'Trae', usage: '86M' }, { name: 'Kilo Code', usage: '74M' },
    { name: 'Goose', usage: '61M' }, { name: 'Devin', usage: '52M' },
    { name: 'Bolt', usage: '44M' }, { name: 'v0', usage: '38M' },
    { name: 'Lovable', usage: '31M' }, { name: 'Replit Agent', usage: '26M' },
    { name: 'Amp', usage: '19M' }, { name: 'OpenCode', usage: '14M' },
  ],
  week: [
    { name: 'Claude Code', usage: '9.8B' }, { name: 'Cursor', usage: '6.7B' },
    { name: 'Cline', usage: '4.2B' }, { name: 'Codex CLI', usage: '3.1B' },
    { name: 'Windsurf', usage: '2.0B' }, { name: 'Roo Code', usage: '1.9B' },
    { name: 'Continue', usage: '1.3B' }, { name: 'Aider', usage: '1.1B' },
    { name: 'OpenHands', usage: '840M' }, { name: 'Zed', usage: '690M' },
    { name: 'Trae', usage: '602M' }, { name: 'Kilo Code', usage: '518M' },
    { name: 'Goose', usage: '427M' }, { name: 'Devin', usage: '364M' },
    { name: 'Bolt', usage: '308M' }, { name: 'v0', usage: '266M' },
    { name: 'Lovable', usage: '217M' }, { name: 'Replit Agent', usage: '182M' },
    { name: 'Amp', usage: '133M' }, { name: 'OpenCode', usage: '98M' },
  ],
  month: [
    { name: 'Claude Code', usage: '42.1B' }, { name: 'Cursor', usage: '28.9B' },
    { name: 'Cline', usage: '18.1B' }, { name: 'Codex CLI', usage: '13.4B' },
    { name: 'Windsurf', usage: '8.6B' }, { name: 'Roo Code', usage: '8.2B' },
    { name: 'Continue', usage: '5.6B' }, { name: 'Aider', usage: '4.7B' },
    { name: 'OpenHands', usage: '3.6B' }, { name: 'Zed', usage: '2.9B' },
    { name: 'Trae', usage: '2.6B' }, { name: 'Kilo Code', usage: '2.2B' },
    { name: 'Goose', usage: '1.8B' }, { name: 'Devin', usage: '1.5B' },
    { name: 'Bolt', usage: '1.3B' }, { name: 'v0', usage: '1.1B' },
    { name: 'Lovable', usage: '930M' }, { name: 'Replit Agent', usage: '780M' },
    { name: 'Amp', usage: '570M' }, { name: 'OpenCode', usage: '420M' },
  ],
}

/** 数据快照时间。真实接口接入后由后端下发（§5.2：mock 阶段不显示「实时」「最新」） */
export const DISCOVERY_SNAPSHOT_AT = '2026-08-25 10:28'

/** 按范围过滤：仅看已接入 = supported。范围切换不改模态与任务（§3.3） */
export function filterByScope(models: DiscoveryModel[], scope: ScopeKey): DiscoveryModel[] {
  return scope === 'supported' ? models.filter((m) => m.supported) : models
}

/** 榜单排序。usage 的 `—` 视为最小，排到末尾而不是当 0 混在中间。 */
export function sortByMetric(models: DiscoveryModel[], metric: RankingMetric): DiscoveryModel[] {
  const num = (raw: string) => {
    if (!raw || raw === '—') return Number.NEGATIVE_INFINITY
    const scale = raw.includes('B') ? 1e9 : raw.includes('M') ? 1e6 : raw.includes('K') ? 1e3 : 1
    const n = Number.parseFloat(raw.replace(/[^\d.]/g, ''))
    return Number.isFinite(n) ? n * scale : Number.NEGATIVE_INFINITY
  }
  const key = metric === 'usage' ? (m: DiscoveryModel) => num(m.usage) : (m: DiscoveryModel) => num(m.score)
  return [...models].sort((a, b) => key(b) - key(a))
}
