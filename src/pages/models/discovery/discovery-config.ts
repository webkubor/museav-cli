/** 模型发现页的翻译配置与配置类型。 */
import type { useTranslation } from 'react-i18next'

/** 配置表是模块级常量，里面调不了 hook —— 统一接收 t，由组件用 useMemo 构造 */
export type TFn = ReturnType<typeof useTranslation>['t']

export type ModalityKey = "agent" | "text" | "image" | "video" | "audio";

export type RankingMetric = "overall" | "value" | "price" | "usage";

export type AgentPopularityPeriod = "day" | "week" | "month";

/** 散点 X 轴的取数来源。samples/voices/performance 随 PRD 73cbb28 撤下，已无配置引用。 */
export type AnalysisMetricSource = "price" | "speed" | "latency" | "usage";

export type AnalysisAxisProfile = {
  yMetrics: string[];
  xMetrics: Array<{ label: string; unit: string; source: AnalysisMetricSource; lowerIsBetter: boolean; presetLabel: string }>;
  presets?: Array<{ label: string; y: number; x: number }>;
};

export type TaskMetricProfile = {
  qualityLabel: string;
  qualityBasis: string;
  qualityUnit: string;
  valueLabel: string;
  valueUnit: string;
  speedLabel: string;
  speedUnit: string;
  latencyLabel: string;
  latencyUnit: string;
  usageLabel: string;
  usageUnit: string;
  qualityLowerIsBetter?: boolean;
};

/**
 * 每种模态的展示配置。**只剩产品文案与轴配置** —— 模型列表、总览卡、专项榜的行数据
 * 原先都写在这里，现已全部改走接口（见 use-discovery-query）。
 */
/** 专项榜取哪个字段排序，由这个语义标识决定 —— 不能用标题文案匹配，那会随语言变。 */
export type SpecialtyKind = "value" | "tps" | "latency" | "usage" | "price" | "score";

export type DiscoveryConfig = {
  label: string;
  tasks: string[];
  scoreLabel: string;
  yMetrics: string[];
  xMetrics: string[];
  presets: Array<{ label: string; y: number; x: number }>;
  specialties: Array<{ kind: SpecialtyKind; title: string; description: string }>;
};

export const buildRankingMetricOptions = (t: TFn): Array<{ key: RankingMetric; label: string; specialtyIndex?: number }> => [
  { key: "overall", label: t("modelsDiscovery.metric.overall") },
  { key: "value", label: t("modelsDiscovery.metric.valueForMoney"), specialtyIndex: 0 },
  { key: "usage", label: t("modelsDiscovery.metric.usage"), specialtyIndex: 3 },
];

