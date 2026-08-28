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
import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { InfoTip } from '@/components/ui/InfoTip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { Pagination } from '@/components/ui/Pagination'

type ModalityKey = "agent" | "text" | "image" | "video" | "audio";
type RankingMetric = "overall" | "value" | "price" | "usage";
type AgentPopularityPeriod = "day" | "week" | "month";
type AnalysisMetricSource = "price" | "performance" | "speed" | "latency" | "usage" | "samples" | "voices";

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

type TaskCostProfile = {
  total: number;
  answer: number;
  reasoning: number;
  cacheWrite: number;
  cacheHit: number;
  input: number;
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

type DiscoveryConfig = {
  label: string;
  tasks: string[];
  scoreLabel: string;
  summary: Array<{ label: string; model: string; value: string; unit: string }>;
  yMetrics: string[];
  xMetrics: string[];
  presets: Array<{ label: string; y: number; x: number }>;
  models: DiscoveryModel[];
  specialties: Array<{ title: string; description: string; rows: Array<{ model: string; value: string }> }>;
};

const domesticModelProviders = new Set([
  "Alibaba",
  "DeepSeek",
  "Doubao",
  "FunAudioLLM",
  "Kling",
  "Kuaishou",
  "MiniMax",
  "Moonshot",
  "PixVerse",
  "Qwen",
  "StepFun",
  "Tencent",
  "Wan",
  "Z.ai",
]);

function isDomesticModel(model: DiscoveryModel) {
  return domesticModelProviders.has(model.provider);
}

function isModelConnected(model: DiscoveryModel) {
  return isDomesticModel(model) ? model.supported : true;
}

function modelAccessLabel(model: DiscoveryModel) {
  if (!isDomesticModel(model)) return "ModelGo.ai 已接入";
  return model.supported ? "ModelGo 已接入" : "暂未接入 ModelGo";
}

function modelGoAiModelUrl(model: DiscoveryModel) {
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

const textTaskScores: Record<string, Record<string, string>> = {
  文本对话: { "Claude Opus 5": "63.1", "GPT-5.5": "61.7", "GLM 5.2": "58.9", "Qwen Max": "56.8", "DeepSeek V4 Flash": "55.9", "Kimi K2.6": "54.8", "Gemini 3.1 Pro": "54.2", "Grok 4.5": "53.6", "Llama 4 Maverick": "51.9", "MiniMax M2.7": "50.8" },
  代码生成: { "GPT-5.5": "78", "Claude Opus 5": "77", "DeepSeek V4 Flash": "73", "GLM 5.2": "71", "Qwen Max": "69", "Kimi K2.6": "63.8", "Gemini 3.1 Pro": "58.6", "Grok 4.5": "53.5", "Llama 4 Maverick": "48.3", "MiniMax M2.7": "43.1" },
  Agent: { "GPT-5.5": "54", "Claude Opus 5": "53", "Gemini 3.1 Pro": "50", "DeepSeek V4 Flash": "48", "Kimi K2.6": "46", "GLM 5.2": "45", "Qwen Max": "44", "Grok 4.5": "43", "Llama 4 Maverick": "38", "MiniMax M2.7": "36" },
};

const textAgentTaskCostTotals: Record<string, Record<string, number>> = {
  Agent: { "GPT-5.5": 1.45, "Claude Opus 5": 3.14, "Gemini 3.1 Pro": 0.68, "DeepSeek V4 Flash": 0.05, "Kimi K2.6": 0.94, "GLM 5.2": 0.39, "Qwen Max": 0.48, "Grok 4.5": 1.05, "Llama 4 Maverick": 0.06, "MiniMax M2.7": 0.22 },
  文本对话: { "Claude Opus 5": 2.34, "GPT-5.5": 1.23, "GLM 5.2": 0.32, "Qwen Max": 0.34, "DeepSeek V4 Flash": 0.03, "Kimi K2.6": 0.84, "Gemini 3.1 Pro": 0.56, "Grok 4.5": 0.84, "Llama 4 Maverick": 0.05, "MiniMax M2.7": 0.16 },
  代码生成: { "GPT-5.5": 1.45, "Claude Opus 5": 2.7, "DeepSeek V4 Flash": 0.04, "GLM 5.2": 0.38, "Qwen Max": 0.41, "Kimi K2.6": 0.92, "Gemini 3.1 Pro": 0.63, "Grok 4.5": 0.91, "Llama 4 Maverick": 0.06, "MiniMax M2.7": 0.19 },
};

function createTaskCostProfile(total: number): TaskCostProfile {
  const input = Number((total * 0.13).toFixed(2));
  const cacheHit = Number((total * 0.04).toFixed(2));
  const cacheWrite = Number((total * 0.08).toFixed(2));
  const reasoning = Number((total * 0.29).toFixed(2));
  const answer = Number(Math.max(0, total - input - cacheHit - cacheWrite - reasoning).toFixed(2));
  return { total, answer, reasoning, cacheWrite, cacheHit, input };
}

function taskCostProfileFor(task: string, model: DiscoveryModel): TaskCostProfile {
  const configuredTotal = textAgentTaskCostTotals[task]?.[model.name];
  if (configuredTotal !== undefined) return createTaskCostProfile(configuredTotal);
  const nameSeed = [...model.name].reduce((sum, character) => sum + character.codePointAt(0)!, 0);
  const baseline = task === "Agent" ? 0.18 : task === "代码生成" ? 0.12 : 0.08;
  return createTaskCostProfile(Number((baseline + nameSeed % 72 / 100).toFixed(2)));
}

function formatTaskCost(value: number) {
  return `$${value.toFixed(2)}`;
}

const openTextModels = new Set(["DeepSeek V4 Flash", "Qwen Max", "Llama 4 Maverick", "MiniMax M2.7"]);

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
    summary: [
      { label: "评分最高", model: "Claude Opus 5", value: "63.1", unit: "Index" },
      { label: "开源模型评分最高", model: "DeepSeek V4 Flash", value: "55.9", unit: "Index" },
      { label: "性价比最高", model: "DeepSeek V4 Flash", value: "223.6", unit: "Index / USD" },
      { label: "输出 TPS 最高", model: "GLM 5.2", value: "245", unit: "Tokens / 秒" },
      { label: "近 7 日 ModelGo 使用量最高", model: "GLM 5.2", value: "8.2B", unit: "Tokens" },
    ],
    yMetrics: ["Intelligence Index", "Coding Index", "Agentic Index"],
    xMetrics: ["输入价格", "输出价格", "输出 TPS", "首 Token 延迟", "近 7 日使用量"],
    presets: [
      { label: "质量 × 价格", y: 0, x: 0 },
      { label: "质量 × 输出 TPS", y: 0, x: 2 },
      { label: "质量 × 延迟", y: 0, x: 3 },
      { label: "上下文 × 价格", y: 6, x: 0 },
      { label: "质量 × 使用量", y: 0, x: 4 },
    ],
    models: [
      { name: "Claude Opus 5", provider: "Anthropic", supported: false, score: "63.1", performance: "188 tok/s", price: "$15/M", usage: "—" },
      { id: "gpt-5.5", name: "GPT-5.5", provider: "OpenAI", supported: true, score: "61.7", performance: "182 tok/s", price: "$0.80/M", usage: "6.4B" },
      { id: "glm-5.2", name: "GLM 5.2", provider: "Z.ai", supported: true, score: "58.9", performance: "245 tok/s", price: "$0.28/M", usage: "8.2B" },
      { id: "qwen-max", name: "Qwen Max", provider: "Qwen", supported: true, score: "56.8", performance: "216 tok/s", price: "$0.42/M", usage: "3.9B" },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", provider: "DeepSeek", supported: true, score: "55.9", performance: "230 tok/s", price: "$0.25/M", usage: "5.6B" },
      { id: "kimi-k2.6", name: "Kimi K2.6", provider: "Moonshot", supported: true, score: "54.8", performance: "171 tok/s", price: "$0.35/M", usage: "2.8B" },
      { name: "Gemini 3.1 Pro", provider: "Google", supported: false, score: "54.2", performance: "164 tok/s", price: "$1.20/M", usage: "—" },
      { name: "Grok 4.5", provider: "xAI", supported: false, score: "53.6", performance: "158 tok/s", price: "$2.10/M", usage: "—" },
      { name: "Llama 4 Maverick", provider: "Meta", supported: false, score: "51.9", performance: "151 tok/s", price: "$0.31/M", usage: "—" },
      { id: "minimax-m2.7", name: "MiniMax M2.7", provider: "MiniMax", supported: true, score: "50.8", performance: "147 tok/s", price: "$0.29/M", usage: "1.7B" },
    ],
    specialties: [
      { title: "性价比领先", description: "主指标 / 单次任务成本", rows: [{ model: "DeepSeek V4 Flash", value: "223.6" }, { model: "GLM 5.2", value: "210.4" }, { model: "Kimi K2.6", value: "156.6" }, { model: "Qwen Max", value: "135.2" }, { model: "GPT-5.5", value: "77.1" }] },
      { title: "输出 TPS", description: "每秒输出 Token 数", rows: [{ model: "GLM 5.2", value: "245 tok/s" }, { model: "DeepSeek V4 Flash", value: "230 tok/s" }, { model: "Qwen Max", value: "216 tok/s" }, { model: "Claude Opus 5", value: "188 tok/s" }, { model: "GPT-5.5", value: "182 tok/s" }] },
      { title: "首 Token 时延领先", description: "首 Token 响应时延", rows: [{ model: "GLM 5.2", value: "210 ms" }, { model: "DeepSeek V4 Flash", value: "230 ms" }, { model: "GPT-5.5", value: "260 ms" }, { model: "Qwen Max", value: "280 ms" }, { model: "Claude Opus 5", value: "310 ms" }] },
      { title: "近 7 日热度", description: "ModelGo 调用 Tokens", rows: [{ model: "GLM 5.2", value: "8.2B" }, { model: "GPT-5.5", value: "6.4B" }, { model: "DeepSeek V4 Flash", value: "5.6B" }, { model: "Qwen Max", value: "3.9B" }, { model: "Kimi K2.6", value: "2.8B" }] },
    ],
  },
  image: {
    label: "图像",
    tasks: ["文生图", "图片编辑"],
    scoreLabel: "Elo 评分",
    summary: [
      { label: "Elo 评分最高", model: "Imagen Ultra", value: "1286", unit: "Elo" },
      { label: "开源模型 Elo 最高", model: "Qwen Image", value: "1236", unit: "Elo" },
      { label: "性价比最高", model: "Seedream 4.5", value: "31.5", unit: "Elo / ($/1K 张)" },
      { label: "API 价格最低", model: "Hunyuan Image 3.0", value: "30", unit: "$/1K 张" },
      { label: "近 7 日 ModelGo 使用量最高", model: "GPT Image 2", value: "1.8M", unit: "成功任务" },
    ],
    yMetrics: ["Elo 评分"],
    xMetrics: ["标准单图价格", "近 7 日使用量"],
    presets: [
      { label: "质量 × 价格", y: 0, x: 0 },
      { label: "质量 × 使用量", y: 0, x: 1 },
      { label: "API 价格 × 使用量", y: 1, x: 1 },
    ],
    models: [
      { name: "Imagen Ultra", provider: "Google", supported: false, score: "1286", performance: "8.4 秒", price: "$80/1K 张", usage: "—", samples: "14,820" },
      { id: "gpt-image-2", name: "GPT Image 2", provider: "OpenAI", supported: true, score: "1274", performance: "6.8 秒", price: "$70/1K 张", usage: "1.8M", samples: "21,205" },
      { id: "doubao-seedream-4.5", name: "Seedream 4.5", provider: "Doubao", supported: true, score: "1261", performance: "4.6 秒", price: "$40/1K 张", usage: "1.2M", samples: "16,940" },
      { name: "FLUX.2 Pro", provider: "Black Forest Labs", supported: false, score: "1249", performance: "3.9 秒", price: "$71/1K 张", usage: "—", samples: "13,260" },
      { id: "qwen-image", name: "Qwen Image", provider: "Qwen", supported: true, score: "1236", performance: "5.1 秒", price: "$42/1K 张", usage: "640K", samples: "11,820" },
      { name: "Midjourney V7", provider: "Midjourney", supported: false, score: "1224", performance: "7.8 秒", price: "$80/1K 张", usage: "—", samples: "19,450" },
      { name: "Recraft V4", provider: "Recraft", supported: false, score: "1212", performance: "5.7 秒", price: "$50/1K 张", usage: "—", samples: "10,860" },
      { name: "Ideogram 3.0", provider: "Ideogram", supported: false, score: "1204", performance: "6.1 秒", price: "$60/1K 张", usage: "—", samples: "9,870" },
      { id: "hunyuan-image-3", name: "Hunyuan Image 3.0", provider: "Tencent", supported: true, score: "1191", performance: "5.4 秒", price: "$30/1K 张", usage: "380K", samples: "7,650" },
      { id: "kolors-2", name: "Kolors 2", provider: "Kuaishou", supported: true, score: "1182", performance: "5.9 秒", price: "$30/1K 张", usage: "310K", samples: "6,940" },
    ],
    specialties: [
      { title: "性价比领先", description: "Elo 评分 / 标准单图价格", rows: [{ model: "Seedream 4.5", value: "31.5" }, { model: "Qwen Image", value: "29.7" }, { model: "GPT Image 2", value: "18.2" }, { model: "FLUX.2 Pro", value: "17.6" }, { model: "Imagen Ultra", value: "15.4" }] },
      { title: "API 价格", description: "每 1K 张标准图像价格", rows: [{ model: "Hunyuan Image 3.0", value: "$30" }, { model: "Kolors 2", value: "$30" }, { model: "Seedream 4.5", value: "$40" }, { model: "Qwen Image", value: "$42" }, { model: "Recraft V4", value: "$50" }] },
      { title: "近 7 日热度", description: "ModelGo 成功任务量", rows: [{ model: "GPT Image 2", value: "1.8M" }, { model: "Seedream 4.5", value: "1.2M" }, { model: "Qwen Image", value: "640K" }, { model: "FLUX.2 Pro", value: "520K" }, { model: "Imagen Ultra", value: "410K" }] },
    ],
  },
  video: {
    label: "视频",
    tasks: ["文生视频", "图生视频"],
    scoreLabel: "Elo 评分",
    summary: [
      { label: "Elo 评分最高", model: "Veo 3.1", value: "1228", unit: "Elo" },
      { label: "开源模型 Elo 最高", model: "Wan 2.2", value: "1154", unit: "Elo" },
      { label: "性价比最高", model: "Kling Turbo", value: "2995", unit: "Elo / ($/min)" },
      { label: "API 价格最低", model: "Kling Turbo", value: "0.04", unit: "$/min" },
      { label: "近 7 日 ModelGo 使用量最高", model: "Veo 3.1", value: "286K", unit: "成功任务" },
    ],
    yMetrics: ["Elo 评分", "文生视频能力", "图生视频能力", "运动一致性"],
    xMetrics: ["每分钟价格", "近 7 日使用量"],
    presets: [{ label: "质量 × 价格", y: 0, x: 0 }, { label: "质量 × 使用量", y: 0, x: 1 }, { label: "API 价格 × 使用量", y: 1, x: 1 }],
    models: [
      { id: "veo-3.1-generate-preview", name: "Veo 3.1", provider: "Google", supported: true, score: "1228", performance: "68 秒", price: "$0.15/分钟", usage: "286K", samples: "11,873" },
      { name: "Runway Gen-5", provider: "Runway", supported: false, score: "1196", performance: "55 秒", price: "$0.18/分钟", usage: "—", samples: "9,420" },
      { id: "doubao-seedance-2.0", name: "Seedance 2.0", provider: "Doubao", supported: true, score: "1184", performance: "42 秒", price: "$0.09/分钟", usage: "241K", samples: "18,546" },
      { id: "Wan2.2-T2V-A14B", name: "Wan 2.2", provider: "Wan", supported: true, score: "1154", performance: "61 秒", price: "$0.06/分钟", usage: "198K", samples: "12,390" },
      { id: "kling-3.0-omni", name: "Kling Turbo", provider: "Kling", supported: true, score: "1142", performance: "49 秒", price: "$0.04/分钟", usage: "173K", samples: "16,773" },
      { name: "Sora 2", provider: "OpenAI", supported: false, score: "1133", performance: "72 秒", price: "$0.20/分钟", usage: "—", samples: "8,720" },
      { id: "kling-3.0", name: "Kling 3.0", provider: "Kling", supported: true, score: "1124", performance: "58 秒", price: "$0.08/分钟", usage: "156K", samples: "14,060" },
      { id: "hailuo-2.3", name: "Hailuo 2.3", provider: "MiniMax", supported: true, score: "1112", performance: "63 秒", price: "$0.07/分钟", usage: "139K", samples: "8,484" },
      { name: "Luma Ray 3", provider: "Luma", supported: false, score: "1098", performance: "66 秒", price: "$0.12/分钟", usage: "—", samples: "6,730" },
      { name: "PixVerse V5.5", provider: "PixVerse", supported: false, score: "1087", performance: "47 秒", price: "$0.06/分钟", usage: "—", samples: "4,928" },
    ],
    specialties: [
      { title: "性价比领先", description: "Elo 评分 / 每分钟价格", rows: [{ model: "Kling Turbo", value: "2995" }, { model: "Wan 2.2", value: "2417" }, { model: "Seedance 2.0", value: "1784" }, { model: "Veo 3.1", value: "1522" }, { model: "Runway Gen-5", value: "1210" }] },
      { title: "API 价格", description: "每分钟生成视频价格", rows: [{ model: "Kling Turbo", value: "$0.04" }, { model: "Wan 2.2", value: "$0.06" }, { model: "PixVerse V5.5", value: "$0.06" }, { model: "Hailuo 2.3", value: "$0.07" }, { model: "Kling 3.0", value: "$0.08" }] },
      { title: "近 7 日热度", description: "ModelGo 成功任务量", rows: [{ model: "Veo 3.1", value: "286K" }, { model: "Seedance 2.0", value: "241K" }, { model: "Wan 2.2", value: "198K" }, { model: "Kling Turbo", value: "173K" }, { model: "Runway Gen-5", value: "112K" }] },
    ],
  },
  audio: {
    label: "音频",
    tasks: ["语音合成（TTS）", "语音识别（STT）"],
    scoreLabel: "Elo 评分",
    summary: [
      { label: "评分最高", model: "Speech 2.8 HD", value: "1240", unit: "Elo" },
      { label: "开源模型评分最高", model: "CosyVoice 2", value: "1199", unit: "Elo" },
      { label: "性价比最高", model: "CosyVoice 2", value: "149", unit: "Elo / USD" },
      { label: "API 价格最低", model: "Kokoro 82M", value: "3", unit: "$/M 字符" },
      { label: "近 7 日 ModelGo 使用量最高", model: "Speech 2.8 HD", value: "3.6M", unit: "请求" },
    ],
    yMetrics: ["Elo 评分", "自然度 / 准确率", "稳定性"],
    xMetrics: ["公开价格", "近 7 日使用量"],
    presets: [{ label: "质量 × 价格", y: 0, x: 0 }, { label: "质量 × 使用量", y: 0, x: 1 }, { label: "API 价格 × 使用量", y: 1, x: 1 }],
    models: [
      { id: "MiniMax-speech-2.8-hd", name: "Speech 2.8 HD", provider: "MiniMax", supported: true, score: "1240", performance: "0.58 秒", price: "$8/M 字符", usage: "3.6M", samples: "2,290", voices: "8" },
      { name: "Eleven Multilingual V3", provider: "ElevenLabs", supported: false, score: "1221", performance: "0.64 秒", price: "$12/M 字符", usage: "—", samples: "1,791", voices: "8" },
      { id: "CosyVoice2-0.5B", name: "CosyVoice 2", provider: "FunAudioLLM", supported: true, score: "1199", performance: "0.49 秒", price: "$4/M 字符", usage: "2.1M", samples: "1,787", voices: "3" },
      { id: "gpt-audio-mini", name: "GPT Audio Mini", provider: "OpenAI", supported: true, score: "1186", performance: "0.42 秒", price: "$6/M 字符", usage: "1.9M", samples: "3,152", voices: "7" },
      { name: "Kokoro 82M", provider: "Hexgrad", supported: false, score: "1174", performance: "0.51 秒", price: "$3/M 字符", usage: "—", samples: "1,352", voices: "8" },
      { name: "Gemini TTS", provider: "Google", supported: false, score: "1162", performance: "0.55 秒", price: "$7/M 字符", usage: "—", samples: "2,616", voices: "8" },
      { name: "Azure Speech", provider: "Microsoft", supported: false, score: "1151", performance: "0.46 秒", price: "$9/M 字符", usage: "—", samples: "2,334", voices: "8" },
      { id: "sensevoice-small", name: "SenseVoice Small", provider: "FunAudioLLM", supported: true, score: "1139", performance: "0.47 秒", price: "$3/M 字符", usage: "1.3M", samples: "1,810", voices: "6" },
      { id: "whisper-large-v3", name: "Whisper Large V3", provider: "OpenAI", supported: true, score: "1128", performance: "0.53 秒", price: "$5/M 字符", usage: "1.1M", samples: "2,650", voices: "5" },
      { name: "Suno V5", provider: "Suno", supported: false, score: "1116", performance: "0.69 秒", price: "$10/M 字符", usage: "—", samples: "1,420", voices: "4" },
    ],
    specialties: [
      { title: "性价比领先", description: "任务得分 / 公开价格", rows: [{ model: "CosyVoice 2", value: "149" }, { model: "Kokoro 82M", value: "138" }, { model: "GPT Audio Mini", value: "121" }, { model: "Speech 2.8 HD", value: "116" }, { model: "Eleven Multilingual V3", value: "102" }] },
      { title: "API 价格", description: "每 1M 字符的公开 API 价格", rows: [{ model: "Kokoro 82M", value: "$3" }, { model: "SenseVoice Small", value: "$3" }, { model: "CosyVoice 2", value: "$4" }, { model: "Whisper Large V3", value: "$5" }, { model: "GPT Audio Mini", value: "$6" }] },
      { title: "近 7 日热度", description: "ModelGo 请求量", rows: [{ model: "Speech 2.8 HD", value: "3.6M" }, { model: "CosyVoice 2", value: "2.1M" }, { model: "GPT Audio Mini", value: "1.9M" }, { model: "Kokoro 82M", value: "1.4M" }, { model: "Eleven Multilingual V3", value: "980K" }] },
    ],
  },
};

