/**
 * 模型发现页 —— 移植自 PRD 原型 modelgo_prd/src/ModelDiscoveryPage.tsx。
 *
 * ── 同步规则（2026-08-27 起）────────────────────────────────────
 * 早先需求方要求本页 UI 与交互 1:1 复刻原型，该例外已作废。现在按常规分工：
 *   · UI / 布局 / 排版 / 图标 → 控制台现状（图标走 ModelIcon，见下方 DiscoveryModelIcon）
 *   · 指标口径 / 文案 / 交互逻辑 / 数据结构 → PRD 原型
 * 所以再同步时**不要整文件重新移植**，只把 PRD 的配置与文案逐处搬过来。
 * 做法：在 modelgo_prd 里 `git diff <上次基线>..HEAD -- src/ModelDiscoveryPage.tsx`
 * 生成 patch，改掉路径后 `git apply --reject`；含图标的 hunk 会被 reject，手工改。
 *
 * ── 同步基线 ──────────────────────────────────────────────────
 * 已同步到 PRD commit 73cbb28（2026-08-26）。该批把不可靠的速度指标全部撤下：
 * 文本/Agent 的速度统一为「输出 TPS」，图像/视频/音频改用「API 价格 + 使用量」，
 * 多维分析去掉冗余的横纵轴下拉。依据 modelgo_prd/docs/superpowers/plans/
 * 2026-08-26-discovery-without-speed-metrics.md。
 *
 * 验收：把 modelgo_prd/scripts/assert-model-discovery.mjs 的三个路径常量改到本仓
 * 后可直接跑。其中 2 条会失败且属预期 —— 断言写死了原型的 providerMarks 首字母
 * 色表与 lucide 图标名，而本仓走 ModelIcon 与 react-icons/lu，功能等价。
 */