export const buildTaskMetricProfiles = (t: TFn): Record<ModalityKey, Record<string, TaskMetricProfile>> => ({
  agent: {
    Agent: { qualityLabel: "Agentic Index", qualityBasis: t("modelsDiscovery.basis.agent"), qualityUnit: "Index", valueLabel: t("modelsDiscovery.value.agentic"), valueUnit: "Index / USD", speedLabel: t("modelsDiscovery.metric.outputTps"), speedUnit: t("modelsDiscovery.unit.tokensPerSecond"), latencyLabel: t("modelsDiscovery.metric.firstToolCallP50"), latencyUnit: "ms", usageLabel: t("modelsDiscovery.metric.agentTasks7d"), usageUnit: t("modelsDiscovery.unit.successfulTasks") },
  },
  text: {
    文本对话: { qualityLabel: "Intelligence Index", qualityBasis: t("modelsDiscovery.basis.textChat"), qualityUnit: "Index", valueLabel: t("modelsDiscovery.value.intelligence"), valueUnit: "Index / USD", speedLabel: t("modelsDiscovery.metric.outputTps"), speedUnit: t("modelsDiscovery.unit.tokensPerSecond"), latencyLabel: "TTFT P50", latencyUnit: "ms", usageLabel: t("modelsDiscovery.metric.callTokens7d"), usageUnit: "Tokens" },
    代码生成: { qualityLabel: "Coding Index", qualityBasis: t("modelsDiscovery.basis.codeGen"), qualityUnit: "Index", valueLabel: t("modelsDiscovery.value.coding"), valueUnit: "Index / USD", speedLabel: t("modelsDiscovery.metric.outputTps"), speedUnit: t("modelsDiscovery.unit.tokensPerSecond"), latencyLabel: "TTFT P50", latencyUnit: "ms", usageLabel: t("modelsDiscovery.metric.codeTokens7d"), usageUnit: "Tokens" },
  },
  image: {
    文生图: { qualityLabel: t("modelsDiscovery.metric.eloScore"), qualityBasis: t("modelsDiscovery.basis.textToImage"), qualityUnit: "Elo", valueLabel: t("modelsDiscovery.value.eloPerKImage"), valueUnit: t("modelsDiscovery.unit.eloPerKImage"), speedLabel: t("modelsDiscovery.metric.apiPrice"), speedUnit: t("modelsDiscovery.unit.usdPerKImages"), latencyLabel: t("modelsDiscovery.metric.usage7d"), latencyUnit: t("modelsDiscovery.unit.successfulTasks"), usageLabel: t("modelsDiscovery.metric.t2iTasks7d"), usageUnit: t("modelsDiscovery.unit.successfulTasks") },
    图片编辑: { qualityLabel: t("modelsDiscovery.metric.eloScore"), qualityBasis: t("modelsDiscovery.basis.imageEdit"), qualityUnit: "Elo", valueLabel: t("modelsDiscovery.value.eloPerKImage"), valueUnit: t("modelsDiscovery.unit.eloPerKImage"), speedLabel: t("modelsDiscovery.metric.apiPrice"), speedUnit: t("modelsDiscovery.unit.usdPerKImages"), latencyLabel: t("modelsDiscovery.metric.usage7d"), latencyUnit: t("modelsDiscovery.unit.successfulTasks"), usageLabel: t("modelsDiscovery.metric.editTasks7d"), usageUnit: t("modelsDiscovery.unit.successfulTasks") },
  },
  video: {
    文生视频: { qualityLabel: t("modelsDiscovery.metric.eloScore"), qualityBasis: t("modelsDiscovery.basis.textToVideo"), qualityUnit: "Elo", valueLabel: t("modelsDiscovery.value.eloPerMinute"), valueUnit: "Elo / ($/min)", speedLabel: t("modelsDiscovery.metric.apiPrice"), speedUnit: t("modelsDiscovery.unit.usdPerMinute"), latencyLabel: t("modelsDiscovery.metric.usage7d"), latencyUnit: t("modelsDiscovery.unit.successfulTasks"), usageLabel: t("modelsDiscovery.metric.t2vTasks7d"), usageUnit: t("modelsDiscovery.unit.successfulTasks") },
    图生视频: { qualityLabel: t("modelsDiscovery.metric.eloScore"), qualityBasis: t("modelsDiscovery.basis.imageToVideo"), qualityUnit: "Elo", valueLabel: t("modelsDiscovery.value.eloPerMinute"), valueUnit: "Elo / ($/min)", speedLabel: t("modelsDiscovery.metric.apiPrice"), speedUnit: t("modelsDiscovery.unit.usdPerMinute"), latencyLabel: t("modelsDiscovery.metric.usage7d"), latencyUnit: t("modelsDiscovery.unit.successfulTasks"), usageLabel: t("modelsDiscovery.metric.i2vTasks7d"), usageUnit: t("modelsDiscovery.unit.successfulTasks") },
  },
  audio: {
    "语音合成（TTS）": { qualityLabel: t("modelsDiscovery.metric.voiceQualityElo"), qualityBasis: t("modelsDiscovery.basis.tts"), qualityUnit: "Elo", valueLabel: t("modelsDiscovery.summary.valueVoicePerApi"), valueUnit: "Elo / USD", speedLabel: t("modelsDiscovery.metric.apiPrice"), speedUnit: t("modelsDiscovery.unit.usdPerMChars"), latencyLabel: t("modelsDiscovery.metric.usage7d"), latencyUnit: t("modelsDiscovery.unit.characters"), usageLabel: t("modelsDiscovery.metric.ttsChars7d"), usageUnit: t("modelsDiscovery.unit.characters") },
    "语音识别（STT）": { qualityLabel: "AA-WER", qualityBasis: t("modelsDiscovery.basis.stt"), qualityUnit: "%", valueLabel: t("modelsDiscovery.value.aaWer"), valueUnit: "% / USD", speedLabel: t("modelsDiscovery.metric.apiPrice"), speedUnit: t("modelsDiscovery.unit.usdPerKMinutes"), latencyLabel: t("modelsDiscovery.metric.usage7d"), latencyUnit: t("modelsDiscovery.unit.audioMinutes"), usageLabel: t("modelsDiscovery.metric.sttMinutes7d"), usageUnit: t("modelsDiscovery.unit.audioMinutes"), qualityLowerIsBetter: true },
  },
})