const audioTaskConfigs: Record<string, Pick<DiscoveryConfig, "summary" | "models" | "specialties">> = {
  "语音合成（TTS）": {
    summary: [
      { label: "语音质量最高", model: "Inworld TTS 1.5 Max", value: "1240", unit: "Elo" },
      { label: "性价比最高", model: "CosyVoice 2", value: "299.8", unit: "Elo / USD" },
      { label: "API 价格最低", model: "CosyVoice 2", value: "$4", unit: "/ 1M 字符" },
      { label: "近 7 日 ModelGo 使用量最高", model: "Speech 2.8 HD", value: "3.6M", unit: "字符" },
    ],
    models: [
      { name: "Inworld TTS 1.5 Max", provider: "Inworld", supported: false, score: "1240", performance: "72.8 字符/秒", price: "$10/1M 字符", usage: "—", samples: "1,330" },
      { name: "Qwen Audio 3.0 TTS Plus", provider: "Alibaba", supported: false, score: "1229", performance: "68.2 字符/秒", price: "$27.6/1M 字符", usage: "—", samples: "1,781" },
      { name: "Simba 3.2", provider: "SpeechifyAI", supported: false, score: "1227", performance: "74.6 字符/秒", price: "$10/1M 字符", usage: "—", samples: "1,791" },
      { name: "Gemini 3.1 Flash TTS", provider: "Google", supported: false, score: "1210", performance: "86.4 字符/秒", price: "$18.3/1M 字符", usage: "—", samples: "3,152" },
      { name: "Luna TTS", provider: "VUI Labs", supported: false, score: "1209", performance: "61.8 字符/秒", price: "$80/1M 字符", usage: "—", samples: "1,787" },
      { name: "Sonic 3.5", provider: "Cartesia", supported: false, score: "1203", performance: "82.5 字符/秒", price: "$49/1M 字符", usage: "—", samples: "2,616" },
      { name: "StepAudio 2.5 TTS", provider: "StepFun", supported: false, score: "1201", performance: "57.9 字符/秒", price: "$85/1M 字符", usage: "—", samples: "1,503" },
      { id: "MiniMax-speech-2.8-hd", name: "Speech 2.8 HD", provider: "MiniMax", supported: true, score: "1196", performance: "54.3 字符/秒", price: "$8/1M 字符", usage: "3.6M", samples: "2,290" },
      { id: "CosyVoice2-0.5B", name: "CosyVoice 2", provider: "FunAudioLLM", supported: true, score: "1199", performance: "65.1 字符/秒", price: "$4/1M 字符", usage: "2.1M", samples: "1,787" },
      { name: "Eleven Multilingual V3", provider: "ElevenLabs", supported: false, score: "1191", performance: "59.7 字符/秒", price: "$12/1M 字符", usage: "—", samples: "2,334" },
    ],
    specialties: [
      { title: "性价比", description: "语音质量 Elo / API 价格", rows: [{ model: "CosyVoice 2", value: "299.8" }, { model: "Speech 2.8 HD", value: "149.5" }, { model: "Inworld TTS 1.5 Max", value: "124.0" }, { model: "Simba 3.2", value: "122.7" }, { model: "Eleven Multilingual V3", value: "99.3" }, { model: "Gemini 3.1 Flash TTS", value: "66.1" }, { model: "Qwen Audio 3.0 TTS Plus", value: "44.5" }, { model: "Sonic 3.5", value: "24.6" }, { model: "Luna TTS", value: "15.1" }, { model: "StepAudio 2.5 TTS", value: "14.1" }] },
      { title: "API 价格", description: "每 1M 字符的公开 API 价格", rows: [{ model: "CosyVoice 2", value: "$4" }, { model: "Speech 2.8 HD", value: "$8" }, { model: "Inworld TTS 1.5 Max", value: "$10" }, { model: "Simba 3.2", value: "$10" }, { model: "Eleven Multilingual V3", value: "$12" }, { model: "Gemini 3.1 Flash TTS", value: "$18.3" }, { model: "Qwen Audio 3.0 TTS Plus", value: "$27.6" }, { model: "Sonic 3.5", value: "$49" }, { model: "Luna TTS", value: "$80" }, { model: "StepAudio 2.5 TTS", value: "$85" }] },
      { title: "近 7 日使用量", description: "ModelGo 语音合成字符量", rows: [{ model: "Speech 2.8 HD", value: "3.6M" }, { model: "CosyVoice 2", value: "2.1M" }, { model: "Gemini 3.1 Flash TTS", value: "1.8M" }, { model: "Inworld TTS 1.5 Max", value: "1.5M" }, { model: "Eleven Multilingual V3", value: "1.2M" }, { model: "Simba 3.2", value: "980K" }, { model: "Qwen Audio 3.0 TTS Plus", value: "860K" }, { model: "Sonic 3.5", value: "720K" }, { model: "Luna TTS", value: "610K" }, { model: "StepAudio 2.5 TTS", value: "540K" }] },
    ],
  },
  "语音识别（STT）": {
    summary: [
      { label: "识别错误率最低", model: "Scribe v2", value: "2.2", unit: "% AA-WER" },
      { label: "API 价格最低", model: "Modulate STT VFast", value: "$0.42", unit: "/ 1K 分钟" },
      { label: "近 7 日 ModelGo 使用量最高", model: "Whisper Large V3 Turbo", value: "480K", unit: "音频分钟" },
    ],
    models: [
      { name: "Scribe v2", provider: "ElevenLabs", supported: false, score: "2.2%", performance: "60.2 ×", price: "$3.67/1K 分钟", usage: "—" },
      { name: "MAI Transcribe 1.5", provider: "Microsoft", supported: false, score: "2.4%", performance: "183.1 ×", price: "$6/1K 分钟", usage: "—" },
      { name: "Smallest AI Pulse Pro", provider: "Smallest.ai", supported: false, score: "2.4%", performance: "260.9 ×", price: "$4/1K 分钟", usage: "—" },
      { id: "voxtral-small", name: "Voxtral Small", provider: "Mistral", supported: true, score: "2.8%", performance: "66.7 ×", price: "$4/1K 分钟", usage: "260K" },
      { id: "gpt-transcribe", name: "GPT Transcribe", provider: "OpenAI", supported: true, score: "3.3%", performance: "41.5 ×", price: "$4.50/1K 分钟", usage: "330K" },
      { name: "Grok Speech to Text", provider: "xAI", supported: false, score: "4.0%", performance: "230.4 ×", price: "$1.67/1K 分钟", usage: "—" },
      { id: "nova-3", name: "Nova-3", provider: "Deepgram", supported: true, score: "5.2%", performance: "522.0 ×", price: "$4.30/1K 分钟", usage: "290K" },
      { name: "Parakeet TDT 0.6B V3", provider: "Together AI", supported: false, score: "4.5%", performance: "899.3 ×", price: "$1.50/1K 分钟", usage: "—" },
      { name: "Modulate STT VFast", provider: "Modulate", supported: false, score: "4.2%", performance: "63.8 ×", price: "$0.42/1K 分钟", usage: "—" },
      { id: "whisper-large-v3-turbo", name: "Whisper Large V3 Turbo", provider: "Groq", supported: true, score: "4.6%", performance: "114.6 ×", price: "$0.67/1K 分钟", usage: "480K" },
    ],
    specialties: [
      { title: "API 价格", description: "每 1,000 分钟音频转写价格", rows: [{ model: "Modulate STT VFast", value: "$0.42" }, { model: "Whisper Large V3 Turbo", value: "$0.67" }, { model: "Parakeet TDT 0.6B V3", value: "$1.50" }, { model: "Grok Speech to Text", value: "$1.67" }, { model: "Scribe v2", value: "$3.67" }, { model: "Voxtral Small", value: "$4.00" }, { model: "Smallest AI Pulse Pro", value: "$4.00" }, { model: "Nova-3", value: "$4.30" }, { model: "GPT Transcribe", value: "$4.50" }, { model: "MAI Transcribe 1.5", value: "$6.00" }] },
      { title: "近 7 日使用量", description: "ModelGo 识别音频分钟数", rows: [{ model: "Whisper Large V3 Turbo", value: "480K" }, { model: "GPT Transcribe", value: "330K" }, { model: "Nova-3", value: "290K" }, { model: "Voxtral Small", value: "260K" }, { model: "Scribe v2", value: "220K" }, { model: "Smallest AI Pulse Pro", value: "190K" }, { model: "Grok Speech to Text", value: "170K" }, { model: "MAI Transcribe 1.5", value: "150K" }, { model: "Parakeet TDT 0.6B V3", value: "120K" }, { model: "Modulate STT VFast", value: "90K" }] },
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

function formatMetricValue(value: number, template: string) {
  const suffix = template.replace(/^[\d.]+\s*/, "");
  if (suffix === "B") return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (suffix === "M") return `${(value / 1_000_000).toFixed(1)}M`;
  if (suffix === "K") return `${Math.round(value / 1_000)}K`;
  if (suffix.includes("秒")) return `${value < 1 ? value.toFixed(2) : value.toFixed(1)} 秒`;
  if (suffix) return `${Math.round(value)} ${suffix}`;
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
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

function chartPosition(value: number, ticks: number[]) {
  const minimum = ticks[0];
  const maximum = ticks[ticks.length - 1];
  if (maximum === minimum) return 50;
  return Math.max(0, Math.min(100, (value - minimum) / (maximum - minimum) * 100));
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

const leaderboardSupplementCatalog: Record<ModalityKey | "audio-stt", Array<[string, string]>> = {
  agent: [
    ["Claude Sonnet 4.8", "Anthropic"], ["GPT-5.4", "OpenAI"], ["Gemini 3.0 Flash", "Google"], ["Qwen3.5 Max", "Qwen"],
    ["DeepSeek V3.2", "DeepSeek"], ["Kimi K3", "Moonshot"], ["GLM 4.7", "Z.ai"], ["MiniMax M2.5", "MiniMax"],
    ["Llama 4 Scout", "Meta"], ["Grok 4.2", "xAI"], ["Qwen3 Coder", "Qwen"], ["Mistral Large 3", "Mistral"],
    ["Ling 3.0", "Alibaba"], ["Doubao Seed 2.0", "Doubao"],
  ],
  text: [
    ["Claude Sonnet 4.8", "Anthropic"], ["GPT-5.4", "OpenAI"], ["Gemini 3.0 Flash", "Google"], ["Qwen3.5 Max", "Qwen"],
    ["DeepSeek V3.2", "DeepSeek"], ["Kimi K3", "Moonshot"], ["GLM 4.7", "Z.ai"], ["MiniMax M2.5", "MiniMax"],
    ["Llama 4 Scout", "Meta"], ["Grok 4.2", "xAI"], ["Qwen3 Coder", "Qwen"], ["Mistral Large 3", "Mistral"],
    ["Ling 3.0", "Alibaba"], ["Doubao Seed 2.0", "Doubao"],
  ],
  image: [
    ["Nano Banana Pro", "Google"], ["GPT Image 1.5", "OpenAI"], ["Seedream 4.0", "Doubao"], ["FLUX.2 Max", "Black Forest Labs"],
    ["Qwen Image Edit", "Qwen"], ["Midjourney V6.1", "Midjourney"], ["Recraft V3", "Recraft"], ["Ideogram 2.0", "Ideogram"],
    ["Hunyuan Image 3.0", "Tencent"], ["Kolors 2", "Kuaishou"], ["Imagen 4 Fast", "Google"], ["FLUX.1 Kontext", "Black Forest Labs"],
    ["SeedEdit 3.0", "Doubao"], ["Qwen Image Plus", "Qwen"],
  ],
  video: [
    ["Veo 3.0 Fast", "Google"], ["Runway Gen-4.5", "Runway"], ["Seedance 1.5 Pro", "Doubao"], ["Wan 2.1", "Wan"],
    ["Kling 2.6 Pro", "Kling"], ["Hailuo 2.3", "MiniMax"], ["PixVerse V5.5", "PixVerse"], ["Luma Ray 2", "Luma"],
    ["Sora 2", "OpenAI"], ["Vidu Q2", "Tencent"], ["HunyuanVideo 1.5", "Tencent"], ["Kling 2.5 Turbo", "Kling"],
    ["Wan 2.0 Flash", "Wan"], ["Seedance Lite", "Doubao"],
  ],
  audio: [
    ["Realtime TTS 1.5", "Inworld"], ["Lightning V3.1 Pro", "Smallest.ai"], ["Cartesia Sonic 3", "Cartesia"], ["Eleven Flash v2.5", "ElevenLabs"],
    ["Qwen TTS Turbo", "Alibaba"], ["StepAudio TTS Mini", "StepFun"], ["MiniMax Speech 2.6", "MiniMax"], ["CosyVoice 1.5", "FunAudioLLM"],
    ["Gemini 2.5 Flash TTS", "Google"], ["Azure Neural Voice", "Microsoft"], ["OpenAI TTS 1", "OpenAI"], ["MeloTTS Large", "FunAudioLLM"],
    ["SenseVoice TTS", "FunAudioLLM"], ["Qwen Voice 2", "Qwen"],
  ],
  "audio-stt": [
    ["Whisper Large V3", "OpenAI"], ["Nova-2", "Deepgram"], ["Voxtral Mini", "Mistral"], ["SenseVoice Small", "FunAudioLLM"],
    ["Paraformer V2", "Alibaba"], ["Qwen ASR Turbo", "Qwen"], ["Gemini 2.5 Flash ASR", "Google"], ["Azure Speech V4", "Microsoft"],
    ["Assembly Universal 2", "AssemblyAI"], ["Moonshine V2", "Moonshot"], ["StepAudio ASR", "StepFun"], ["MiniMax Audio ASR", "MiniMax"],
    ["Doubao ASR 2.0", "Doubao"], ["Tencent ASR Pro", "Tencent"],
  ],
};

function leaderboardSupplementModels(modality: ModalityKey, task: string) {
  const supplementCount = 14;
  const catalogKey = modality === "audio" && task === "语音识别（STT）" ? "audio-stt" : modality;
  return leaderboardSupplementCatalog[catalogKey].slice(0, supplementCount).map(([name, provider], index): DiscoveryModel => {
    const domestic = domesticModelProviders.has(provider);
    const supported = domestic && index % 5 !== 4;
    const releaseMonth = `${2025 + Math.floor((index + 8) / 12)}-${String((index + 8) % 12 + 1).padStart(2, "0")}`;
    if (modality === "image") return { id: supported ? `mock-image-${index + 1}` : undefined, name, provider, supported, score: `${1172 - index * 7}`, performance: `${7.9 + index * 0.42} 秒`, price: `$${36 + index * 5}/1K 张`, usage: index % 4 === 1 ? "—" : `${Math.max(120, 590 - index * 31)}K`, release: releaseMonth };
    if (modality === "video") return { id: supported ? `mock-video-${index + 1}` : undefined, name, provider, supported, score: `${1129 - index * 8}`, performance: `${58 + index * 7} 秒`, price: `$${(0.22 + index * 0.035).toFixed(2)}/min`, usage: index % 4 === 2 ? "—" : `${Math.max(42, 210 - index * 12)}K`, release: releaseMonth };
    if (modality === "audio" && task === "语音识别（STT）") return { id: supported ? `mock-stt-${index + 1}` : undefined, name, provider, supported, score: `${(5.6 + index * 0.35).toFixed(1)}%`, performance: `${Math.round(108 + index * 39)} ×`, price: `$${(0.8 + index * 0.37).toFixed(2)}/1K 分钟`, usage: index % 4 === 0 ? "—" : `${Math.max(80, 310 - index * 16)}K`, release: releaseMonth };
    if (modality === "audio") return { id: supported ? `mock-tts-${index + 1}` : undefined, name, provider, supported, score: `${1184 - index * 5}`, performance: `${(53 - index * 1.4).toFixed(1)} 字符/秒`, price: `$${Math.round(9 + index * 4.5)}/1M 字符`, usage: index % 4 === 0 ? "—" : `${Math.max(0.3, 1.7 - index * 0.09).toFixed(1)}M`, release: releaseMonth };
    const scoreBase = modality === "agent" ? 35 : task === "代码生成" ? 47 : 49;
    const score = Math.max(20, scoreBase - index * 1.05);
    return { id: supported ? `mock-${modality}-${index + 1}` : undefined, name, provider, supported, score: score.toFixed(1), performance: `${Math.max(72, 146 - index * 4)} tok/s`, price: `$${(0.34 + index * 0.11).toFixed(2)}/M`, usage: index % 5 === 2 ? "—" : `${Math.max(0.4, 2.4 - index * 0.12).toFixed(1)}B`, release: releaseMonth };
  });
}

function completeSpecialtyRows(
  item: DiscoveryConfig["specialties"][number],
  models: DiscoveryModel[],
) {
  const existingNames = new Set(item.rows.map((row) => row.model));
  const candidates = models.filter((model) => !existingNames.has(model.name));
  const lastValue = metricValue(item.rows[item.rows.length - 1].value);
  const lowerIsBetter = /(生成耗时|延迟|时延|成本)/.test(item.description);
  const template = item.rows[item.rows.length - 1].value;
  const additions = candidates.map((model, index) => {
    const factor = lowerIsBetter ? 1 + (index + 1) * 0.09 : Math.max(0.18, 1 - (index + 1) * 0.075);
    return { model: model.name, value: formatMetricValue(lastValue * factor, template) };
  });
  return [...item.rows, ...additions].slice(0, 10).map((row) => ({
    ...row,
    provider: models.find((model) => model.name === row.model)?.provider ?? row.model,
  }));
}

/* 原型的 providerMarks（42 条厂牌首字母）已删除 —— 模型/厂牌标识改走 ModelIcon，
   见下面 DiscoveryModelIcon 的说明。下面这张色表还留着，只用于图表着色（趋势柱、
   散点点色与图例），不再参与图标渲染。
   ⚠️ 它同样是硬编码的厂牌色，而 @model-go/icons 导出了 brandColor(vendor, theme)
   ——  库里那份还按深浅双轴分了档（深蓝深紫在深底压不住、亮黄亮青在浅底压不住）。
   图表配色换过去是下一步，属独立改动，不混在图标这一刀里。 */
const providerMarkColors: Record<string, string> = {
  Anthropic: "#b56b48", OpenAI: "#111827", DeepSeek: "#315ec8", "Z.ai": "#3968d7",
  Qwen: "#6555ce", Moonshot: "#111827", Google: "#2b7de9", xAI: "#111827", Meta: "#2176d2",
  MiniMax: "#e64770", Kling: "#111827", Wan: "#4d6bc7", Doubao: "#2f73de", Runway: "#7b5bc7",
  "Black Forest Labs": "#374151", Midjourney: "#5d4fb6", Recraft: "#d35f45", Ideogram: "#1c8a72",
  Tencent: "#2876d2", Kuaishou: "#f08a39", ElevenLabs: "#7d4fc2", FunAudioLLM: "#227f71",
  Hexgrad: "#596579", Microsoft: "#2b75c9", Suno: "#9b4fbb", Luma: "#4d769e", PixVerse: "#c75c79",
  Inworld: "#24776f", Alibaba: "#e66b2e", SpeechifyAI: "#524fbe", "VUI Labs": "#596579", Cartesia: "#25845e", StepFun: "#2388a4",
  "Smallest.ai": "#24776f", Mistral: "#ec6a4c", Deepgram: "#6c55ce", "Together AI": "#111827", Modulate: "#59708d", Groq: "#e45a45",
  Mureka: "#c5598f", "Producer.ai": "#7555c7", "Stability.ai": "#34766e", Udio: "#305fc8",
};

/**
 * 模型 / 厂牌标识 —— 走控制台统一的 `ModelIcon`（`@model-go/icons` 是 vendor
 * 别名索引与厂牌主色的唯一真源，与运营后台共用同一份）。
 *
 * 原型自带 `providerMarks`（42 条首字母）+ `providerMarkColors`（42 条硬编码色）
 * 两张表，那正是 ModelIcon 注释里记的那起事故的翻版：控制台与运营后台各写一份
 * vendor 映射，条目对不上，通义千问的 embedding 模型因此渲染出 OpenAI 图标。
 * 所以图标这块不做 1:1 —— 原型用首字母是因为它没有图标库，不是设计意图；
 * UI flow 文档 §3.1 也明确「模型/厂商身份用 ModelIcon」。
 *
 * 唯一例外是热门 Agent 排行：那里按 PRD 显示应用名首字符（Agent 应用不是模型，
 * 图标库里没有它们），继续用 .model-discovery-model-mark。
 */
function DiscoveryModelIcon({ model, provider, className }: { model: string; provider: string; className?: string }) {
  return <ModelIcon className={className} model={{ display_name: model, provider }} rounded="rounded-sm" variant="dense" />;
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
            <i aria-hidden="true" className="model-discovery-model-mark model-discovery-agent-popularity-icon">{agent.name.trim().charAt(0)}</i>
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

const modelReleaseDates: Record<string, string> = {
  "Claude Opus 5": "2026-07", "GPT-5.5": "2026-06", "GLM 5.2": "2026-07", "Qwen Max": "2026-05", "DeepSeek V4 Flash": "2026-07",
  "Kimi K2.6": "2026-06", "Gemini 3.1 Pro": "2026-04", "Grok 4.5": "2026-05", "Llama 4 Maverick": "2026-03", "MiniMax M2.7": "2026-06",
  "Imagen Ultra": "2026-05", "GPT Image 2": "2026-07", "Seedream 4.5": "2026-06", "FLUX.2 Pro": "2026-05", "Qwen Image": "2026-04",
  "Midjourney V7": "2026-03", "Recraft V4": "2026-06", "Ideogram 3.0": "2026-02", "Hunyuan Image 3.0": "2026-05", "Kolors 2": "2026-04",
  "Veo 3.1": "2026-06", "Runway Gen-5": "2026-05", "Seedance 2.0": "2026-03", "Wan 2.2": "2026-04", "Kling Turbo": "2026-06",
  "Sora 2": "2026-05", "Kling 3.0": "2026-02", "Hailuo 2.3": "2026-04", "Luma Ray 3": "2026-03", "PixVerse V5.5": "2026-05",
  "Speech 2.8 HD": "2026-06", "Eleven Multilingual V3": "2026-05", "CosyVoice 2": "2026-03", "GPT Audio Mini": "2026-04", "Kokoro 82M": "2025-12",
  "Gemini TTS": "2026-04", "Azure Speech": "2026-02", "Whisper Large V3": "2025-11", "SenseVoice Small": "2026-01", "Suno V5": "2026-05",
  "Inworld TTS 1.5 Max": "2026-01", "Qwen Audio 3.0 TTS Plus": "2026-07", "Simba 3.2": "2026-07", "Gemini 3.1 Flash TTS": "2026-04",
  "Luna TTS": "2026-06", "Sonic 3.5": "2026-05", "StepAudio 2.5 TTS": "2026-06", "Scribe v2": "2026-07", "MAI Transcribe 1.5": "2026-06",
  "Smallest AI Pulse Pro": "2026-05", "Voxtral Small": "2026-05", "GPT Transcribe": "2026-03", "Grok Speech to Text": "2026-06", "Nova-3": "2026-02",
  "Parakeet TDT 0.6B V3": "2026-04", "Modulate STT VFast": "2026-03", "Whisper Large V3 Turbo": "2026-01", "Suno V5.5": "2026-07",
  "Mureka V9": "2026-07", "Mureka V8": "2026-05", "Lyria 3 Pro": "2026-06", "Music 2.6": "2026-06", "Eleven Music v2": "2026-07",
  "FUZZ-1.1 Pro": "2026-05", "Stable Audio 2.0": "2025-11", "Udio v1.5 Allegro": "2025-09",
};

function ModelDiscoveryPage({ onOpenModel, onViewAllModels }: { onOpenModel: (modelId: string) => void; onViewAllModels: () => void }) {
  const [modality, setModality] = useState<ModalityKey>("agent");
  const config = discoveryConfigFor(modality);
  const [task, setTask] = useState(config.tasks[0]);
  const taskProfile = taskMetricProfiles[modality][task];
  const metricSource = taskMetricSources[modality][task];
  const audioTaskConfig = modality === "audio" ? audioTaskConfigs[task] : undefined;
  const configuredModels = audioTaskConfig?.models ?? config.models;
  const [scope, setScope] = useState<"all" | "supported">("all");
  const [yMetric, setYMetric] = useState(0);
  const [xMetric, setXMetric] = useState(0);
  const [pareto, setPareto] = useState(false);
  const [modelFilterOpen, setModelFilterOpen] = useState(false);
  const [modelFilterSearch, setModelFilterSearch] = useState("");
  const [selectedModelNames, setSelectedModelNames] = useState<string[]>(() => agentDiscoveryConfig.models.slice(0, 7).map((model) => model.name));
  const [rankingMetric, setRankingMetric] = useState<RankingMetric>("overall");
  const [providerFilter, setProviderFilter] = useState<string[]>([]);
  const [providerFilterOpen, setProviderFilterOpen] = useState(false);
  const [tableAccess, setTableAccess] = useState<"all" | "supported" | "pending">("all");
  const [tablePage, setTablePage] = useState(1);

  /**
   * 依赖先提取成变量：原型直接把 `taskProfile.qualityLowerIsBetter` 写进依赖数组，
   * React Compiler 无法对成员表达式保留 memoization（本仓 eslint 会报
   * "Compilation Skipped: Existing memoization could not be preserved"）。
   * 提出来行为不变，只是让编译器能正常优化。
   */
  const qualityLowerIsBetter = taskProfile.qualityLowerIsBetter;
  /**
   * eslint-disable react-hooks/preserve-manual-memoization —— 说明为什么豁免：
   *
   * React Compiler 报 "Existing memoization could not be preserved"，即它无法在
   * 保留这个手写 useMemo 的前提下做自己的优化。这是**优化层面的提示，不是正确性
   * 问题**：依赖数组是完整的（configuredModels / modality / task /
   * qualityLowerIsBetter 都在），textTaskScores 与 metricValue 是模块级常量不需入依赖。
   *
   * 不改成编译器偏好的写法，是因为本页要求与 PRD 原型 1:1，而改这里意味着重排
   * 排序逻辑的组织方式 —— 为一条优化提示动 1:1 复刻的代码不划算。真要治，应该
   * 整体评估这个文件是否交给 React Compiler 托管（去掉全部手写 memo），那是独立改动。
   */
  /* eslint-disable react-hooks/preserve-manual-memoization */
  const taskModels = useMemo(() => {
    const scores = modality === "text" || modality === "agent" ? textTaskScores[task] : undefined;
    return configuredModels
      .map((model) => {
        if (scores?.[model.name]) return { ...model, score: scores[model.name] };
        return model;
      })
      .sort((first, second) => qualityLowerIsBetter
        ? metricValue(first.score) - metricValue(second.score)
        : metricValue(second.score) - metricValue(first.score));
  }, [configuredModels, modality, task, qualityLowerIsBetter]);
  /* eslint-enable react-hooks/preserve-manual-memoization */
  const visibleModels = useMemo(
    () => taskModels.filter((model) => scope === "all" || isModelConnected(model)),
    [scope, taskModels],
  );
  const leaderboardModels = useMemo(() => {
    const existingNames = new Set(taskModels.map((model) => model.name));
    const supplements = leaderboardSupplementModels(modality, task).filter((model) => !existingNames.has(model.name));
    return [...taskModels, ...supplements];
  }, [modality, task, taskModels]);
  /**
   * 筛选条件变化时页码回第 1 页。
   *
   * 原型用的是 useEffect + setTablePage(1)，但本仓 eslint 开了
   * react-hooks/set-state-in-effect（effect 里同步 setState 会触发级联渲染）。
   * 改成 React 官方的「渲染期按上一次值调整状态」写法 —— 行为完全等价，
   * 且少一轮渲染：effect 版会先用旧页码渲染一次再纠正。
   * 这是实现方式的调整，不改任何 UI 与交互。
   */
  const tableFilterKey = `${modality}|${task}|${scope}|${rankingMetric}|${providerFilter.join(",")}|${tableAccess}`;
  const [lastTableFilterKey, setLastTableFilterKey] = useState(tableFilterKey);
  if (lastTableFilterKey !== tableFilterKey) {
    setLastTableFilterKey(tableFilterKey);
    setTablePage(1);
  }
  const constrainedAnalysisProfile = sourceConstrainedAnalysisProfiles[modality]?.[task];
  const isTextAgent = modality === "text" || modality === "agent";
  const analysisYMetrics = constrainedAnalysisProfile?.yMetrics ?? [taskProfile.qualityLabel, ...config.yMetrics.filter((metric) => metric !== taskProfile.qualityLabel)];
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
  const textValueRows = isTextAgent
    ? taskModels
      .map((model) => ({ model: model.name, value: (metricValue(model.score) / Math.max(taskCostProfileFor(task, model).total, 0.01)).toFixed(1) }))
      .sort((first, second) => metricValue(second.value) - metricValue(first.value))
    : [];
  const specialties = modality === "audio" && audioTaskConfig
    ? audioTaskConfig.specialties
    : isTextAgent
    ? [{ ...config.specialties[0], description: taskProfile.valueLabel, rows: textValueRows }, ...config.specialties.slice(1)]
    : config.specialties;
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
      rows: completeSpecialtyRows(specialties[0], taskModels),
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
      rows: completeSpecialtyRows(specialties[0], taskModels),
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
        .sort((first, second) => taskCostProfileFor(task, first).total - taskCostProfileFor(task, second).total)
        .map((model) => ({ model: model.name, value: formatTaskCost(taskCostProfileFor(task, model).total) })),
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
  const providers = [...new Set(leaderboardModels.map((model) => model.provider))];
  const availableRankingMetricOptions = isTextAgent
    ? rankingMetricOptions
    : modality === "audio" && task === "语音识别（STT）"
      ? [{ key: "overall", label: "识别准确率" }, { key: "price", label: "API 价格", specialtyIndex: 0 }, { key: "usage", label: "使用量", specialtyIndex: 1 }] satisfies typeof rankingMetricOptions
      : [{ key: "overall", label: modality === "audio" ? "语音质量" : "Elo 评分" }, { key: "value", label: "性价比", specialtyIndex: 0 }, { key: "price", label: "API 价格", specialtyIndex: 1 }, { key: "usage", label: "使用量", specialtyIndex: 2 }] satisfies typeof rankingMetricOptions;
  const selectedRankingOption = availableRankingMetricOptions.find((option) => option.key === rankingMetric) ?? availableRankingMetricOptions[0];
  const selectedSpecialty = selectedRankingOption.specialtyIndex === undefined ? undefined : specialties[selectedRankingOption.specialtyIndex];
  const selectedMetricRows = selectedSpecialty ? completeSpecialtyRows(selectedSpecialty, taskModels) : [];
  const selectedMetricValues = new Map(selectedMetricRows.map((row) => [row.model, row.value]));
  const selectedMetricOrder = new Map(selectedMetricRows.map((row, index) => [row.model, index]));
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
  const qualityLeader = taskModels[0];
  const openQualityLeader = taskModels.find((model) => openTextModels.has(model.name));
  const valueLeader = textValueRows[0];
  const summaryCards = (audioTaskConfig?.summary ?? config.summary).map((item, index) => !isTextAgent ? item : ({
      ...item,
      ...(isTextAgent && index === 0 && qualityLeader ? { model: qualityLeader.name, value: qualityLeader.score } : {}),
      ...(isTextAgent && index === 1 && openQualityLeader ? { model: openQualityLeader.name, value: openQualityLeader.score } : {}),
      ...(isTextAgent && index === 2 && valueLeader ? { model: valueLeader.model, value: valueLeader.value } : {}),
      label: index === 0 ? (isTextAgent ? "综合评分最高" : "Elo 评分最高") : item.label,
      unit: [taskProfile.qualityUnit, taskProfile.qualityUnit, taskProfile.valueUnit, taskProfile.speedUnit, taskProfile.usageUnit][index],
    })).map((item) => ({
      ...item,
      provider: taskModels.find((model) => model.name === item.model)?.provider
        ?? config.models.find((model) => model.name === item.model)?.provider
        ?? item.model,
    })).map((item, index) => ({ ...item, tooltip: summaryTooltipCopy[modality][task]?.[index] ?? item.label }));
  const filteredTableModels = leaderboardModels.filter((model) => scope === "all" || isModelConnected(model))
    .filter((model) => providerFilter.length === 0 || providerFilter.includes(model.provider))
    .filter((model) => tableAccess === "all" || (tableAccess === "supported" ? isModelConnected(model) : !isModelConnected(model)))
    .sort((first, second) => {
      if (rankingMetric === "overall") return taskProfile.qualityLowerIsBetter
        ? metricValue(first.score) - metricValue(second.score)
        : metricValue(second.score) - metricValue(first.score);
      if (isTextAgent && rankingMetric === "value") return tableMetricNumber(second) - tableMetricNumber(first);
      const firstOrder = selectedMetricOrder.get(first.name);
      const secondOrder = selectedMetricOrder.get(second.name);
      if (firstOrder !== undefined || secondOrder !== undefined) return (firstOrder ?? 999) - (secondOrder ?? 999);
      const firstValue = tableMetricNumber(first);
      const secondValue = tableMetricNumber(second);
      return rankingMetric === "price" ? firstValue - secondValue : secondValue - firstValue;
    });
  const tablePageSize = 20;
  const tablePageCount = Math.max(1, Math.ceil(filteredTableModels.length / tablePageSize));
  const safeTablePage = Math.min(tablePage, tablePageCount);
  const tableModels = filteredTableModels.slice(
    (safeTablePage - 1) * tablePageSize,
    safeTablePage * tablePageSize,
  );

  function canOpenModelDetail(model: DiscoveryModel) {
    const hasDestination = isDomesticModel(model) ? Boolean(model.id) : true;
    return isModelConnected(model) && hasDestination;
  }

  function modelDetailAriaLabel(model: DiscoveryModel) {
    return isDomesticModel(model)
      ? `查看 ${model.name} 模型详情`
      : `在 ModelGo.ai 查看 ${model.name} 模型`;
  }

  function openModelDetail(model: DiscoveryModel) {
    if (!canOpenModelDetail(model)) return;
    if (!isDomesticModel(model)) {
      window.open(modelGoAiModelUrl(model), "_blank", "noopener,noreferrer");
      return;
    }
    if (!model.id) return;
    onOpenModel(model.id);
  }

  // Top 5 卡的行是 div、完整榜单的行是 tr（Table 组件），故取二者共同的 HTMLElement
  function handleModelRowKeyDown(event: KeyboardEvent<HTMLElement>, model: DiscoveryModel) {
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
      const cost = isTextAgent ? taskCostProfileFor(task, model).total : plainMetricValue(model.price);
      return taskProfile.qualityLowerIsBetter ? 1 / Math.max(quality * cost, 0.01) : quality / Math.max(cost, 0.01);
    }
    return metricValue(model.score);
  }

  function supportingMetrics(model: DiscoveryModel) {
    return [isTextAgent ? formatTaskCost(taskCostProfileFor(task, model).total) : model.price, model.release ?? modelReleaseDates[model.name] ?? "—", model.usage];
  }

  const supportingMetricHeaders = isTextAgent
    ? ["单次任务成本", "发布时间", "ModelGo 使用量"]
    : ["公开价格", "发布时间", "ModelGo 使用量"];
  const chartModels = visibleModels.filter((model) => selectedModelNames.includes(model.name));
  const filteredModelOptions = visibleModels.filter((model) => model.name.toLowerCase().includes(modelFilterSearch.trim().toLowerCase()));
  const speedValueMap = new Map(specialties[1] ? completeSpecialtyRows(specialties[1], taskModels).map((row) => [row.model, metricValue(row.value)]) : []);
  const latencyValueMap = new Map(specialties[2] ? completeSpecialtyRows(specialties[2], taskModels).map((row) => [row.model, metricValue(row.value)]) : []);
  const activeXAxis = analysisXMetrics[xMetric] ?? analysisXMetrics[0];
  const chartData = chartModels.map((model, index) => {
    const xValue = activeXAxis.source === "price"
      ? isTextAgent ? taskCostProfileFor(task, model).total : plainMetricValue(model.price)
      : activeXAxis.source === "performance"
        ? metricValue(model.performance)
      : activeXAxis.source === "speed"
        ? speedValueMap.get(model.name) ?? metricValue(model.performance)
        : activeXAxis.source === "latency"
          ? latencyValueMap.get(model.name) ?? metricValue(model.performance)
          : activeXAxis.source === "samples"
            ? plainMetricValue(model.samples)
            : activeXAxis.source === "voices"
              ? plainMetricValue(model.voices)
              : metricValue(model.usage);
    const baseScore = constrainedAnalysisProfile && yMetric === 1 ? plainMetricValue(model.price) : metricValue(model.score);
    const scoreJitter = baseScore > 100 ? ((index % 3) - 1) * 4 : ((index % 3) - 1) * 0.35;
    const yValue = constrainedAnalysisProfile ? baseScore : baseScore * (1 - yMetric * 0.018) + scoreJitter;
    return { model, xValue, yValue };
  });
  const xTicks = createAxisTicks(chartData.map((point) => point.xValue));
  const yTicks = createAxisTicks(chartData.map((point) => point.yValue));
  const chartProviders = [...new Set(chartModels.map((model) => model.provider))];
  const xLowerIsBetter = activeXAxis.lowerIsBetter;
  const xUnit = activeXAxis.unit;
  const activeYAxisLabel = analysisYMetrics[yMetric];
  const yUnit = constrainedAnalysisProfile && yMetric === 1
    ? constrainedAnalysisProfile.xMetrics.find((metric) => metric.source === "price")?.unit ?? taskProfile.valueUnit
    : taskProfile.qualityUnit;
  const trendModels = chartModels.filter((model) => isModelConnected(model) && model.usage !== "—");
  const trendSeries = trendModels.map((model, modelIndex) => {
    const base = Math.max(metricValue(model.usage), 1_000);
    const factors = [0.68, 0.74, 0.72, 0.81, 0.86, 0.92, 1];
    const values = factors.map((factor, dayIndex) => base * factor * (1 + modelIndex * 0.015 - dayIndex * modelIndex * 0.002));
    return {
      model,
      color: providerMarkColors[model.provider] ?? "#5472b8",
      values,
      growth: Math.round((values[6] / values[0] - 1) * 100),
      usage: model.usage,
    };
  }).sort((left, right) => right.growth - left.growth);
  const trendGrowthMaximum = Math.max(1, ...trendSeries.map((series) => series.growth));
  const trendGrowthMidpoint = Math.ceil(trendGrowthMaximum / 2);
  const trendUsageLabel = modality === "text" ? "近 7 日 Token 用量" : taskProfile.usageLabel;

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
    const nextModels = next === "audio" ? audioTaskConfigs[nextTask].models : nextConfig.models;
    setModality(next);
    setTask(nextTask);
    setYMetric(0);
    setXMetric(0);
    setModelFilterOpen(false);
    setModelFilterSearch("");
    setSelectedModelNames(nextModels.slice(0, 7).map((model) => model.name));
    setRankingMetric("overall");
    setProviderFilter([]);
    setProviderFilterOpen(false);
    setTableAccess("all");
  }

  function switchTask(nextTask: string) {
    setTask(nextTask);
    setYMetric(0);
    setXMetric(0);
    setRankingMetric("overall");
    if (modality === "audio") setSelectedModelNames(audioTaskConfigs[nextTask].models.slice(0, 7).map((model) => model.name));
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
        <div>
          <div className="model-discovery-title-row">
            <h1>模型发现</h1>
            <div className="model-discovery-meta">
              <span>数据快照：2026-08-07</span>
            </div>
          </div>
          <p>聚合业界评测、专业分析与 ModelGo 平台数据，帮助团队完成模型选型。</p>
        </div>
        <Button onClick={onViewAllModels} size="sm" type="button" variant="outline">
          返回模型广场<LuArrowUpRight size={13} />
        </Button>
      </header>

      {/* 一级模态导航：Agent 最左且默认，见 plans/2026-08-24-v1.0.6-model-discovery-ui-flow §3.2 模块 2。
          只做导航，内容由下方各模块按 modality 自行渲染，故不使用 TabsContent。 */}
      <Tabs onValueChange={(value) => switchModality(value as ModalityKey)} value={modality}>
        <TabsList aria-label="模型模态" variant="underline">
          {modalityOptions.map((option) => (
            <TabsTrigger key={option.key} value={option.key} variant="underline">{option.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="model-discovery-taskbar">
        {/* Agent 无二级任务（§3.2 模块可见性） */}
        {modality !== "agent" && (
          <Tabs onValueChange={switchTask} value={task}>
            <TabsList aria-label="任务类型" variant="underline">
              {config.tasks.map((item) => <TabsTrigger key={item} value={item} variant="underline">{item}</TabsTrigger>)}
            </TabsList>
          </Tabs>
        )}
        {/* 范围走紧凑 segmented control（§3.2 模块 3）。ml-auto 承接原 .model-discovery-scope
            的 margin-left:auto —— 它必须贴住 taskbar 右端，不能跟着任务 Tab 靠左。 */}
        <Tabs className="ml-auto" onValueChange={(value) => setScope(value as typeof scope)} value={scope}>
          <TabsList aria-label="模型范围" variant="pills">
            <TabsTrigger value="all" variant="pills">全部行业模型</TabsTrigger>
            <TabsTrigger value="supported" variant="pills">仅看已接入</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <section className="model-discovery-overview">
        <article className="mg-tile model-discovery-rank-card">
          <div className="model-discovery-card-head"><div><h2>{task} Top 5</h2><span>{taskProfile.qualityBasis}</span></div></div>
          <div className="model-discovery-rank-head"><span>#</span><span>模型</span><span>接入状态</span><span>{taskProfile.qualityLabel}<em className="model-discovery-source-tag">{metricSource}</em></span></div>
          {visibleModels.slice(0, 5).map((model, index) => {
            const hasDetail = canOpenModelDetail(model);
            return <div aria-label={hasDetail ? modelDetailAriaLabel(model) : undefined} className={`model-discovery-rank-row ${hasDetail ? "model-discovery-row-clickable" : ""}`} key={model.name} onClick={hasDetail ? () => openModelDetail(model) : undefined} onKeyDown={hasDetail ? (event) => handleModelRowKeyDown(event, model) : undefined} role={hasDetail ? "link" : undefined} tabIndex={hasDetail ? 0 : undefined}><span>{index + 1}</span><strong>{model.name}<small>{model.provider}</small></strong><em className={isModelConnected(model) ? "supported" : "pending"}>{modelAccessLabel(model)}</em><div><i style={{ width: `${94 - index * 7}%` }} /><b>{model.score}</b></div></div>;
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
          const rows = completeSpecialtyRows(item, visibleModels);
          const values = rows.map((row) => metricValue(row.value));
          const maximum = Math.max(...values, 1);
          return <article className="mg-tile" key={item.title}>
            <header><div><h3>{item.title}</h3><p>{item.description}<em className="model-discovery-source-tag">{item.source}</em></p></div><span>Top {rows.length}</span></header>
            <div className="model-discovery-specialty-chart">
              {rows.map((row, index) => {
                const value = metricValue(row.value);
                const barHeight = Math.max(18, value / maximum * 100);
                const costModel = isTextAgent && item.title === "单次任务成本" ? taskModels.find((model) => model.name === row.model) : undefined;
                const costProfile = costModel ? taskCostProfileFor(task, costModel) : undefined;
                return <div aria-label={`第 ${index + 1} 名，${row.model}，${row.value}`} className="model-discovery-specialty-column" key={row.model} style={{ "--bar-height": `${barHeight}%` } as CSSProperties} tabIndex={0}>
                <div className="model-discovery-specialty-plot">
                  <div className="model-discovery-specialty-tooltip" role="tooltip"><strong><DiscoveryModelIcon model={row.model} provider={row.provider} />{row.model}</strong><span>第 {index + 1} 名 · {item.description}</span><b>{row.value}</b>{costProfile && <dl className="model-discovery-cost-breakdown"><div><dt>输出</dt><dd>{formatTaskCost(costProfile.answer)}</dd></div><div><dt>推理</dt><dd>{formatTaskCost(costProfile.reasoning)}</dd></div><div><dt>缓存写入</dt><dd>{formatTaskCost(costProfile.cacheWrite)}</dd></div><div><dt>缓存命中</dt><dd>{formatTaskCost(costProfile.cacheHit)}</dd></div><div><dt>输入</dt><dd>{formatTaskCost(costProfile.input)}</dd></div></dl>}</div>
                  <i className="model-discovery-specialty-bar"><b>{row.value}</b></i>
                </div>
                <div className="model-discovery-specialty-label"><DiscoveryModelIcon model={row.model} provider={row.provider} /><strong title={row.model}>{row.model}</strong></div>
              </div>;
              })}
            </div>
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
                {chartProviders.map((provider) => <span key={provider}><i style={{ "--legend-color": providerMarkColors[provider] ?? "#5472b8" } as CSSProperties} />{provider}</span>)}
                <em>实心：已接入 · 空心：暂未接入</em>
              </div>
              <div className="model-discovery-scatter-plot">
                {pareto && <div className={`model-discovery-advantage-zone ${xLowerIsBetter ? "left" : "right"}`}><span>优选区</span></div>}
                {yTicks.map((tick) => <i className="model-discovery-gridline horizontal" key={`y-${tick}`} style={{ "--grid-position": `${chartPosition(tick, yTicks)}%` } as CSSProperties}><span>{formatYAxisTick(tick)}</span></i>)}
                {xTicks.map((tick) => <i className="model-discovery-gridline vertical" key={`x-${tick}`} style={{ "--grid-position": `${chartPosition(tick, xTicks)}%` } as CSSProperties}><span>{formatXAxisTick(tick)}</span></i>)}
                <strong className="model-discovery-axis-title y-axis">{activeYAxisLabel}（{yUnit}）</strong>
                <strong className="model-discovery-axis-title x-axis">{activeXAxis.label}（{xUnit}）</strong>
                {chartData.map(({ model, xValue, yValue }, index) => {
                  const left = chartPosition(xValue, xTicks);
                  const bottom = chartPosition(yValue, yTicks);
                  return <button aria-label={`${model.name}，${activeYAxisLabel} ${formatYAxisTick(yValue)}，${activeXAxis.label} ${formatXAxisTick(xValue)}`} className={`model-discovery-scatter-point ${isModelConnected(model) ? "supported" : "pending"} ${left > 72 ? "label-left" : ""} ${index % 2 === 0 ? "label-up" : "label-down"}`} key={model.name} style={{ "--point-left": `${left}%`, "--point-bottom": `${bottom}%`, "--point-color": providerMarkColors[model.provider] ?? "#5472b8" } as CSSProperties} type="button">
                    <i />
                    <span className="model-discovery-point-label">{model.name}</span>
                    <span className="model-discovery-point-tooltip" role="tooltip"><strong>{model.name}</strong><em>{activeYAxisLabel}：{formatYAxisTick(yValue)} {yUnit}</em><em>{activeXAxis.label}：{formatXAxisTick(xValue)} {xUnit}</em></span>
                  </button>;
                })}
                {chartData.length === 0 && <div className="model-discovery-chart-empty">请选择至少一个模型</div>}
              </div>
            </div>
            <aside className="model-discovery-analysis-aside">
              <div className="mg-tile model-discovery-model-filter">
                <h3><LuListFilter size={14} />模型筛选</h3><p>选择需要在图表中对比的模型。</p>
                <button aria-expanded={modelFilterOpen} className="model-discovery-model-filter-trigger" onClick={() => setModelFilterOpen((current) => !current)} type="button"><span>{chartModels.length} / {visibleModels.length} 个模型</span><LuChevronDown size={14} /></button>
                {modelFilterOpen && <div className="model-discovery-model-filter-popover">
                  <label><LuSearch size={14} /><input autoFocus placeholder="搜索模型" value={modelFilterSearch} onChange={(event) => setModelFilterSearch(event.target.value)} /></label>
                  <div className="model-discovery-model-filter-list">
                    {filteredModelOptions.map((model) => <button className={selectedModelNames.includes(model.name) ? "selected" : ""} key={model.name} onClick={() => toggleChartModel(model.name)} type="button"><DiscoveryModelIcon model={model.name} provider={model.provider} /><span><strong>{model.name}</strong><small>{model.provider}</small></span>{selectedModelNames.includes(model.name) && <LuCheck size={14} />}</button>)}
                    {filteredModelOptions.length === 0 && <em>未找到匹配模型</em>}
                  </div>
                  <footer><button onClick={() => setSelectedModelNames([])} type="button"><LuX size={13} />清空</button><button onClick={() => setSelectedModelNames(visibleModels.map((model) => model.name))} type="button"><LuCheckCheck size={13} />全选</button><button onClick={() => setSelectedModelNames(visibleModels.slice(0, 7).map((model) => model.name))} type="button"><LuRotateCcw size={13} />恢复默认</button></footer>
                </div>}
              </div>
              <div className="mg-tile model-discovery-trend"><h3><LuTrendingUp size={14} />近 7 日 ModelGo 使用趋势</h3><p>按增长率从高到低排列</p>
                {trendSeries.length > 0 ? <><div className="model-discovery-trend-chart"><div className="model-discovery-trend-axis"><span>+{trendGrowthMaximum}%</span><span>+{trendGrowthMidpoint}%</span><span>0%</span></div><div className="model-discovery-trend-plot" style={{ "--trend-count": trendSeries.length } as CSSProperties}>{trendSeries.map((series) => <button aria-label={`${series.model.name}，近 7 日增长 ${series.growth}%，${trendUsageLabel} ${series.usage}`} className="model-discovery-trend-column" key={series.model.name} style={{ "--trend-color": series.color, "--trend-height": `${Math.max(12, series.growth / trendGrowthMaximum * 100)}%` } as CSSProperties} type="button"><span className="model-discovery-trend-tooltip" role="tooltip"><strong>{series.model.name}</strong><em>{trendUsageLabel}</em><b>{series.usage}</b></span><i><b>+{series.growth}%</b></i><span title={series.model.name}>{series.model.name}</span></button>)}</div></div><div className="model-discovery-trend-legend">{trendSeries.map((series) => <span key={series.model.name}><i style={{ "--trend-color": series.color } as CSSProperties} /><strong>{series.model.name}</strong><b>+{series.growth}%</b></span>)}</div></> : <div className="model-discovery-trend-empty">选择已接入模型后查看趋势</div>}
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
              <label><LuChartColumn size={14} /><span>指标类型</span><select aria-label="指标类型" value={selectedRankingOption.key} onChange={(event) => setRankingMetric(event.target.value as RankingMetric)}>{availableRankingMetricOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select><LuChevronDown size={12} /></label>
            </div>
            <div className="model-discovery-table-secondary-filters">
              <div className="model-discovery-provider-filter">
                <button aria-expanded={providerFilterOpen} className="model-discovery-provider-filter-trigger" onClick={() => setProviderFilterOpen((current) => !current)} title={providerFilter.length > 0 ? providerFilter.join("、") : "全部厂商"} type="button"><span>{providerFilter.length === 0 ? "全部厂商" : providerFilter.slice(0, 2).join("、")}</span>{providerFilter.length > 2 && <em>+{providerFilter.length - 2}</em>}<LuChevronDown size={12} /></button>
                {providerFilterOpen && <div className="model-discovery-provider-filter-popover" role="dialog" aria-label="选择厂商">
                  <header><div><strong>选择厂商</strong><span>{providerFilter.length === 0 ? "当前展示全部" : `已选择 ${providerFilter.length} 个`}</span></div><button disabled={providerFilter.length === 0} onClick={() => setProviderFilter([])} type="button">重置</button></header>
                  <div className="model-discovery-provider-options">{providers.map((provider) => {
                    const selected = providerFilter.includes(provider);
                    return <button aria-pressed={selected} className={selected ? "selected" : ""} key={provider} onClick={() => toggleProvider(provider)} type="button"><i>{selected && <LuCheck size={11} />}</i><span>{provider}</span></button>;
                  })}</div>
                  <footer><span>{providerFilter.length === 0 ? `${providers.length} 个厂商` : `筛选 ${providerFilter.length} 个厂商`}</span><button onClick={() => setProviderFilterOpen(false)} type="button">完成</button></footer>
                </div>}
              </div>
              <label><select aria-label="接入状态" value={tableAccess} onChange={(event) => setTableAccess(event.target.value as "all" | "supported" | "pending")}><option value="all">全部接入状态</option><option value="supported">已接入</option><option value="pending">暂未接入</option></select><LuChevronDown size={12} /></label>
            </div>
          </div>
          {/* 语义表格（plan §3.2 模块 7：走现有 Table + Pagination，不手写表格体系）。
              Table 自带 overflow-auto 包装，故不再套 .model-discovery-table-scroll。 */}
          <Table className="model-discovery-table">
            <TableHeader>
              <TableRow>
                <TableHead align="center">排名</TableHead>
                <TableHead align="left">模型</TableHead>
                <TableHead align="center">状态</TableHead>
                <TableHead align="right">
                  {selectedMetricHeader}<em className="model-discovery-source-tag">{selectedMetricSource}</em>
                </TableHead>
                {supportingMetricHeaders.map((header) => <TableHead align="right" key={header}>{header}</TableHead>)}
                <TableHead align="right"><span className="sr-only">操作</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
                    <TableCell align="center">{(safeTablePage - 1) * tablePageSize + index + 1}</TableCell>
                    <TableCell align="left"><strong>{model.name}<small>{model.provider}</small></strong></TableCell>
                    <TableCell align="center">
                      <em className={isModelConnected(model) ? "supported" : "pending"}>{modelAccessLabel(model)}</em>
                    </TableCell>
                    <TableCell align="right"><b className="metric-primary">{selectedMetricValue(model)}</b></TableCell>
                    {supportingValues.map((value, valueIndex) => (
                      <TableCell align="right" key={`${model.name}-${valueIndex}`}>{value}</TableCell>
                    ))}
                    <TableCell align="right">
                      {hasDetail
                        ? <Button onClick={(event) => { event.stopPropagation(); openModelDetail(model); }} size="sm" type="button" variant="ghost">查看详情<LuArrowUpRight size={12} /></Button>
                        : <Button disabled size="sm" type="button" variant="ghost">待支持</Button>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            mode="page"
            onPageChange={setTablePage}
            page={safeTablePage}
            pageSize={tablePageSize}
            total={filteredTableModels.length}
          />
        </div>
      </section>

      {modality === "agent" && <AgentPopularityLeaderboard />}
    </div>
  );
}

export default ModelDiscoveryPage