import {
  LuArrowUpRight,
  LuChartColumn,
  LuCheck,
  LuCheckCheck,
  LuChevronDown,
  LuListFilter,
  LuRotateCcw,
  LuSearch,
  LuSlidersHorizontal,
  LuTrendingUp,
  LuX,
} from 'react-icons/lu'
import { useCallback, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { brandColor } from '@model-go/icons'
import { useActiveTheme } from '@/hooks/use-active-theme'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { InfoTip } from '@/components/ui/InfoTip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { SelectContent, SelectItem, SelectRoot, SelectTrigger, SelectValue } from '@/components/ui/Select'
import { Popover } from '@/components/ui/Popover'
import { Pagination } from '@/components/ui/Pagination'
import {
  useDiscoveryAnalysis,
  useDiscoveryModelOptions,
  useDiscoveryQuery,
  useDiscoveryTable,
  useDiscoveryTrends,
} from './use-discovery-query'
import { rankBarWidth, specialtyRows } from './discovery-data'
import {
  AnalysisScatterChart,
  DiscoveryAgentIcon,
  DiscoveryModelIcon,
  SpecialtyBarChart,
  TrendBarChart,
  type AnalysisScatterPoint,
  type TrendChartPoint,
} from './discovery-charts'

type ModalityKey = "agent" | "text" | "image" | "video" | "audio";
type RankingMetric = "overall" | "value" | "price" | "usage";
type AgentPopularityPeriod = "day" | "week" | "month";
/** 散点 X 轴的取数来源。samples/voices/performance 随 PRD 73cbb28 撤下，已无配置引用。 */
type AnalysisMetricSource = "price" | "speed" | "latency" | "usage";

type AgentApplication = {
  id: string;
  name: string;
  description: string;
  tokenUsage: number;
};
type AnalysisAxisProfile = {
  yMetrics: string[];
  xMetrics: Array<{ label: string; unit: string; source: AnalysisMetricSource; lowerIsBetter: boolean; presetLabel: string }>;
  presets?: Array<{ label: string; y: number; x: number }>;
};
type TaskMetricProfile = {
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

type DiscoveryModel = {
  id?: string;
  name: string;
  provider: string;
  supported: boolean;
  score: string;
  performance: string;
  price: string;
  usage: string;
  samples?: string;
  voices?: string;
  release?: string;
};

/**
 * 每种模态的展示配置。**只剩产品文案与轴配置** —— 模型列表、总览卡、专项榜的行数据
 * 原先都写在这里，现已全部改走接口（见 use-discovery-query）。
 */
type DiscoveryConfig = {
  label: string;
  tasks: string[];
  scoreLabel: string;
  yMetrics: string[];
  xMetrics: string[];
  presets: Array<{ label: string; y: number; x: number }>;
  specialties: Array<{ title: string; description: string }>;
};

/**
 * 国产厂商名单，用来把「国产未接入」与「海外（ModelGo.ai 已接入）」分开——接口的
 * integration_status 只有 MODELGO / MODELGO_AI 两态，分不出这一层。
 * 比对前统一小写并去掉空格与标点：接口 creator_name 的写法与展示名不一致
 * （"Z AI" vs "Z.ai"、"ByteDance Seed"、"KlingAI"），2026-09-03 test 环境实测
 * GLM-5.3 / Kimi K3 这些 MODELGO 模型因此被标成「ModelGo.ai 已接入」并外链到 modelgo.ai。
 */
const domesticModelProviders = new Set(
  [
    "Alibaba",
    "Alibaba-ATH",
    "ByteDance",
    "ByteDance Seed",
    "DeepSeek",
    "Doubao",
    "FunAudioLLM",
    "Kimi",
    "Kling",
    "KlingAI",
    "Kuaishou",
    "MiniMax",
    "Moonshot",
    "PixVerse",
    "Qwen",
    "StepFun",
    "Tencent",
    "Wan",
    "Z AI",
    "Z.ai",
  ].map(normalizeProviderName),
);

function normalizeProviderName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** 只依赖 provider / supported，故对散点用的轻量模型对象同样适用。 */
type AccessShape = Pick<DiscoveryModel, "provider" | "supported">;

/** integration_status 为 MODELGO（supported）的模型必然是本平台已接入的国产模型，不看名单。 */
function isDomesticModel(model: AccessShape) {
  return model.supported || domesticModelProviders.has(normalizeProviderName(model.provider));
}

function isModelConnected(model: AccessShape) {
  return isDomesticModel(model) ? model.supported : true;
}

function modelAccessLabel(model: DiscoveryModel) {
  if (!isDomesticModel(model)) return "ModelGo.ai 已接入";
  return model.supported ? "ModelGo 已接入" : "暂未接入 ModelGo";
}

function modelGoAiModelUrl(model: Pick<DiscoveryModel, "name">) {
  const query = new URLSearchParams({ search: model.name });
  return `https://console.modelgo.ai/models?${query.toString()}`;
}

const modalityOptions: Array<{ key: ModalityKey; label: string }> = [
  { key: "agent", label: "Agent" },
  { key: "text", label: "文本" },
  { key: "image", label: "图像" },
  { key: "video", label: "视频" },
  { key: "audio", label: "音频" },
];

const rankingMetricOptions: Array<{ key: RankingMetric; label: string; specialtyIndex?: number }> = [
  { key: "overall", label: "综合评价" },
  { key: "value", label: "性价比", specialtyIndex: 0 },
  { key: "usage", label: "使用量", specialtyIndex: 3 },
];

const taskMetricProfiles: Record<ModalityKey, Record<string, TaskMetricProfile>> = {
  agent: {
    Agent: { qualityLabel: "Agentic Index", qualityBasis: "工具调用、规划与端到端任务完成能力", qualityUnit: "Index", valueLabel: "Agentic Index / 单次任务成本", valueUnit: "Index / USD", speedLabel: "输出 TPS", speedUnit: "Tokens / 秒", latencyLabel: "首个工具调用时延 P50", latencyUnit: "ms", usageLabel: "近 7 日 Agent 任务量", usageUnit: "成功任务" },
  },
  text: {
    文本对话: { qualityLabel: "Intelligence Index", qualityBasis: "通用知识、推理与问题求解能力", qualityUnit: "Index", valueLabel: "Intelligence Index / 单次任务成本", valueUnit: "Index / USD", speedLabel: "输出 TPS", speedUnit: "Tokens / 秒", latencyLabel: "TTFT P50", latencyUnit: "ms", usageLabel: "近 7 日调用 Tokens", usageUnit: "Tokens" },
    代码生成: { qualityLabel: "Coding Index", qualityBasis: "代码生成、修复与工程任务能力", qualityUnit: "Index", valueLabel: "Coding Index / 单次任务成本", valueUnit: "Index / USD", speedLabel: "输出 TPS", speedUnit: "Tokens / 秒", latencyLabel: "TTFT P50", latencyUnit: "ms", usageLabel: "近 7 日代码调用 Tokens", usageUnit: "Tokens" },
  },
  image: {
    文生图: { qualityLabel: "Elo 评分", qualityBasis: "提示词遵循与生成质量", qualityUnit: "Elo", valueLabel: "Elo 评分 / 每 1K 张标准图像价格", valueUnit: "Elo / ($/1K 张)", speedLabel: "API 价格", speedUnit: "USD / 1K 张", latencyLabel: "近 7 日使用量", latencyUnit: "成功任务", usageLabel: "近 7 日文生图任务量", usageUnit: "成功任务" },
    图片编辑: { qualityLabel: "Elo 评分", qualityBasis: "编辑遵循与视觉一致性", qualityUnit: "Elo", valueLabel: "Elo 评分 / 每 1K 张标准图像价格", valueUnit: "Elo / ($/1K 张)", speedLabel: "API 价格", speedUnit: "USD / 1K 张", latencyLabel: "近 7 日使用量", latencyUnit: "成功任务", usageLabel: "近 7 日图片编辑任务量", usageUnit: "成功任务" },
  },
  video: {
    文生视频: { qualityLabel: "Elo 评分", qualityBasis: "Artificial Analysis 文生视频偏好评测", qualityUnit: "Elo", valueLabel: "Elo 评分 / API 每分钟价格", valueUnit: "Elo / ($/min)", speedLabel: "API 价格", speedUnit: "USD / 分钟", latencyLabel: "近 7 日使用量", latencyUnit: "成功任务", usageLabel: "近 7 日文生视频任务量", usageUnit: "成功任务" },
    图生视频: { qualityLabel: "Elo 评分", qualityBasis: "Artificial Analysis 图生视频偏好评测", qualityUnit: "Elo", valueLabel: "Elo 评分 / API 每分钟价格", valueUnit: "Elo / ($/min)", speedLabel: "API 价格", speedUnit: "USD / 分钟", latencyLabel: "近 7 日使用量", latencyUnit: "成功任务", usageLabel: "近 7 日图生视频任务量", usageUnit: "成功任务" },
  },
  audio: {
    "语音合成（TTS）": { qualityLabel: "语音质量 Elo", qualityBasis: "语音质量与偏好评测", qualityUnit: "Elo", valueLabel: "语音质量 Elo / API 价格", valueUnit: "Elo / USD", speedLabel: "API 价格", speedUnit: "USD / 1M 字符", latencyLabel: "近 7 日使用量", latencyUnit: "字符", usageLabel: "近 7 日语音合成量", usageUnit: "字符" },
    "语音识别（STT）": { qualityLabel: "AA-WER", qualityBasis: "词错误率，数值越低识别越准确", qualityUnit: "%", valueLabel: "AA-WER / API 价格", valueUnit: "% / USD", speedLabel: "API 价格", speedUnit: "USD / 1K 分钟", latencyLabel: "近 7 日使用量", latencyUnit: "音频分钟", usageLabel: "近 7 日识别音频量", usageUnit: "音频分钟", qualityLowerIsBetter: true },
  },
};

const summaryTooltipCopy: Record<ModalityKey, Record<string, string[]>> = {
  agent: {
    Agent: ["工具调用与任务完成能力的 Agentic Index", "开放权重模型中 Agentic Index 最高", "Agentic Index ÷ 单次任务成本", "每秒输出 Token 数", "近 7 日 ModelGo 成功 Agent 任务数"],
  },
  text: {
    文本对话: ["通用知识与推理能力的 Intelligence Index", "开放权重模型中 Intelligence Index 最高", "Intelligence Index ÷ 单次任务成本", "每秒输出 Token 数", "近 7 日 ModelGo 调用 Token 数"],
    代码生成: ["代码生成与修复能力的 Coding Index", "开放权重模型中 Coding Index 最高", "Coding Index ÷ 单次任务成本", "每秒输出 Token 数", "近 7 日 ModelGo 代码调用 Token 数"],
  },
  image: {
    文生图: ["文生图偏好评测的 Elo 评分", "开放权重文生图模型中 Elo 最高", "Elo ÷ 每 1K 张图像价格", "每 1K 张标准图像的公开 API 价格", "近 7 日 ModelGo 文生图成功任务数"],
    图片编辑: ["图片编辑偏好评测的 Elo 评分", "开放权重编辑模型中 Elo 最高", "编辑 Elo ÷ 每 1K 张图像价格", "每 1K 张标准图像的公开 API 价格", "近 7 日 ModelGo 图片编辑成功任务数"],
  },
  video: {
    文生视频: ["文生视频偏好评测的 Elo 评分", "开放权重文生视频模型中 Elo 最高", "Elo ÷ 每分钟视频价格", "每分钟生成视频的公开 API 价格", "近 7 日 ModelGo 文生视频成功任务数"],
    图生视频: ["图生视频偏好评测的 Elo 评分", "开放权重图生视频模型中 Elo 最高", "Elo ÷ 每分钟视频价格", "每分钟生成视频的公开 API 价格", "近 7 日 ModelGo 图生视频成功任务数"],
  },
  audio: {
    "语音合成（TTS）": ["语音自然度与偏好的 Elo 评分", "语音质量 Elo ÷ 每 1M 字符价格", "每 1M 字符的公开 API 价格", "近 7 日 ModelGo 合成字符数"],
    "语音识别（STT）": ["统一测试集上的词错误率，越低越好", "每 1,000 分钟音频的公开价格", "近 7 日 ModelGo 转写音频分钟数"],
  },
};

const taskMetricSources: Record<ModalityKey, Record<string, string>> = {
  agent: { Agent: "Artificial Analysis" },
  text: { 文本对话: "Artificial Analysis", 代码生成: "Artificial Analysis" },
  image: { 文生图: "Artificial Analysis", 图片编辑: "Artificial Analysis" },
  video: { 文生视频: "Artificial Analysis", 图生视频: "Artificial Analysis" },
  audio: { "语音合成（TTS）": "Artificial Analysis", "语音识别（STT）": "Artificial Analysis" },
};

/**
 * 单次任务成本，取接口的 COST_PER_TASK（模型卡 price 字段里的数值）。
 *
 * 原先这里有两层 mock：写死的成本表，以及**用模型名的字符码编出一个成本**的兜底。
 * 接真实数据后必须整体去掉——否则页面会展示编造的价格。
 *
 * 成本的五项拆解（输出/推理/缓存写入/缓存命中/输入）接口不提供，原型是按固定
 * 比例从总额切出来的假明细，已随之删除（缺口见 qa#709）。
 */
/** 用量紧凑展示，与 discovery-data 的 compactAmount 同口径。 */
function compactUsage(value: number | null) {
  if (value === null) return "—";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return `${value}`;
}

/** 增长率带符号展示。真实数据里存在负增长，不能像原型那样把 + 写死。 */
function formatGrowth(growth: number) {
  return `${growth > 0 ? "+" : ""}${growth}%`;
}

function taskCostFor(model: DiscoveryModel): number {
  return plainMetricValue(model.price);
}

function formatTaskCost(value: number) {
  return `$${value.toFixed(2)}`;
}

const sourceConstrainedAnalysisProfiles: Partial<Record<ModalityKey, Record<string, AnalysisAxisProfile>>> = {
  image: {
    文生图: {
      yMetrics: ["Elo 评分", "API 价格"],
      xMetrics: [
        { label: "API 价格", unit: "USD / 1K 张", source: "price", lowerIsBetter: true, presetLabel: "质量 × API 价格" },
        { label: "近 7 日使用量", unit: "成功任务", source: "usage", lowerIsBetter: false, presetLabel: "质量 × 使用量" },
      ],
      presets: [
        { label: "质量 × API 价格", y: 0, x: 0 },
        { label: "质量 × 使用量", y: 0, x: 1 },
        { label: "API 价格 × 使用量", y: 1, x: 1 },
      ],
    },
    图片编辑: {
      yMetrics: ["Elo 评分", "API 价格"],
      xMetrics: [
        { label: "API 价格", unit: "USD / 1K 张", source: "price", lowerIsBetter: true, presetLabel: "质量 × API 价格" },
        { label: "近 7 日使用量", unit: "成功任务", source: "usage", lowerIsBetter: false, presetLabel: "质量 × 使用量" },
      ],
      presets: [
        { label: "质量 × API 价格", y: 0, x: 0 },
        { label: "质量 × 使用量", y: 0, x: 1 },
        { label: "API 价格 × 使用量", y: 1, x: 1 },
      ],
    },
  },
  video: {
    文生视频: {
      yMetrics: ["Elo 评分", "API 价格"],
      xMetrics: [
        { label: "API 价格", unit: "USD / 分钟", source: "price", lowerIsBetter: true, presetLabel: "质量 × API 价格" },
        { label: "近 7 日使用量", unit: "成功任务", source: "usage", lowerIsBetter: false, presetLabel: "质量 × 使用量" },
      ],
      presets: [
        { label: "质量 × API 价格", y: 0, x: 0 },
        { label: "质量 × 使用量", y: 0, x: 1 },
        { label: "API 价格 × 使用量", y: 1, x: 1 },
      ],
    },
    图生视频: {
      yMetrics: ["Elo 评分", "API 价格"],
      xMetrics: [
        { label: "API 价格", unit: "USD / 分钟", source: "price", lowerIsBetter: true, presetLabel: "质量 × API 价格" },
        { label: "近 7 日使用量", unit: "成功任务", source: "usage", lowerIsBetter: false, presetLabel: "质量 × 使用量" },
      ],
      presets: [
        { label: "质量 × API 价格", y: 0, x: 0 },
        { label: "质量 × 使用量", y: 0, x: 1 },
        { label: "API 价格 × 使用量", y: 1, x: 1 },
      ],
    },
  },
  audio: {
    "语音合成（TTS）": {
      yMetrics: ["语音质量 Elo", "API 价格"],
      xMetrics: [
        { label: "API 价格", unit: "USD / 1M 字符", source: "price", lowerIsBetter: true, presetLabel: "质量 × API 价格" },
        { label: "近 7 日使用量", unit: "字符", source: "usage", lowerIsBetter: false, presetLabel: "质量 × 使用量" },
      ],
      presets: [
        { label: "质量 × API 价格", y: 0, x: 0 },
        { label: "质量 × 使用量", y: 0, x: 1 },
        { label: "API 价格 × 使用量", y: 1, x: 1 },
      ],
    },
  },
};

const discoveryConfigs: Record<Exclude<ModalityKey, "agent">, DiscoveryConfig> = {
  text: {
    label: "文本",
    tasks: ["文本对话", "代码生成"],
    scoreLabel: "Intelligence Index",
    yMetrics: ["Intelligence Index", "Coding Index", "Agentic Index"],
    xMetrics: ["输入价格", "输出价格", "输出 TPS", "首 Token 延迟", "近 7 日使用量"],
    presets: [
      { label: "质量 × 价格", y: 0, x: 0 },
      { label: "质量 × 输出 TPS", y: 0, x: 2 },
      { label: "质量 × 延迟", y: 0, x: 3 },
      { label: "上下文 × 价格", y: 6, x: 0 },
      { label: "质量 × 使用量", y: 0, x: 4 },
    ],
    specialties: [
      { title: "性价比领先", description: "主指标 / 单次任务成本" },
      { title: "输出 TPS", description: "每秒输出 Token 数" },
      { title: "首 Token 时延领先", description: "首 Token 响应时延" },
      { title: "近 7 日热度", description: "ModelGo 调用 Tokens" },
    ],
  },
  image: {
    label: "图像",
    tasks: ["文生图", "图片编辑"],
    scoreLabel: "Elo 评分",
    yMetrics: ["Elo 评分"],
    xMetrics: ["标准单图价格", "近 7 日使用量"],
    presets: [
      { label: "质量 × 价格", y: 0, x: 0 },
      { label: "质量 × 使用量", y: 0, x: 1 },
      { label: "API 价格 × 使用量", y: 1, x: 1 },
    ],
    specialties: [
      { title: "性价比领先", description: "Elo 评分 / 标准单图价格" },
      { title: "API 价格", description: "每 1K 张标准图像价格" },
      { title: "近 7 日热度", description: "ModelGo 成功任务量" },
    ],
  },
  video: {
    label: "视频",
    tasks: ["文生视频", "图生视频"],
    scoreLabel: "Elo 评分",
    yMetrics: ["Elo 评分", "文生视频能力", "图生视频能力", "运动一致性"],
    xMetrics: ["每分钟价格", "近 7 日使用量"],
    presets: [{ label: "质量 × 价格", y: 0, x: 0 }, { label: "质量 × 使用量", y: 0, x: 1 }, { label: "API 价格 × 使用量", y: 1, x: 1 }],
    specialties: [
      { title: "性价比领先", description: "Elo 评分 / 每分钟价格" },
      { title: "API 价格", description: "每分钟生成视频价格" },
      { title: "近 7 日热度", description: "ModelGo 成功任务量" },
    ],
  },
  audio: {
    label: "音频",
    tasks: ["语音合成（TTS）", "语音识别（STT）"],
    scoreLabel: "Elo 评分",
    yMetrics: ["Elo 评分", "自然度 / 准确率", "稳定性"],
    xMetrics: ["公开价格", "近 7 日使用量"],
    presets: [{ label: "质量 × 价格", y: 0, x: 0 }, { label: "质量 × 使用量", y: 0, x: 1 }, { label: "API 价格 × 使用量", y: 1, x: 1 }],
    specialties: [
      { title: "性价比领先", description: "任务得分 / 公开价格" },
      { title: "API 价格", description: "每 1M 字符的公开 API 价格" },
      { title: "近 7 日热度", description: "ModelGo 请求量" },
    ],
  },
};

const audioTaskConfigs: Record<string, Pick<DiscoveryConfig, "specialties">> = {
  "语音合成（TTS）": {
    specialties: [
      { title: "性价比", description: "语音质量 Elo / API 价格" },
      { title: "API 价格", description: "每 1M 字符的公开 API 价格" },
      { title: "近 7 日使用量", description: "ModelGo 语音合成字符量" },
    ],
  },
  "语音识别（STT）": {
    specialties: [
      { title: "API 价格", description: "每 1,000 分钟音频转写价格" },
      { title: "近 7 日使用量", description: "ModelGo 识别音频分钟数" },
    ],
  },
};

const agentDiscoveryConfig: DiscoveryConfig = {
  ...discoveryConfigs.text,
  label: "Agent",
  tasks: ["Agent"],
  scoreLabel: "Agentic Index",
  yMetrics: ["Agentic Index"],
};

const agentPopularityPeriods: Array<{ key: AgentPopularityPeriod; label: string }> = [
  { key: "day", label: "本日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
];

/**
 * ⚠️ 全页唯一还留着的 mock —— 「热门 Agent 排行」是**应用**维度（Hermes Agent、
 * Claude Code…），而 v1.0.6 的六个接口返回的都是**模型**，没有任何应用维度数据。
 *
 * 已提 qa#709 请后端确认补接口还是把该模块下线。在此之前这份榜单是写死的，
 * 不要把它当成真实数据引用，也不要照它的形状去接别的模块。
 */
const agentApplications: Record<AgentPopularityPeriod, AgentApplication[]> = {
  day: [
    { id: "hermes-agent", name: "Hermes Agent", description: "Hermes Agent is an open-source, self-improving AI agent by Nous Research that runs persistently with memory across sessions, and builds reusable skills from experience. It comes with 40+ built-in tools, including web search, browser automation, and vision, plus scheduled automations and subagents.", tokenUsage: 1_458_881_530_720 },
    { id: "claude-code", name: "Claude Code", description: "Claude Code is Anthropic's agentic coding tool that reads your entire codebase, plans and executes changes across files, runs tests, and iterates on failures, all from natural language prompts.", tokenUsage: 334_253_105_091 },
    { id: "kilo-code", name: "Kilo Code", description: "Kilo Code is an open-source AI coding agent that works across VS Code, JetBrains, and CLI to help developers ship code faster with agentic workflows.", tokenUsage: 243_602_077_191 },
    { id: "cline", name: "Cline", description: "Cline is an open-source AI coding agent that lives inside your IDE, autonomously exploring your codebase, editing files, running terminal commands, and using browser automation.", tokenUsage: 197_830_567_961 },
    { id: "openclaw", name: "OpenClaw", description: "OpenClaw is an open-source AI agent that connects to your messaging apps and takes real actions on your behalf, from running commands and browsing the web to managing files and sending emails.", tokenUsage: 152_022_999_648 },
    { id: "pi", name: "pi", description: "There are many coding agents, but this one is yours.", tokenUsage: 128_548_684_477 },
    { id: "framer", name: "Framer", description: "Create a professional website with Framer’s no-code AI website builder. Design freely, manage CMS content, optimize SEO, collaborate, and publish fast.", tokenUsage: 122_974_048_354 },
    { id: "app-4137556", name: "Zazen (Freebuff fork)", description: "freebuff.com", tokenUsage: 106_274_356_214 },
    { id: "app-4580043", name: "HighLevel", description: "www.gohighlevel.com", tokenUsage: 72_464_455_244 },
    { id: "app-3682314", name: "omp", description: "omp.sh", tokenUsage: 71_615_127_842 },
    { id: "nous-research-api", name: "Nous Research API", description: "Nous Research is an AI research team focused on advancing open-source AI.", tokenUsage: 65_014_622_819 },
    { id: "descript", name: "Descript", description: "AI Video & Podcast Editor", tokenUsage: 47_447_624_946 },
    { id: "lemonade", name: "Lemonade", description: "The AI tool for Roblox games.", tokenUsage: 43_322_686_955 },
    { id: "codex", name: "Codex", description: "A coding agent that helps you build and ship with AI", tokenUsage: 39_347_406_258 },
    { id: "isekai-zero", name: "ISEKAI ZERO", description: "AI adventures. Travel with your favorite characters", tokenUsage: 36_887_634_343 },
    { id: "janitor-ai", name: "Janitor AI", description: "Janitor AI is a chatbot platform where users create and chat with custom AI characters for interactive roleplay, storytelling, and immersive fiction.", tokenUsage: 32_210_895_083 },
    { id: "app-4132065", name: "Hello Minds, powered by Ethoswarm", description: "www.hellominds.ai", tokenUsage: 27_681_437_156 },
    { id: "stan", name: "Sahasra", description: "All-in-one creator store", tokenUsage: 24_502_237_846 },
    { id: "app-2640550", name: "Peezy Gateway", description: "p0.systems", tokenUsage: 23_274_028_608 },
    { id: "app-2237546", name: "Cursor", description: "cursor.com", tokenUsage: 22_293_418_234 },
  ],
  week: [
    { id: "hermes-agent", name: "Hermes Agent", description: "Hermes Agent is an open-source, self-improving AI agent by Nous Research that runs persistently with memory across sessions, and builds reusable skills from experience. It comes with 40+ built-in tools, including web search, browser automation, and vision, plus scheduled automations and subagents.", tokenUsage: 10_002_983_822_990 },
    { id: "claude-code", name: "Claude Code", description: "Claude Code is Anthropic's agentic coding tool that reads your entire codebase, plans and executes changes across files, runs tests, and iterates on failures, all from natural language prompts.", tokenUsage: 2_297_352_075_910 },
    { id: "kilo-code", name: "Kilo Code", description: "Kilo Code is an open-source AI coding agent that works across VS Code, JetBrains, and CLI to help developers ship code faster with agentic workflows.", tokenUsage: 1_591_258_651_068 },
    { id: "cline", name: "Cline", description: "Cline is an open-source AI coding agent that lives inside your IDE, autonomously exploring your codebase, editing files, running terminal commands, and using browser automation.", tokenUsage: 1_374_609_616_050 },
    { id: "openclaw", name: "OpenClaw", description: "OpenClaw is an open-source AI agent that connects to your messaging apps and takes real actions on your behalf, from running commands and browsing the web to managing files and sending emails.", tokenUsage: 1_085_183_369_010 },
    { id: "pi", name: "pi", description: "There are many coding agents, but this one is yours.", tokenUsage: 784_897_817_190 },
    { id: "framer", name: "Framer", description: "Create a professional website with Framer’s no-code AI website builder. Design freely, manage CMS content, optimize SEO, collaborate, and publish fast.", tokenUsage: 768_721_928_010 },
    { id: "app-4137556", name: "Zazen (Freebuff fork)", description: "freebuff.com", tokenUsage: 653_040_033_453 },
    { id: "nous-research-api", name: "Nous Research API", description: "Nous Research is an AI research team focused on advancing open-source AI.", tokenUsage: 510_163_032_574 },
    { id: "app-3682314", name: "omp", description: "omp.sh", tokenUsage: 479_688_266_282 },
    { id: "app-4580043", name: "HighLevel", description: "www.gohighlevel.com", tokenUsage: 465_723_137_092 },
    { id: "descript", name: "Descript", description: "AI Video & Podcast Editor", tokenUsage: 338_895_757_729 },
    { id: "codex", name: "Codex", description: "A coding agent that helps you build and ship with AI", tokenUsage: 279_806_899_078 },
    { id: "isekai-zero", name: "ISEKAI ZERO", description: "AI adventures. Travel with your favorite characters", tokenUsage: 271_518_301_600 },
    { id: "lemonade", name: "Lemonade", description: "The AI tool for Roblox games.", tokenUsage: 256_935_139_758 },
    { id: "app-4132065", name: "Hello Minds, powered by Ethoswarm", description: "www.hellominds.ai", tokenUsage: 250_582_441_879 },
    { id: "janitor-ai", name: "Janitor AI", description: "Janitor AI is a chatbot platform where users create and chat with custom AI characters for interactive roleplay, storytelling, and immersive fiction.", tokenUsage: 234_194_116_465 },
    { id: "app-2640550", name: "Peezy Gateway", description: "p0.systems", tokenUsage: 174_119_314_031 },
    { id: "stan", name: "Sahasra", description: "All-in-one creator store", tokenUsage: 160_508_224_895 },
    { id: "app-2237546", name: "Cursor", description: "cursor.com", tokenUsage: 154_834_706_310 },
  ],
  month: [
    { id: "hermes-agent", name: "Hermes Agent", description: "Hermes Agent is an open-source, self-improving AI agent by Nous Research that runs persistently with memory across sessions, and builds reusable skills from experience. It comes with 40+ built-in tools, including web search, browser automation, and vision, plus scheduled automations and subagents.", tokenUsage: 34_744_052_334_893 },
    { id: "claude-code", name: "Claude Code", description: "Claude Code is Anthropic's agentic coding tool that reads your entire codebase, plans and executes changes across files, runs tests, and iterates on failures, all from natural language prompts.", tokenUsage: 8_225_562_943_824 },
    { id: "kilo-code", name: "Kilo Code", description: "Kilo Code is an open-source AI coding agent that works across VS Code, JetBrains, and CLI to help developers ship code faster with agentic workflows.", tokenUsage: 7_221_529_419_722 },
    { id: "openclaw", name: "OpenClaw", description: "OpenClaw is an open-source AI agent that connects to your messaging apps and takes real actions on your behalf, from running commands and browsing the web to managing files and sending emails.", tokenUsage: 4_452_230_508_096 },
    { id: "cline", name: "Cline", description: "Cline is an open-source AI coding agent that lives inside your IDE, autonomously exploring your codebase, editing files, running terminal commands, and using browser automation.", tokenUsage: 3_948_533_898_395 },
    { id: "pi", name: "pi", description: "There are many coding agents, but this one is yours.", tokenUsage: 2_868_500_108_538 },
    { id: "descript", name: "Descript", description: "AI Video & Podcast Editor", tokenUsage: 1_718_004_199_525 },
    { id: "app-3909382", name: "Command Code", description: "commandcode.ai", tokenUsage: 1_634_692_961_004 },
    { id: "app-4132065", name: "Hello Minds, powered by Ethoswarm", description: "www.hellominds.ai", tokenUsage: 1_372_905_875_621 },
    { id: "framer", name: "Framer", description: "Create a professional website with Framer’s no-code AI website builder. Design freely, manage CMS content, optimize SEO, collaborate, and publish fast.", tokenUsage: 1_343_713_894_378 },
    { id: "isekai-zero", name: "ISEKAI ZERO", description: "AI adventures. Travel with your favorite characters", tokenUsage: 1_033_645_071_927 },
    { id: "codex", name: "Codex", description: "A coding agent that helps you build and ship with AI", tokenUsage: 1_028_098_283_451 },
    { id: "app-3682314", name: "omp", description: "omp.sh", tokenUsage: 1_020_745_149_015 },
    { id: "nous-research-api", name: "Nous Research API", description: "Nous Research is an AI research team focused on advancing open-source AI.", tokenUsage: 999_695_205_329 },
    { id: "janitor-ai", name: "Janitor AI", description: "Janitor AI is a chatbot platform where users create and chat with custom AI characters for interactive roleplay, storytelling, and immersive fiction.", tokenUsage: 979_733_184_339 },
    { id: "lemonade", name: "Lemonade", description: "The AI tool for Roblox games.", tokenUsage: 868_014_529_297 },
    { id: "app-2640550", name: "Peezy Gateway", description: "p0.systems", tokenUsage: 853_290_545_250 },
    { id: "app-4137556", name: "Zazen (Freebuff fork)", description: "freebuff.com", tokenUsage: 656_473_093_879 },
    { id: "app-4580043", name: "HighLevel", description: "www.gohighlevel.com", tokenUsage: 630_456_435_463 },
    { id: "stan", name: "Sahasra", description: "All-in-one creator store", tokenUsage: 554_349_479_924 },
  ],
};

function discoveryConfigFor(modality: ModalityKey) {
  return modality === "agent" ? agentDiscoveryConfig : discoveryConfigs[modality];
}

function metricValue(value: string) {
  const amount = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amount)) return 0;
  if (value.includes("B")) return amount * 1_000_000_000;
  if (value.includes("M")) return amount * 1_000_000;
  if (value.includes("K")) return amount * 1_000;
  return amount;
}

function plainMetricValue(value: string | undefined) {
  if (!value) return 0;
  const amount = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function createAxisTicks(values: number[]) {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) return [0, 0.25, 0.5, 0.75, 1];
  const minimum = Math.min(...finiteValues);
  const maximum = Math.max(...finiteValues);
  if (minimum === maximum) return [minimum * 0.8, minimum * 0.9, minimum, minimum * 1.1, minimum * 1.2];
  const roughStep = (maximum - minimum) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const residual = roughStep / magnitude;
  let step = (residual >= 5 ? 5 : residual >= 2 ? 2 : 1) * magnitude;
  let start = Math.floor(minimum / step) * step;
  let end = Math.ceil(maximum / step) * step;
  while ((end - start) / step > 5) {
    step *= 2;
    start = Math.floor(minimum / step) * step;
    end = Math.ceil(maximum / step) * step;
  }
  const ticks: number[] = [];
  for (let value = start; value <= end + step * 0.1; value += step) ticks.push(Number(value.toPrecision(10)));
  return ticks;
}

function compactTokenUsage(value: number) {
  const units = [
    { minimum: 1_000_000_000_000, suffix: "T" },
    { minimum: 1_000_000_000, suffix: "B" },
    { minimum: 1_000_000, suffix: "M" },
    { minimum: 1_000, suffix: "K" },
  ];
  const unit = units.find(({ minimum }) => value >= minimum);
  if (!unit) return `${value}`;
  const amount = value / unit.minimum;
  const precision = amount >= 100 ? 0 : amount >= 10 ? 1 : 2;
  return `${amount.toFixed(precision).replace(/\.0+$|(?<=\.[0-9])0$/, "")}${unit.suffix}`;
}

function compactNumber(value: number) {
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(value >= 10_000_000_000_000 ? 0 : 1)}T`;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(value >= 10_000_000_000 ? 0 : 1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  if (value >= 100) return `${Math.round(value)}`;
  if (value >= 10) return value.toFixed(1).replace(/\.0$/, "");
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/* 原型的 providerMarks（42 条厂牌首字母）已删除 —— 模型/厂牌标识改走 ModelIcon，
   见下面 DiscoveryModelIcon 的说明。下面这张色表还留着，只用于图表着色（趋势柱、
   散点点色与图例），不再参与图标渲染。
   ⚠️ 它同样是硬编码的厂牌色，而 @model-go/icons 导出了 brandColor(vendor, theme)
   ——  库里那份还按深浅双轴分了档（深蓝深紫在深底压不住、亮黄亮青在浅底压不住）。
   图表配色换过去是下一步，属独立改动，不混在图标这一刀里。 */
/**
 * 图表用的厂牌主色，走私包 `@model-go/icons` 的 `brandColor(vendor, theme)`。
 *
 * 这里原本硬编码了 32 个厂牌色值。私包才是厂牌色的真源，而且它按**深浅双轴各配一个
 * 生效值**（深蓝深紫在深底压不住、亮黄亮青在浅底压不住），硬编码那份只有一个值，
 * 暗色主题下必然有一批压不住。
 *
 * ⚠️ **`brandColor` 返回 null 不是「查不到」，是「这个厂牌是单色标识」**——
 * OpenAI、Z AI、Moonshot 这类 logo 本身就是黑白的，库刻意不给色值，让它跟随主题
 * （原先硬编码表里给它们填的正是 #111827 近黑）。所以回落值必须是**跟随主题的中性色**，
 * 不能回落到品牌色：那会让所有单色厂牌在图上变成同一片品牌蓝，还和图表主色撞色。
 *
 * 实测 TEXT_CHAT 的 59 家厂商里 24 家有专属品牌色，其余走中性色。
 */
function useProviderColor() {
  const theme = useActiveTheme()
  return useCallback(
    (provider: string) => brandColor(provider, theme) ?? 'var(--mg-text-2)',
    [theme],
  )
}

function AgentPopularityLeaderboard() {
  const [period, setPeriod] = useState<AgentPopularityPeriod>("day");
  const [expanded, setExpanded] = useState(false);
  const rankedAgents = agentApplications[period].map((agent, index) => ({ ...agent, rank: index + 1 }));
  const visibleAgents = rankedAgents.slice(0, expanded ? 20 : 10);
  const columnSize = Math.ceil(visibleAgents.length / 2);
  const agentColumns = [visibleAgents.slice(0, columnSize), visibleAgents.slice(columnSize)];

  return <section className="model-discovery-section model-discovery-agent-popularity">
    <div className="model-discovery-section-head model-discovery-agent-popularity-head">
      <div><h2>热门 Agent 排行</h2></div>
      <div aria-label="热门 Agent 排行统计周期" className="runtime-range-switch" role="radiogroup">
        {agentPopularityPeriods.map((option) => <button aria-checked={period === option.key} className={period === option.key ? "active" : ""} key={option.key} onClick={() => setPeriod(option.key)} role="radio" type="button">{option.label}</button>)}
      </div>
    </div>
    <div className="mg-tile model-discovery-agent-popularity-card">
      <div className="model-discovery-agent-popularity-grid" id="agent-popularity-list" role="list">
        {agentColumns.map((column, columnIndex) => <div className="model-discovery-agent-popularity-column" key={columnIndex} role="presentation">
          {column.map((agent) => <div className="model-discovery-agent-popularity-row" key={agent.id} role="listitem">
            <span className="model-discovery-agent-popularity-rank">{agent.rank}.</span>
            <DiscoveryAgentIcon id={agent.id} name={agent.name} />
            <div className="model-discovery-agent-popularity-copy"><strong>{agent.name}</strong><span title={agent.description}>{agent.description}</span></div>
            <strong className="model-discovery-agent-popularity-usage">{compactTokenUsage(agent.tokenUsage)}<span>Tokens</span></strong>
          </div>)}
        </div>)}
      </div>
      <div className="model-discovery-rank-more model-discovery-agent-popularity-more">
        <button aria-controls="agent-popularity-list" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)} type="button">{expanded ? "收起" : "查看更多"}<LuChevronDown aria-hidden="true" className={expanded ? "flip" : ""} size={13} /></button>
      </div>
    </div>
  </section>;
}

function ModelDiscoveryPage({ onOpenModel, onViewAllModels }: { onOpenModel: (modelId: string) => void; onViewAllModels: () => void }) {
  const [modality, setModality] = useState<ModalityKey>("agent");
  const config = discoveryConfigFor(modality);
  const [task, setTask] = useState(config.tasks[0]);
  const taskProfile = taskMetricProfiles[modality][task];
  const metricSource = taskMetricSources[modality][task];
  const audioTaskConfig = modality === "audio" ? audioTaskConfigs[task] : undefined;
  /** STT 的主指标是 WER，越低越好；其余类型都是越高越好。 */
  const scoreAscending = Boolean(taskProfile.qualityLowerIsBetter);
  /**
   * 模型列表与总览卡来自 observer 的每日快照（v1.0.6），不再用原型自带的 mock。
   *
   * 这里不再取 `total`：它此前用来给 Top 5 卡副标题拼「· 共 N 个模型」，而原型没有这个
   * 字段、同一个总数在下方分页处已经出现一次，2026-09-03 按 PRD 去掉了那半句。
   * 榜单分页的总数走 useDiscoveryTableQuery 的 `tableTotal`（那是按当前筛选条件的命中数，
   * 与这里按 metric 的可排序总数不是同一个口径，别混用）。
   */
  const {
    models: apiModels,
    summaryCards: apiSummaryCards,
    snapshotDate,
    dataType: discoveryDataType,
    isLoading: discoveryLoading,
  } = useDiscoveryQuery(modality, task);
  const configuredModels = apiModels;
  const [scope, setScope] = useState<"all" | "supported">("all");
  const [yMetric, setYMetric] = useState(0);
  const [xMetric, setXMetric] = useState(0);
  const [pareto, setPareto] = useState(false);
  const [modelFilterSearch, setModelFilterSearch] = useState("");
  const [selectedModelNames, setSelectedModelNames] = useState<string[]>([]);
  const [rankingMetric, setRankingMetric] = useState<RankingMetric>("overall");
  const [providerFilter, setProviderFilter] = useState<string[]>([]);
  const [tableAccess, setTableAccess] = useState<"all" | "supported" | "pending">("all");
  const [tablePage, setTablePage] = useState(1);
  /**
   * 图表联动：柱图与散点图画的是同一批模型，hover 任一处时另一处的同名模型跟着
   * 高亮。这是两张图之间唯一的关联线索——没有它，用户看不出「散点右上角那个点」
   * 就是「柱图第一根」。
   */
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  const providerColor = useProviderColor();

  /**
   * 接口已按该类型的主指标排好序（rankings 的 direction 决定升降序，STT 的 WER
   * 越低越好也由服务端处理），前端不再重排——原先这里还会用写死的 textTaskScores
   * 覆盖分数，接真实数据后那是拿假分盖真分，已一并删除。
   */
  const taskModels = configuredModels;
  const visibleModels = useMemo(
    () => taskModels.filter((model) => scope === "all" || isModelConnected(model)),
    [scope, taskModels],
  );
  /**
   * 筛选条件变化时页码回第 1 页。
   *
   * 原型用的是 useEffect + setTablePage(1)，但本仓 eslint 开了
   * react-hooks/set-state-in-effect（effect 里同步 setState 会触发级联渲染）。
   * 改成 React 官方的「渲染期按上一次值调整状态」写法 —— 行为完全等价，
   * 且少一轮渲染：effect 版会先用旧页码渲染一次再纠正。
   * 这是实现方式的调整，不改任何 UI 与交互。
   */
  /**
   * 散点图默认选中前 7 个模型。不能放在 useState 初值里——那时接口数据还没到；
   * 也不用 effect（本仓 eslint 禁 set-state-in-effect），走「渲染期按上一次值调整
   * 状态」，与下方 tablePage 归位同一套写法。
   *
   * ⚠️ 判据必须是**数据实际对应的类型**（接口响应里的 type），不能用当前选中的
   * `modality|task`。查询开了 placeholderData 保留旧数据，切 tab 的那一帧入参已经
   * 变了、models 却还是上一个类型的：拿入参做判据会在旧数据上就把重置执行掉并把
   * key 记成新值，等真数据到达时条件已不成立，于是散点图停在「上一个 tab 的模型名」
   * 上，在新候选里一个也匹配不到，图表空掉。
   */
  const selectionKey = discoveryDataType ?? "";
  const [lastSelectionKey, setLastSelectionKey] = useState("");
  if (taskModels.length > 0 && lastSelectionKey !== selectionKey) {
    setLastSelectionKey(selectionKey);
    setSelectedModelNames(taskModels.slice(0, 7).map((model) => model.name));
  }

  const tableFilterKey = `${modality}|${task}|${scope}|${rankingMetric}|${providerFilter.join(",")}|${tableAccess}`;
  const [lastTableFilterKey, setLastTableFilterKey] = useState(tableFilterKey);
  if (lastTableFilterKey !== tableFilterKey) {
    setLastTableFilterKey(tableFilterKey);
    setTablePage(1);
  }
  const constrainedAnalysisProfile = sourceConstrainedAnalysisProfiles[modality]?.[task];
  const isTextAgent = modality === "text" || modality === "agent";
  /**
   * Y 轴可选项只保留**接口真的有数据**的那些。
   *
   * config.yMetrics 里还列着「Coding Index」「运动一致性」这类同类型下拿不到的指标，
   * 原型靠对主指标做等比衰减伪造出它们的值。真实数据下不能这么干——一个 type 只有
   * 一个主指标，所以非 constrained 档位就只给主指标一项。
   */
  const analysisYMetrics = constrainedAnalysisProfile?.yMetrics ?? [taskProfile.qualityLabel];
  const analysisCostLabel = taskProfile.valueLabel.split(" / ").at(-1) ?? "单次任务成本";
  const analysisPresetPrefix = modality === "image" ? "Elo" : "质量";
  const defaultAnalysisXMetrics: AnalysisAxisProfile["xMetrics"] = [
    { label: analysisCostLabel, unit: isTextAgent ? "USD / Task" : "USD", source: "price", lowerIsBetter: true, presetLabel: `${analysisPresetPrefix} × 成本` },
    { label: taskProfile.speedLabel, unit: taskProfile.speedUnit, source: "speed", lowerIsBetter: false, presetLabel: `${analysisPresetPrefix} × 输出 TPS` },
    { label: taskProfile.latencyLabel, unit: taskProfile.latencyUnit, source: "latency", lowerIsBetter: true, presetLabel: `${analysisPresetPrefix} × 时延` },
    { label: taskProfile.usageLabel, unit: taskProfile.usageUnit, source: "usage", lowerIsBetter: false, presetLabel: `${analysisPresetPrefix} × 使用量` },
  ];
  const analysisXMetrics = constrainedAnalysisProfile?.xMetrics ?? defaultAnalysisXMetrics;
  const analysisPresets = constrainedAnalysisProfile?.presets ?? analysisXMetrics.map((metric, index) => ({ label: metric.presetLabel, y: 0, x: index }));
  /**
   * 专项榜：标题与说明来自配置（产品文案），**行数据一律从接口的真实模型卡派生**。
   * 原先配置里那 5 行写死的排名连同 completeSpecialtyRows 的补位算法一起删掉了。
   */
  const specialtyTemplates = modality === "audio" && audioTaskConfig
    ? audioTaskConfig.specialties
    : isTextAgent
    ? [{ ...config.specialties[0], description: taskProfile.valueLabel }, ...config.specialties.slice(1)]
    : config.specialties;
  const specialties = specialtyTemplates.map((item) => ({
    ...item,
    rows: specialtyRows(item.title, taskModels, { scoreAscending }),
  }));
  const imageBenchmarkRankings = [
    {
      title: "质量 Elo 评分",
      description: "图像偏好评测 Elo",
      source: "Artificial Analysis",
      lowerIsBetter: false,
      rows: [...taskModels].sort((first, second) => metricValue(second.score) - metricValue(first.score)).map((model) => ({ model: model.name, value: model.score })),
    },
    {
      title: "性价比",
      description: "质量 Elo / API 价格",
      source: "Artificial Analysis",
      lowerIsBetter: false,
      rows: specialtyRows("性价比", taskModels),
    },
    {
      title: "API 价格",
      description: "每 1K 张标准图像价格（$/1k images）",
      source: "Artificial Analysis",
      lowerIsBetter: true,
      rows: [...taskModels].sort((first, second) => plainMetricValue(first.price) - plainMetricValue(second.price)).map((model) => ({ model: model.name, value: `$${plainMetricValue(model.price)}` })),
    },
    {
      title: "近 7 日使用量",
      description: "ModelGo 成功任务量",
      source: "ModelGo",
      lowerIsBetter: false,
      rows: [...taskModels].sort((first, second) => metricValue(second.usage) - metricValue(first.usage)).map((model) => ({ model: model.name, value: model.usage })),
    },
  ];
  const videoBenchmarkRankings = [
    {
      title: "质量 Elo 评分",
      description: "视频偏好评测 Elo",
      source: "Artificial Analysis",
      lowerIsBetter: false,
      rows: [...taskModels].sort((first, second) => metricValue(second.score) - metricValue(first.score)).map((model) => ({ model: model.name, value: model.score })),
    },
    {
      title: "性价比",
      description: "质量 Elo / API 价格",
      source: "Artificial Analysis",
      lowerIsBetter: false,
      rows: specialtyRows("性价比", taskModels),
    },
    {
      title: "API 价格",
      description: "每分钟生成视频价格（$/min）",
      source: "Artificial Analysis",
      lowerIsBetter: true,
      rows: [...taskModels].sort((first, second) => plainMetricValue(first.price) - plainMetricValue(second.price)).map((model) => ({ model: model.name, value: `$${plainMetricValue(model.price)}` })),
    },
    {
      title: "近 7 日使用量",
      description: "ModelGo 成功任务量",
      source: "ModelGo",
      lowerIsBetter: false,
      rows: [...taskModels].sort((first, second) => metricValue(second.usage) - metricValue(first.usage)).map((model) => ({ model: model.name, value: model.usage })),
    },
  ];
  const textBenchmarkRankings = [
    {
      title: "综合评分",
      description: taskProfile.qualityLabel,
      source: "Artificial Analysis",
      lowerIsBetter: Boolean(taskProfile.qualityLowerIsBetter),
      rows: [...taskModels].map((model) => ({ model: model.name, value: model.score })),
    },
    {
      title: "单次任务成本",
      description: "Artificial Analysis 基准任务加权平均成本（USD/Task）",
      source: "Artificial Analysis",
      lowerIsBetter: true,
      rows: [...taskModels]
        .sort((first, second) => taskCostFor(first) - taskCostFor(second))
        .map((model) => ({ model: model.name, value: formatTaskCost(taskCostFor(model)) })),
    },
    {
      title: "输出 TPS",
      description: "每秒输出 Token 数（Tokens/秒）",
      source: "Artificial Analysis",
      lowerIsBetter: false,
      rows: [...taskModels].sort((first, second) => metricValue(second.performance) - metricValue(first.performance)).map((model) => ({ model: model.name, value: model.performance })),
    },
    {
      title: "近 7 日热度",
      description: "ModelGo 调用 Tokens",
      source: "ModelGo",
      lowerIsBetter: false,
      rows: [...taskModels].sort((first, second) => metricValue(second.usage) - metricValue(first.usage)).map((model) => ({ model: model.name, value: model.usage })),
    },
  ];
  const audioBenchmarkRankings = task === "语音合成（TTS）"
    ? [
      {
        title: "语音质量 Elo",
        description: "语音质量与偏好评测 Elo",
        source: "Artificial Analysis",
        lowerIsBetter: false,
        rows: [...taskModels].sort((first, second) => metricValue(second.score) - metricValue(first.score)).map((model) => ({ model: model.name, value: model.score })),
      },
      { ...specialties[0], source: "Artificial Analysis", lowerIsBetter: false },
      { ...specialties[1], source: "Artificial Analysis", lowerIsBetter: true },
      { ...specialties[2], source: "ModelGo", lowerIsBetter: false },
    ]
    : specialties.map((item, index) => ({
      ...item,
      source: index === specialties.length - 1 ? "ModelGo" : "Artificial Analysis",
      lowerIsBetter: task === "语音识别（STT）" && index === 0,
    }));
  const rankingCards = modality === "image"
    ? imageBenchmarkRankings
    : modality === "video"
      ? videoBenchmarkRankings
      : modality === "audio"
        ? audioBenchmarkRankings
        : textBenchmarkRankings;
  /**
   * 模型选择器与厂商筛选的候选来自 model-options（该类型的**全部**模型，不分页）。
   * 之前用的是榜单前 100 条，导致选择器只有 100 个模型、厂商下拉只有二十来家——
   * 实测 TEXT_CHAT 全量是 631 个模型 / 59 家厂商。
   */
  const { options: allModelOptions, vendors: providers } = useDiscoveryModelOptions(modality, task);
  const availableRankingMetricOptions = isTextAgent
    ? rankingMetricOptions
    : modality === "audio" && task === "语音识别（STT）"
      ? [{ key: "overall", label: "识别准确率" }, { key: "price", label: "API 价格", specialtyIndex: 0 }, { key: "usage", label: "使用量", specialtyIndex: 1 }] satisfies typeof rankingMetricOptions
      : [{ key: "overall", label: modality === "audio" ? "语音质量" : "Elo 评分" }, { key: "value", label: "性价比", specialtyIndex: 0 }, { key: "price", label: "API 价格", specialtyIndex: 1 }, { key: "usage", label: "使用量", specialtyIndex: 2 }] satisfies typeof rankingMetricOptions;
  const selectedRankingOption = availableRankingMetricOptions.find((option) => option.key === rankingMetric) ?? availableRankingMetricOptions[0];
  const selectedSpecialty = selectedRankingOption.specialtyIndex === undefined ? undefined : specialties[selectedRankingOption.specialtyIndex];
  const selectedMetricRows = selectedSpecialty ? specialtyRows(selectedSpecialty.title, taskModels, { scoreAscending }) : [];
  const selectedMetricValues = new Map(selectedMetricRows.map((row) => [row.model, row.value]));
  const specialtyDescriptions = isTextAgent
    ? [taskProfile.valueLabel, taskProfile.speedLabel, taskProfile.latencyLabel, taskProfile.usageLabel]
    : modality === "audio" && task === "语音识别（STT）"
      ? ["公开 API 价格", taskProfile.usageLabel]
      : [taskProfile.valueLabel, "公开 API 价格", taskProfile.usageLabel];
  const selectedMetricHeader = rankingMetric === "value"
    ? isTextAgent
      ? `${taskProfile.qualityLabel} / 单次任务成本`
      : `${taskProfile.qualityLabel} / 公开价格`
    : rankingMetric === "price"
      ? "API 价格"
    : selectedRankingOption.specialtyIndex === undefined
      ? taskProfile.qualityLabel
      : specialtyDescriptions[selectedRankingOption.specialtyIndex];
  const selectedMetricSource = rankingMetric === "usage" ? "ModelGo" : metricSource;
  /**
   * 总览卡直接用接口的 highlights（label / value / unit 都在数据层按业务类型算好），
   * 不再从模型列表里自己挑「第一名」—— 接口的 highlight 是在全量模型上算的，
   * 本地列表只有前 100 条，自己挑会挑错。这里只补两样接口没有的：
   * 厂商名（用于卡片图标）与 tooltip 文案（产品口径，非数据）。
   */
  const summaryCards = apiSummaryCards.map((item, index) => ({
    ...item,
    tooltip: summaryTooltipCopy[modality][task]?.[index] ?? item.label,
  }));
  /**
   * 完整榜单走**服务端排序 + 服务端分页**：排序口径（综合/性价比/价格/使用量）
   * 直接对应接口的 metric，接入状态映射到 integration_status，翻页交给 page。
   *
   * 原先是取回前 100 条后在前端排序分页——榜单标着「共 631 个模型」却只能翻 5 页，
   * 排序也只在这 100 条内成立。
   */
  const tablePageSize = 20;
  const {
    models: tableModels,
    total: tableTotal,
    isLoading: tableLoading,
  } = useDiscoveryTable(modality, task, {
    metric: rankingMetric,
    page: tablePage,
    pageSize: tablePageSize,
    creators: providerFilter,
    scope,
    tableAccess,
  });
  const tablePageCount = Math.max(1, Math.ceil(tableTotal / tablePageSize));
  const safeTablePage = Math.min(tablePage, tablePageCount);

  /** 跳详情只需要这四个字段，散点用的轻量模型对象同样适用。 */
  type DetailShape = Pick<DiscoveryModel, "id" | "name" | "provider" | "supported">;

  function canOpenModelDetail(model: DetailShape) {
    const hasDestination = isDomesticModel(model) ? Boolean(model.id) : true;
    return isModelConnected(model) && hasDestination;
  }

  function modelDetailAriaLabel(model: DetailShape) {
    return isDomesticModel(model)
      ? `查看 ${model.name} 模型详情`
      : `在 ModelGo.ai 查看 ${model.name} 模型`;
  }

  function openModelDetail(model: DetailShape) {
    if (!canOpenModelDetail(model)) return;
    if (!isDomesticModel(model)) {
      window.open(modelGoAiModelUrl(model), "_blank", "noopener,noreferrer");
      return;
    }
    if (!model.id) return;
    onOpenModel(model.id);
  }

  // Top 5 卡的行是 div、完整榜单的行是 tr（Table 组件），故取二者共同的 HTMLElement
  function handleModelRowKeyDown(event: KeyboardEvent<HTMLElement>, model: DetailShape) {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    openModelDetail(model);
  }

  function selectedMetricValue(model: DiscoveryModel) {
    const configuredValue = selectedMetricValues.get(model.name);
    if (rankingMetric === "overall") return model.score;
    if (configuredValue) return configuredValue;
    if (rankingMetric === "price") return model.price;
    if (rankingMetric === "usage") return model.usage;
    return tableMetricNumber(model).toFixed(1);
  }

  function tableMetricNumber(model: DiscoveryModel) {
    if (rankingMetric === "price") return plainMetricValue(model.price);
    if (rankingMetric === "usage") return metricValue(model.usage);
    if (rankingMetric === "value") {
      const quality = metricValue(model.score);
      const cost = isTextAgent ? taskCostFor(model) : plainMetricValue(model.price);
      return taskProfile.qualityLowerIsBetter ? 1 / Math.max(quality * cost, 0.01) : quality / Math.max(cost, 0.01);
    }
    return metricValue(model.score);
  }

  function supportingMetrics(model: DiscoveryModel) {
    return [isTextAgent ? formatTaskCost(taskCostFor(model)) : model.price, model.release ?? "—", model.usage];
  }

  const supportingMetricHeaders = isTextAgent
    ? ["单次任务成本", "发布时间", "ModelGo 使用量"]
    : ["公开价格", "发布时间", "ModelGo 使用量"];
  /**
   * 散点用的轻量模型对象：名称 / 厂商 / 接入状态来自 model-options（全量），
   * 坐标来自 analysis 接口。原先两者都取自榜单前 100 条，选择器一旦能选到第 100 名
   * 开外的模型就既没有元信息也没有坐标。
   */
  const chartCandidates = useMemo(
    () => allModelOptions
      // 「仅看已接入」是页面级筛选，图表候选也要跟着收窄。原型里筛选器的数据源是
      // 已过 scope 的 visibleModels；此前这里直接用 allModelOptions 全量，导致切到
      // 「仅看已接入」后触发器仍显示 7 / 634、可选项里还混着没接入的模型
      // （2026-09-03 需求方指出）。
      .filter((option) => scope === "all" || option.integration_status === "MODELGO")
      .map((option) => ({
        // 只有已接入且有 modelgo_id 的才给 id——canOpenModelDetail 据此判断能不能跳
        id: option.integration_status === "MODELGO" && option.modelgo_id ? option.modelgo_id : undefined,
        sourceModelId: option.source_model_id,
        name: option.model_name,
        provider: option.creator_name ?? "",
        supported: option.integration_status === "MODELGO",
      })),
    [allModelOptions, scope],
  );
  const chartModels = chartCandidates.filter((model) => selectedModelNames.includes(model.name));
  const filteredModelOptions = chartCandidates.filter((model) => model.name.toLowerCase().includes(modelFilterSearch.trim().toLowerCase()));
  const activeXAxis = analysisXMetrics[xMetric] ?? analysisXMetrics[0];
  /**
   * 散点坐标走 analysis 接口。
   *
   * 原先是拿榜单前 100 条的模型卡自己算 x/y：值本身没错，但选择器能选到第 100 名
   * 开外的模型时就没有坐标了。接口还会**排除任一坐标为空的模型**，所以点数可能
   * 少于选中数——这是预期行为，不是丢数据。
   *
   * 原型在这里另加过 scoreJitter（人为抖动）和 (1 - yMetric*0.018) 的衰减，用来把
   * mock 的十来个点摊开、并伪造出「切换 Y 指标」的效果，会让图上坐标对不上榜单
   * （61.3 显示成 60.9），已删除。
   */
  const { points: analysisPoints } = useDiscoveryAnalysis(
    modality,
    task,
    chartModels.map((model) => model.sourceModelId),
    activeXAxis.source,
    Boolean(constrainedAnalysisProfile) && yMetric === 1,
  );
  const chartData = chartModels
    .map((model) => {
      const point = analysisPoints.get(model.sourceModelId);
      return point ? { model, xValue: point.x, yValue: point.y } : undefined;
    })
    .filter((point): point is NonNullable<typeof point> => point !== undefined);
  /** Recharts 消费的散点数据：坐标 + 厂牌色 + 接入状态 + 能否跳详情。 */
  const scatterPoints: AnalysisScatterPoint[] = chartData.map(({ model, xValue, yValue }) => ({
    clickable: canOpenModelDetail(model),
    color: providerColor(model.provider),
    connected: isModelConnected(model),
    name: model.name,
    provider: model.provider,
    x: xValue,
    y: yValue,
  }));
  const xTicks = createAxisTicks(chartData.map((point) => point.xValue));
  const yTicks = createAxisTicks(chartData.map((point) => point.yValue));
  const chartProviders = [...new Set(chartModels.map((model) => model.provider))];
  const xLowerIsBetter = activeXAxis.lowerIsBetter;
  const xUnit = activeXAxis.unit;
  const activeYAxisLabel = analysisYMetrics[yMetric];
  const yUnit = constrainedAnalysisProfile && yMetric === 1
    ? constrainedAnalysisProfile.xMetrics.find((metric) => metric.source === "price")?.unit ?? taskProfile.valueUnit
    : taskProfile.qualityUnit;
  /**
   * 近 7 日使用趋势走 usage-trends 接口。
   *
   * 原型这里是编的：一组固定的 7 天系数（0.68→1）乘当前用量，再按模型序号微调，
   * 所有模型的曲线形状一模一样，增长率也是由这组假值算出来的。
   *
   * 接口的 growth_rate 是小数（0.5 = +50%），且**可能为 null** —— 序列不足两个点
   * （系统刚上线只有一天快照），或起点用量为 0，都算不出增长率。这类模型不进
   * 趋势图，而不是当成 0% 画一根空柱。
   *
   * **当期用量为 0 的也不进**：那种模型 growth_rate 恒为 -1，画出来是一根触底的
   * -100% 柱子。上周有量、这周归零，这是"停用"，不是"趋势"——图要回答的是谁在涨
   * 谁在跌。test 环境近 7 日几乎没有调用量，7 根柱子全是 -100%、图例 6 条也全是
   * -100%，整张图看起来像坏了（2026-09-03 视觉验收）。
   */
  // 用量筛选交给接口：没有快照数据的模型本就不会出现在 usage-trends 的返回里
  const trendModels = chartModels.filter((model) => isModelConnected(model));
  const { data: trendData } = useDiscoveryTrends(modality, task, trendModels.map((model) => model.sourceModelId));
  const trendSeries = trendModels
    .map((model) => {
      const remote = trendData?.models.find((item) => item.source_model_id === model.sourceModelId);
      if (!remote || remote.growth_rate === null) return undefined;
      if (remote.current_usage === null || remote.current_usage <= 0) return undefined;
      return {
        model,
        color: providerColor(model.provider),
        growth: Math.round(remote.growth_rate * 100),
        // 用量取接口的当期值（本地模型对象来自 model-options，不带用量）
        usage: compactUsage(remote.current_usage),
      };
    })
    .filter((series): series is NonNullable<typeof series> => series !== undefined)
    .sort((left, right) => right.growth - left.growth);
  const trendUsageLabel = modality === "text" ? "近 7 日 Token 用量" : taskProfile.usageLabel;
  /* 空态要说清是哪一种「没有」，否则用户只看到一句「暂无」，分不清是自己没选模型、
     还是平台确实没数据。 */
  const trendEmptyHint = trendModels.length === 0
    ? "选择已接入模型后查看趋势"
    : trendData && trendData.models.some((item) => Number(item.current_usage) > 0)
      ? "所选模型暂无足够的历史快照，无法计算增长率"
      : "所选模型近 7 日没有调用量，暂无趋势可比";
  /** Recharts 消费的趋势数据。增长率保留正负号，负增长由零线之下的柱子表达。 */
  const trendPoints: TrendChartPoint[] = trendSeries.map((series) => ({
    color: series.color,
    growth: series.growth,
    growthLabel: formatGrowth(series.growth),
    name: series.model.name,
    provider: series.model.provider,
    usage: series.usage,
  }));

  function toggleChartModel(modelName: string) {
    setSelectedModelNames((current) => current.includes(modelName) ? current.filter((name) => name !== modelName) : [...current, modelName]);
  }

  function toggleProvider(provider: string) {
    setProviderFilter((current) => current.includes(provider) ? current.filter((item) => item !== provider) : [...current, provider]);
  }

  function formatXAxisTick(value: number) {
    if (activeXAxis.source === "price") return `$${compactNumber(value)}`;
    return compactNumber(value);
  }

  function formatYAxisTick(value: number) {
    return compactNumber(value);
  }

  function switchModality(next: ModalityKey) {
    const nextConfig = discoveryConfigFor(next);
    const nextTask = nextConfig.tasks[0];
    setModality(next);
    setTask(nextTask);
    setYMetric(0);
    setXMetric(0);
    setModelFilterSearch("");
    setRankingMetric("overall");
    setProviderFilter([]);
    setTableAccess("all");
  }

  function switchTask(nextTask: string) {
    setTask(nextTask);
    setYMetric(0);
    setXMetric(0);
    setRankingMetric("overall");
  }

  function viewFullRanking() {
    setRankingMetric("overall");
    setTablePage(1);
    requestAnimationFrame(() => {
      document.getElementById("model-discovery-full-ranking")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function applyPreset(index: number) {
    const preset = analysisPresets[index];
    setYMetric(preset.y);
    setXMetric(preset.x);
  }

  return (
    <div className="model-discovery-page">
      <header className="model-discovery-head">
        <div className="model-discovery-head-copy">
          <h1>模型发现</h1>
          <p>
            聚合业界评测、专业分析与 ModelGo 平台数据，帮助团队完成模型选型
            {/* 每日 08:30 刷新一次，不是实时值；同步失败时接口继续返回上一次成功的
                快照，日期会停在旧值——所以这里必须展示接口回传的真实日期。
                挂在副标题末尾而不是标题旁：它是数据的时效说明，和副标题同属元信息，
                贴在 44px 大标题右边只会像一块补丁。 */}
            <span className="model-discovery-snapshot">{snapshotDate ? `数据快照 ${snapshotDate}` : "数据快照加载中"}</span>
          </p>
        </div>
        <Button onClick={onViewAllModels} size="sm" type="button" variant="brand-outline">
          返回模型广场<LuArrowUpRight size={13} />
        </Button>
      </header>

      {/* 一级模态导航 + 范围筛选同一行（§3.2 模块 2 / 3）。
          两者都是"缩小看什么"的控件，原先模态 tab 独占一行、范围控件被放进下面的
          taskbar，而 Agent 模态没有二级任务，那一行就只剩右端一个孤零零的控件、
          左边整片空白（2026-09-03 视觉验收）。合到一行后 Agent 下省掉整行。 */}
      <div className="model-discovery-modality-bar">
        <Tabs onValueChange={(value) => switchModality(value as ModalityKey)} value={modality}>
          <TabsList aria-label="模型模态" variant="underline">
            {modalityOptions.map((option) => (
              <TabsTrigger key={option.key} value={option.key} variant="underline">{option.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Tabs className="ml-auto" onValueChange={(value) => setScope(value as typeof scope)} value={scope}>
          <TabsList aria-label="模型范围" variant="pills">
            <TabsTrigger value="all" variant="pills">全部行业模型</TabsTrigger>
            <TabsTrigger value="supported" variant="pills">仅看已接入</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* 二级任务 tab：Agent 无二级任务（§3.2 模块可见性），整行不渲染 */}
      {modality !== "agent" && (
        <div className="model-discovery-taskbar">
          <Tabs onValueChange={switchTask} value={task}>
            <TabsList aria-label="任务类型" variant="underline">
              {config.tasks.map((item) => <TabsTrigger key={item} value={item} variant="underline">{item}</TabsTrigger>)}
            </TabsList>
          </Tabs>
        </div>
      )}

      <section className="model-discovery-overview">
        <article className="mg-tile model-discovery-rank-card">
          <div className="model-discovery-card-head"><div><h2>{task} Top 5</h2><span>{taskProfile.qualityBasis}</span></div></div>
          <div className="model-discovery-rank-head"><span>#</span><span>模型</span><span>接入状态</span><span>{taskProfile.qualityLabel}<em className="model-discovery-source-tag">{metricSource}</em></span></div>
          {discoveryLoading && visibleModels.length === 0 && [0, 1, 2, 3, 4].map((i) => (
            <div className="model-discovery-rank-row" key={`skeleton-${i}`}>
              <span className="animate-pulse bg-mg-fill-2 rounded-sm h-3 w-3" />
              <strong className="animate-pulse bg-mg-fill-2 rounded-sm h-4 w-2/3" />
              <em className="animate-pulse bg-mg-fill-2 rounded-full h-4 w-16" />
              <div className="animate-pulse bg-mg-fill-2 rounded-sm h-3 w-full" />
            </div>
          ))}
          {visibleModels.slice(0, 5).map((model, index) => {
            const hasDetail = canOpenModelDetail(model);
            return <div aria-label={hasDetail ? modelDetailAriaLabel(model) : undefined} className={`model-discovery-rank-row ${hasDetail ? "model-discovery-row-clickable" : ""}`} key={model.name} onClick={hasDetail ? () => openModelDetail(model) : undefined} onKeyDown={hasDetail ? (event) => handleModelRowKeyDown(event, model) : undefined} role={hasDetail ? "link" : undefined} tabIndex={hasDetail ? 0 : undefined}><span>{index + 1}</span><strong className="model-discovery-rank-name"><DiscoveryModelIcon model={model.name} provider={model.provider} /><span><span title={model.name}>{model.name}</span><small>{model.provider}</small></span></strong><em className={isModelConnected(model) ? "supported" : "pending"}>{modelAccessLabel(model)}</em><div><i style={{ width: `${rankBarWidth(model, visibleModels.slice(0, 5), scoreAscending)}%` }} /><b>{model.score}</b></div></div>;
          })}
          <div className="model-discovery-rank-more"><button onClick={viewFullRanking} type="button">查看更多<LuChevronDown size={13} /></button></div>
        </article>
        <div className={`model-discovery-summary-grid cards-${summaryCards.length}`}>
          {summaryCards.map((item, index) => (
            <article className={`mg-tile model-discovery-summary-card ${summaryCards.length % 2 === 1 && index === summaryCards.length - 1 ? "wide" : ""}`} key={item.label}>
              <span>{item.label}<InfoTip align="end" className="ml-auto" text={item.tooltip} /></span>
              <div className="model-discovery-summary-content">
                <div className="model-discovery-summary-model">
                  <DiscoveryModelIcon model={item.model} provider={item.provider} />
                  <strong>{item.model}</strong>
                </div>
                <div className="model-discovery-summary-value"><b>{item.value}</b><small>{item.unit}</small></div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="model-discovery-section">
        <div className="model-discovery-section-head"><div><h2>专项指标排行</h2></div></div>
        <div className="model-discovery-specialties">{rankingCards.map((item) => {
          const rows = specialtyRows(item.title, visibleModels, { scoreAscending });
          // 柱子此前有 hover 效果和 tabIndex，却没有任何点击行为——看着可点其实是死的。
          // 从当前榜单里找回完整模型对象后接上跳详情，跳不了的就不给可点的样子。
          const barModelOf = (name: string) => visibleModels.find((model) => model.name === name);
          return <article className="mg-tile" key={item.title}>
            <header><div><h3>{item.title}</h3><p title={item.description}>{item.description}<em className="model-discovery-source-tag">{item.source}</em></p></div><span>Top {rows.length}</span></header>
            <SpecialtyBarChart
              description={item.description}
              hoveredModel={hoveredModel}
              isClickable={(name) => {
                const model = barModelOf(name);
                return Boolean(model && canOpenModelDetail(model));
              }}
              onHoverModel={setHoveredModel}
              onOpenModel={(name) => {
                const model = barModelOf(name);
                if (model) openModelDetail(model);
              }}
              rows={rows}
            />
          </article>;
        })}</div>
      </section>

      {(modality !== "audio" || task === "语音合成（TTS）") && <section className="model-discovery-section">
        <div className="model-discovery-section-head"><div><h2>模型能力多维分析</h2></div></div>
        <div className="mg-tile model-discovery-analysis-card">
          <div className="model-discovery-analysis-tools">
            <div className="model-discovery-presets">{analysisPresets.map((preset, index) => <button className={preset.y === yMetric && preset.x === xMetric ? "active" : ""} key={preset.label} onClick={() => applyPreset(index)} type="button">{preset.label}</button>)}</div>
            <div className="model-discovery-selects">
              <span className="model-discovery-fixed-axis">纵轴<strong>{activeYAxisLabel}</strong></span>
              <span className="model-discovery-fixed-axis">横轴<strong>{activeXAxis.label}</strong></span>
              <button className={pareto ? "active" : ""} onClick={() => setPareto((current) => !current)} type="button"><LuSlidersHorizontal size={12} />优选区</button>
            </div>
          </div>
          <div className="model-discovery-analysis-grid">
            <div className={`model-discovery-scatter ${pareto ? "show-pareto" : ""}`}>
              <div className="model-discovery-scatter-legend">
                {chartProviders.map((provider) => <span key={provider}><i style={{ "--legend-color": providerColor(provider) } as CSSProperties} />{provider}</span>)}
                <em>实心：已接入 · 空心：暂未接入</em>
              </div>
              <AnalysisScatterChart
                formatX={formatXAxisTick}
                formatY={formatYAxisTick}
                hoveredModel={hoveredModel}
                onHoverModel={setHoveredModel}
                onOpenModel={(name) => {
                  const model = chartModels.find((item) => item.name === name);
                  if (model) openModelDetail(model);
                }}
                pareto={pareto}
                points={scatterPoints}
                xLabel={activeXAxis.label}
                xLowerIsBetter={xLowerIsBetter}
                xTicks={xTicks}
                xUnit={xUnit}
                yLabel={activeYAxisLabel}
                yTicks={yTicks}
                yUnit={yUnit}
              />
            </div>
            <aside className="model-discovery-analysis-aside">
              <div className="mg-tile model-discovery-model-filter">
                <h3><LuListFilter size={14} />模型筛选</h3><p>选择需要在图表中对比的模型。</p>
                {/* 走 ui/Popover 而不是自己 absolute 定位：组件统一了玻璃表面、
                    --mg-z-popover 层级、点击外部与 ESC 关闭、视口边缘避让。
                    原先这里是手写浮层 + 硬编码 z-index:20，绕开了全局层级体系。 */}
                <Popover
                  className="model-discovery-model-filter-panel"
                  position="bottom"
                  trigger={
                    <button className="model-discovery-model-filter-trigger" type="button">
                      <span>{chartModels.length} / {chartCandidates.length} 个模型</span>
                      <LuChevronDown size={14} />
                    </button>
                  }
                  content={
                    <>
                      <label><LuSearch size={14} /><input autoFocus placeholder="搜索模型" value={modelFilterSearch} onChange={(event) => setModelFilterSearch(event.target.value)} /></label>
                      <div className="model-discovery-model-filter-list">
                        {filteredModelOptions.map((model) => <button className={selectedModelNames.includes(model.name) ? "selected" : ""} key={model.name} onClick={() => toggleChartModel(model.name)} type="button"><DiscoveryModelIcon model={model.name} provider={model.provider} /><span><strong title={model.name}>{model.name}</strong><small>{model.provider}</small></span>{selectedModelNames.includes(model.name) && <LuCheck size={14} />}</button>)}
                        {filteredModelOptions.length === 0 && <em>未找到匹配模型</em>}
                      </div>
                      <footer><button onClick={() => setSelectedModelNames([])} type="button"><LuX size={13} />清空</button><button onClick={() => setSelectedModelNames(chartCandidates.map((model) => model.name))} type="button"><LuCheckCheck size={13} />全选</button><button onClick={() => setSelectedModelNames(visibleModels.slice(0, 7).map((model) => model.name))} type="button"><LuRotateCcw size={13} />恢复默认</button></footer>
                    </>
                  }
                />
              </div>
              <div className="mg-tile model-discovery-trend"><h3><LuTrendingUp size={14} />近 7 日 ModelGo 使用趋势</h3><p>按增长率从高到低排列</p>
                {trendSeries.length > 0
                  ? <><TrendBarChart points={trendPoints} usageLabel={trendUsageLabel} /><div className="model-discovery-trend-legend">{trendSeries.map((series) => <span key={series.model.name}><i style={{ "--trend-color": series.color } as CSSProperties} /><strong title={series.model.name}>{series.model.name}</strong><b>{formatGrowth(series.growth)}</b></span>)}</div></>
                  : <div className="model-discovery-trend-empty">{trendEmptyHint}</div>}
              </div>
            </aside>
          </div>
        </div>
      </section>}

      <section className="model-discovery-section" id="model-discovery-full-ranking">
        <div className="model-discovery-section-head"><div><h2>完整指标榜单</h2></div></div>
        <div className="mg-tile model-discovery-table-card">
          <div className="model-discovery-table-tools">
            <div className="model-discovery-table-primary-filter">
              {/* 走控制台 Select（Radix）而不是原生 <select>：原生的下拉列表由操作系统渲染，
                  macOS 上是一层半透明系统材质，底下的表头文字会透出来，我们的 CSS 一行都够不着
                  （2026-09-03 视觉验收）。全站浮层要统一质感，就不能留原生下拉。 */}
              <SelectRoot onValueChange={(value) => setRankingMetric(value as RankingMetric)} value={selectedRankingOption.key}>
                <SelectTrigger aria-label="指标类型" className="model-discovery-select-trigger model-discovery-metric-trigger">
                  <LuChartColumn className="shrink-0" size={14} />
                  <span className="model-discovery-metric-label">指标类型</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableRankingMetricOptions.map((option) => <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>)}
                </SelectContent>
              </SelectRoot>
            </div>
            <div className="model-discovery-table-secondary-filters">
              <div className="model-discovery-provider-filter">
                <Popover
                  className="model-discovery-provider-filter-panel model-discovery-scope"
                  position="bottom"
                  trigger={
                    <button className="model-discovery-provider-filter-trigger" title={providerFilter.length > 0 ? providerFilter.join("、") : "全部厂商"} type="button">
                      <span>{providerFilter.length === 0 ? "全部厂商" : providerFilter.slice(0, 2).join("、")}</span>
                      {providerFilter.length > 2 && <em>+{providerFilter.length - 2}</em>}
                      <LuChevronDown size={12} />
                    </button>
                  }
                  content={(close) => (
                    <>
                      <header><div><strong>选择厂商</strong><span>{providerFilter.length === 0 ? "当前展示全部" : `已选择 ${providerFilter.length} 个`}</span></div><button disabled={providerFilter.length === 0} onClick={() => setProviderFilter([])} type="button">重置</button></header>
                      <div className="model-discovery-provider-options">{providers.map((provider) => {
                        const selected = providerFilter.includes(provider);
                        return <button aria-pressed={selected} className={selected ? "selected" : ""} key={provider} onClick={() => toggleProvider(provider)} type="button"><i>{selected && <LuCheck size={11} />}</i><span>{provider}</span></button>;
                      })}</div>
                      <footer><span>{providerFilter.length === 0 ? `${providers.length} 个厂商` : `筛选 ${providerFilter.length} 个厂商`}</span><button onClick={close} type="button">完成</button></footer>
                    </>
                  )}
                />
              </div>
              <SelectRoot onValueChange={(value) => setTableAccess(value as "all" | "supported" | "pending")} value={tableAccess}>
                <SelectTrigger aria-label="接入状态" className="model-discovery-select-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部接入状态</SelectItem>
                  <SelectItem value="supported">已接入</SelectItem>
                  <SelectItem value="pending">暂未接入</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>
          </div>
          {/* 语义表格（plan §3.2 模块 7：走现有 Table + Pagination，不手写表格体系）。
              Table 自带 overflow-auto 包装，故不再套 .model-discovery-table-scroll。 */}
          <Table className="model-discovery-table">
            <TableHeader>
              <TableRow>
                <TableHead>排名</TableHead>
                <TableHead align="left">模型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>
                  {selectedMetricHeader}<em className="model-discovery-source-tag">{selectedMetricSource}</em>
                </TableHead>
                {supportingMetricHeaders.map((header) => <TableHead key={header}>{header}</TableHead>)}
                <TableHead><span className="sr-only">操作</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableModels.length === 0 && tableLoading && Array.from({ length: 6 }, (_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  <TableCell colSpan={8}>
                    <div className="animate-pulse bg-mg-fill-2 rounded-sm h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
              {tableModels.length === 0 && !tableLoading && (
                <TableRow>
                  <TableCell align="center" colSpan={8}>当前筛选条件下没有模型</TableCell>
                </TableRow>
              )}
              {tableModels.map((model, index) => {
                const supportingValues = supportingMetrics(model);
                const hasDetail = canOpenModelDetail(model);
                return (
                  <TableRow
                    aria-label={hasDetail ? modelDetailAriaLabel(model) : undefined}
                    className={hasDetail ? "model-discovery-row-clickable" : undefined}
                    key={model.name}
                    onClick={hasDetail ? () => openModelDetail(model) : undefined}
                    onKeyDown={hasDetail ? (event) => handleModelRowKeyDown(event, model) : undefined}
                    role={hasDetail ? "link" : undefined}
                    tabIndex={hasDetail ? 0 : undefined}
                  >
                    <TableCell>{(safeTablePage - 1) * tablePageSize + index + 1}</TableCell>
                    <TableCell align="left"><strong className="model-discovery-cell-model"><DiscoveryModelIcon model={model.name} provider={model.provider} /><span><span title={model.name}>{model.name}</span><small>{model.provider}</small></span></strong></TableCell>
                    <TableCell>
                      <em className={isModelConnected(model) ? "supported" : "pending"}>{modelAccessLabel(model)}</em>
                    </TableCell>
                    <TableCell><b className="metric-primary">{selectedMetricValue(model)}</b></TableCell>
                    {supportingValues.map((value, valueIndex) => (
                      <TableCell key={`${model.name}-${valueIndex}`}>{value}</TableCell>
                    ))}
                    <TableCell>
                      {hasDetail
                        /* 文案按 PRD 原型：「查看详情 ↗」/ 禁用态「待支持」。
                           2026-09-03 owner 澄清「1:1 还原」的边界后改回来的 —— 文案属于
                           「字段」维度、真源是原型（CLAUDE.md 入场第 4 条的维度表）。
                           此前这里收成了纯图标 + 减号，理由写的是「20 行 × 四个字是整页最大的
                           视觉噪音，文案移到 title/aria-label 信息不丢」——那是拿视觉理由砍 PRD
                           字段，不成立。

                           这里用原生 button 而不是控制台 Button 组件，与本文件其余 14 处一致：
                           Button 带着控制台的整套规格（高度锁在 --mg-control-h-sm=36px、
                           modern-btn-* 用 !important 锁死中性色），而原型这颗是 27px 高的品牌蓝小
                           按钮（redesign.css:15645）——套组件就得靠层层 !important 对抗才能扳回来，
                           本页又是 1:1 例外。plan §3.2 要求的是表格体系走 Table + Pagination，
                           没有要求行内按钮换组件。样式见 discovery.css .model-discovery-detail-btn。 */
                        ? <button aria-label={modelDetailAriaLabel(model)} className="model-discovery-detail-btn" onClick={(event) => { event.stopPropagation(); openModelDetail(model); }} title="查看详情" type="button">查看详情<LuArrowUpRight size={13} /></button>
                        : <button aria-label={`${model.name} 暂未接入，待支持`} className="model-discovery-detail-btn" disabled title="暂未接入" type="button">待支持</button>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {/* 页码列表形态：PRD 原型的分页是「共 N 个模型 + ← 1 2 3 … →」，
              可点页码而不是单个「X / Y」指示器（原型 .model-discovery-table-pagination）。
              布局照原型、控件用 ui/Pagination 的 pageNumbers 模式（2026-09-03 为此加的一档）。 */}
          <Pagination
            mode="page"
            onPageChange={setTablePage}
            page={safeTablePage}
            pageNumbers
            pageSize={tablePageSize}
            total={tableTotal}
            // 原型的量词是「个模型」而不是通用的「条」
            totalLabel={`共 ${tableTotal} 个模型`}
          />
        </div>
      </section>

      {modality === "agent" && <AgentPopularityLeaderboard />}
    </div>
  );
}

export default ModelDiscoveryPage