export const buildSummaryTooltipCopy = (t: TFn): Record<ModalityKey, Record<string, string[]>> => ({
  agent: {
    Agent: [t("modelsDiscovery.tooltip.agentQuality"), t("modelsDiscovery.tooltip.agentOpen"), t("modelsDiscovery.tooltip.agentValue"), t("modelsDiscovery.tooltip.tokensPerSec"), t("modelsDiscovery.tooltip.agentUsage")],
  },
  text: {
    文本对话: [t("modelsDiscovery.tooltip.textQuality"), t("modelsDiscovery.tooltip.textOpen"), t("modelsDiscovery.tooltip.textValue"), t("modelsDiscovery.tooltip.tokensPerSec"), t("modelsDiscovery.tooltip.textUsage")],
    代码生成: [t("modelsDiscovery.tooltip.codeQuality"), t("modelsDiscovery.tooltip.codeOpen"), t("modelsDiscovery.tooltip.codeValue"), t("modelsDiscovery.tooltip.tokensPerSec"), t("modelsDiscovery.tooltip.codeUsage")],
  },
  image: {
    文生图: [t("modelsDiscovery.tooltip.t2iQuality"), t("modelsDiscovery.tooltip.t2iOpen"), t("modelsDiscovery.tooltip.t2iValue"), t("modelsDiscovery.tooltip.perKImagePrice"), t("modelsDiscovery.tooltip.t2iUsage")],
    图片编辑: [t("modelsDiscovery.tooltip.editQuality"), t("modelsDiscovery.tooltip.editOpen"), t("modelsDiscovery.tooltip.editValue"), t("modelsDiscovery.tooltip.perKImagePrice"), t("modelsDiscovery.tooltip.editUsage")],
  },
  video: {
    文生视频: [t("modelsDiscovery.tooltip.t2vQuality"), t("modelsDiscovery.tooltip.t2vOpen"), t("modelsDiscovery.tooltip.t2vValue"), t("modelsDiscovery.tooltip.perMinPrice"), t("modelsDiscovery.tooltip.t2vUsage")],
    图生视频: [t("modelsDiscovery.tooltip.i2vQuality"), t("modelsDiscovery.tooltip.i2vOpen"), t("modelsDiscovery.tooltip.t2vValue"), t("modelsDiscovery.tooltip.perMinPrice"), t("modelsDiscovery.tooltip.i2vUsage")],
  },
  audio: {
    "语音合成（TTS）": [t("modelsDiscovery.tooltip.ttsQuality"), t("modelsDiscovery.tooltip.ttsValue"), t("modelsDiscovery.tooltip.perMCharPrice"), t("modelsDiscovery.tooltip.ttsUsage")],
    "语音识别（STT）": [t("modelsDiscovery.tooltip.sttQuality"), t("modelsDiscovery.tooltip.sttPrice"), t("modelsDiscovery.tooltip.sttUsage")],
  },
})

export const buildSourceConstrainedAnalysisProfiles = (t: TFn): Partial<Record<ModalityKey, Record<string, AnalysisAxisProfile>>> => ({
  image: {
    文生图: {
      yMetrics: [t("modelsDiscovery.metric.eloScore"), t("modelsDiscovery.metric.apiPrice")],
      xMetrics: [
        { label: t("modelsDiscovery.metric.apiPrice"), unit: t("modelsDiscovery.unit.usdPerKImages"), source: "price", lowerIsBetter: true, presetLabel: t("modelsDiscovery.preset.qualityApiPrice") },
        { label: t("modelsDiscovery.metric.usage7d"), unit: t("modelsDiscovery.unit.successfulTasks"), source: "usage", lowerIsBetter: false, presetLabel: t("modelsDiscovery.preset.qualityUsage") },
      ],
      presets: [
        { label: t("modelsDiscovery.preset.qualityApiPrice"), y: 0, x: 0 },
        { label: t("modelsDiscovery.preset.qualityUsage"), y: 0, x: 1 },
        { label: t("modelsDiscovery.preset.apiPriceUsage"), y: 1, x: 1 },
      ],
    },
    图片编辑: {
      yMetrics: [t("modelsDiscovery.metric.eloScore"), t("modelsDiscovery.metric.apiPrice")],
      xMetrics: [
        { label: t("modelsDiscovery.metric.apiPrice"), unit: t("modelsDiscovery.unit.usdPerKImages"), source: "price", lowerIsBetter: true, presetLabel: t("modelsDiscovery.preset.qualityApiPrice") },
        { label: t("modelsDiscovery.metric.usage7d"), unit: t("modelsDiscovery.unit.successfulTasks"), source: "usage", lowerIsBetter: false, presetLabel: t("modelsDiscovery.preset.qualityUsage") },
      ],
      presets: [
        { label: t("modelsDiscovery.preset.qualityApiPrice"), y: 0, x: 0 },
        { label: t("modelsDiscovery.preset.qualityUsage"), y: 0, x: 1 },
        { label: t("modelsDiscovery.preset.apiPriceUsage"), y: 1, x: 1 },
      ],
    },
  },
  video: {
    文生视频: {
      yMetrics: [t("modelsDiscovery.metric.eloScore"), t("modelsDiscovery.metric.apiPrice")],
      xMetrics: [
        { label: t("modelsDiscovery.metric.apiPrice"), unit: t("modelsDiscovery.unit.usdPerMinute"), source: "price", lowerIsBetter: true, presetLabel: t("modelsDiscovery.preset.qualityApiPrice") },
        { label: t("modelsDiscovery.metric.usage7d"), unit: t("modelsDiscovery.unit.successfulTasks"), source: "usage", lowerIsBetter: false, presetLabel: t("modelsDiscovery.preset.qualityUsage") },
      ],
      presets: [
        { label: t("modelsDiscovery.preset.qualityApiPrice"), y: 0, x: 0 },
        { label: t("modelsDiscovery.preset.qualityUsage"), y: 0, x: 1 },
        { label: t("modelsDiscovery.preset.apiPriceUsage"), y: 1, x: 1 },
      ],
    },
    图生视频: {
      yMetrics: [t("modelsDiscovery.metric.eloScore"), t("modelsDiscovery.metric.apiPrice")],
      xMetrics: [
        { label: t("modelsDiscovery.metric.apiPrice"), unit: t("modelsDiscovery.unit.usdPerMinute"), source: "price", lowerIsBetter: true, presetLabel: t("modelsDiscovery.preset.qualityApiPrice") },
        { label: t("modelsDiscovery.metric.usage7d"), unit: t("modelsDiscovery.unit.successfulTasks"), source: "usage", lowerIsBetter: false, presetLabel: t("modelsDiscovery.preset.qualityUsage") },
      ],
      presets: [
        { label: t("modelsDiscovery.preset.qualityApiPrice"), y: 0, x: 0 },
        { label: t("modelsDiscovery.preset.qualityUsage"), y: 0, x: 1 },
        { label: t("modelsDiscovery.preset.apiPriceUsage"), y: 1, x: 1 },
      ],
    },
  },
  audio: {
    "语音合成（TTS）": {
      yMetrics: [t("modelsDiscovery.metric.voiceQualityElo"), t("modelsDiscovery.metric.apiPrice")],
      xMetrics: [
        { label: t("modelsDiscovery.metric.apiPrice"), unit: t("modelsDiscovery.unit.usdPerMChars"), source: "price", lowerIsBetter: true, presetLabel: t("modelsDiscovery.preset.qualityApiPrice") },
        { label: t("modelsDiscovery.metric.usage7d"), unit: t("modelsDiscovery.unit.characters"), source: "usage", lowerIsBetter: false, presetLabel: t("modelsDiscovery.preset.qualityUsage") },
      ],
      presets: [
        { label: t("modelsDiscovery.preset.qualityApiPrice"), y: 0, x: 0 },
        { label: t("modelsDiscovery.preset.qualityUsage"), y: 0, x: 1 },
        { label: t("modelsDiscovery.preset.apiPriceUsage"), y: 1, x: 1 },
      ],
    },
  },
})

export const buildDiscoveryConfigs = (t: TFn): Record<Exclude<ModalityKey, "agent">, DiscoveryConfig> => ({
  text: {
    label: t("modelsDiscovery.modality.text"),
    tasks: ["文本对话", "代码生成"],
    scoreLabel: "Intelligence Index",
    yMetrics: ["Intelligence Index", "Coding Index", "Agentic Index"],
    xMetrics: [t("modelsDiscovery.metric.inputPrice"), t("modelsDiscovery.metric.outputPrice"), t("modelsDiscovery.metric.outputTps"), t("modelsDiscovery.metric.ttft"), t("modelsDiscovery.metric.usage7d")],
    presets: [
      { label: t("modelsDiscovery.preset.qualityPrice"), y: 0, x: 0 },
      { label: t("modelsDiscovery.preset.qualityTps"), y: 0, x: 2 },
      { label: t("modelsDiscovery.preset.qualityLatency"), y: 0, x: 3 },
      { label: t("modelsDiscovery.preset.contextPrice"), y: 6, x: 0 },
      { label: t("modelsDiscovery.preset.qualityUsage"), y: 0, x: 4 },
    ],
    specialties: [
      { kind: "value", title: t("modelsDiscovery.metric.valueLeader"), description: t("modelsDiscovery.summary.valueDesc") },
      { kind: "tps", title: t("modelsDiscovery.metric.outputTps"), description: t("modelsDiscovery.summary.tpsDescUnit") },
      { kind: "latency", title: t("modelsDiscovery.metric.ttftLeader"), description: t("modelsDiscovery.summary.ttftP50Unit") },
      { kind: "usage", title: t("modelsDiscovery.metric.popularity7d"), description: t("modelsDiscovery.summary.tokensDesc") },
    ],
  },
  image: {
    label: t("modelsDiscovery.modality.image"),
    tasks: ["文生图", "图片编辑"],
    scoreLabel: t("modelsDiscovery.metric.eloScore"),
    yMetrics: [t("modelsDiscovery.metric.eloScore")],
    xMetrics: [t("modelsDiscovery.metric.unitImagePrice"), t("modelsDiscovery.metric.usage7d")],
    presets: [
      { label: t("modelsDiscovery.preset.qualityPrice"), y: 0, x: 0 },
      { label: t("modelsDiscovery.preset.qualityUsage"), y: 0, x: 1 },
      { label: t("modelsDiscovery.preset.apiPriceUsage"), y: 1, x: 1 },
    ],
    specialties: [
      { kind: "value", title: t("modelsDiscovery.metric.valueLeader"), description: t("modelsDiscovery.summary.valueEloPerImage") },
      { kind: "price", title: t("modelsDiscovery.metric.apiPrice"), description: t("modelsDiscovery.summary.perKImageUnit") },
      { kind: "usage", title: t("modelsDiscovery.metric.popularity7d"), description: t("modelsDiscovery.summary.tasksDesc") },
    ],
  },
  video: {
    label: t("modelsDiscovery.modality.video"),
    tasks: ["文生视频", "图生视频"],
    scoreLabel: t("modelsDiscovery.metric.eloScore"),
    yMetrics: [t("modelsDiscovery.metric.eloScore"), t("modelsDiscovery.metric.t2vCapability"), t("modelsDiscovery.metric.i2vCapability"), t("modelsDiscovery.metric.motionConsistency")],
    xMetrics: [t("modelsDiscovery.metric.perMinutePrice"), t("modelsDiscovery.metric.usage7d")],
    presets: [{ label: t("modelsDiscovery.preset.qualityPrice"), y: 0, x: 0 }, { label: t("modelsDiscovery.preset.qualityUsage"), y: 0, x: 1 }, { label: t("modelsDiscovery.preset.apiPriceUsage"), y: 1, x: 1 }],
    specialties: [
      { kind: "value", title: t("modelsDiscovery.metric.valueLeader"), description: t("modelsDiscovery.summary.valueEloPerMin") },
      { kind: "price", title: t("modelsDiscovery.metric.apiPrice"), description: t("modelsDiscovery.summary.perMinVideoUnit") },
      { kind: "usage", title: t("modelsDiscovery.metric.popularity7d"), description: t("modelsDiscovery.summary.tasksDesc") },
    ],
  },
  audio: {
    label: t("modelsDiscovery.modality.audio"),
    tasks: ["语音合成（TTS）", "语音识别（STT）"],
    scoreLabel: t("modelsDiscovery.metric.eloScore"),
    yMetrics: [t("modelsDiscovery.metric.eloScore"), t("modelsDiscovery.metric.naturalnessAccuracy"), t("modelsDiscovery.metric.stability")],
    xMetrics: [t("modelsDiscovery.metric.publicPrice"), t("modelsDiscovery.metric.usage7d")],
    presets: [{ label: t("modelsDiscovery.preset.qualityPrice"), y: 0, x: 0 }, { label: t("modelsDiscovery.preset.qualityUsage"), y: 0, x: 1 }, { label: t("modelsDiscovery.preset.apiPriceUsage"), y: 1, x: 1 }],
    specialties: [
      { kind: "value", title: t("modelsDiscovery.metric.valueLeader"), description: t("modelsDiscovery.summary.valueScorePerPrice") },
      { kind: "price", title: t("modelsDiscovery.metric.apiPrice"), description: t("modelsDiscovery.summary.perMCharPriceUnit") },
      { kind: "usage", title: t("modelsDiscovery.metric.popularity7d"), description: t("modelsDiscovery.summary.requestsDesc") },
    ],
  },
})

export const buildAudioTaskConfigs = (t: TFn): Record<string, Pick<DiscoveryConfig, "specialties">> => ({
  "语音合成（TTS）": {
    specialties: [
      { kind: "value", title: t("modelsDiscovery.metric.valueForMoney"), description: t("modelsDiscovery.summary.valueVoicePerApi") },
      { kind: "price", title: t("modelsDiscovery.metric.apiPrice"), description: t("modelsDiscovery.summary.perMCharPriceUnit") },
      { kind: "usage", title: t("modelsDiscovery.metric.usage7d"), description: t("modelsDiscovery.summary.ttsCharsDesc") },
    ],
  },
  "语音识别（STT）": {
    specialties: [
      { kind: "price", title: t("modelsDiscovery.metric.apiPrice"), description: t("modelsDiscovery.summary.perKMinuteUnit") },
      { kind: "usage", title: t("modelsDiscovery.metric.usage7d"), description: t("modelsDiscovery.summary.sttMinutesDesc") },
    ],
  },
})

export const buildAgentDiscoveryConfig = (t: TFn): DiscoveryConfig => ({
  ...buildDiscoveryConfigs(t).text,
  label: "Agent",
  tasks: ["Agent"],
  scoreLabel: "Agentic Index",
  yMetrics: ["Agentic Index"],
})

export const buildAgentPopularityPeriods = (t: TFn): Array<{ key: AgentPopularityPeriod; label: string }> => [
  { key: "day", label: t("modelsDiscovery.range.day") },
  { key: "week", label: t("modelsDiscovery.range.week") },
  { key: "month", label: t("modelsDiscovery.range.month") },
];
