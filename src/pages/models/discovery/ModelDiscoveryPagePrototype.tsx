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
import { useTranslation } from 'react-i18next'
import { trackEvent } from '@/lib/track'
import { AgentPopularityLeaderboard, DiscoveryLoadError } from './discovery-agent-popularity'
import { useProviderColor } from './discovery-colors'
import { useSectionAnchor } from './use-section-anchor'
import {
  buildRankingMetricOptions,
  buildTaskMetricProfiles,
  buildSummaryTooltipCopy,
  buildSourceConstrainedAnalysisProfiles,
  buildDiscoveryConfigs,
  buildAudioTaskConfigs,
  buildAgentDiscoveryConfig,
  type TFn,
  type ModalityKey,
  type RankingMetric,
  type AnalysisAxisProfile,
  type SpecialtyKind,
} from './discovery-config'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { InfoTip } from '@/components/ui/InfoTip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { SelectContent, SelectItem, SelectRoot, SelectTrigger, SelectValue } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Popover } from '@/components/ui/Popover'
import { Pagination } from '@/components/ui/Pagination'
import {
  useDiscoveryAnalysis,
  useDiscoveryModelOptions,
  useDiscoveryQuery,
  useDiscoverySpecialtyModels,
  useDiscoveryTable,
  useDiscoveryTrends,
} from './use-discovery-query'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { OverflowTip } from '@/components/ui/OverflowTip'
import { defaultScatterSelection, detailTarget, EMPTY, integratedSiteOf, rankBarWidth, specialtyRows, unitPriceDetail } from './discovery-data'
import type { DiscoveryIntegratedSite, DiscoveryIntegrationStatus, DiscoveryUnitPrices } from '@/types'
import { appToast } from "@/lib/app-toast"
import {

  AnalysisScatterChart,
  DiscoveryModelIcon,
  SpecialtyBarChart,
  TrendBarChart,
  type AnalysisScatterPoint,
  type TrendChartPoint,
} from './discovery-charts'

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
  /** 计费单价，成本列 tooltip 用。只有语言类下发，且各档位可能缺项。 */
  unitPrices?: DiscoveryUnitPrices | null;
  /** 接在哪个站（接口 integration_status）：MODELGO=国内 modelgo.com / MODELGO_AI=国外 modelgo.ai。当前站有没有看 supported。 */
  integrationStatus?: DiscoveryIntegrationStatus;
  /** 接入站点（接口 integrated_site）：徽标/可点性/落点的唯一判据（qa#727）。 */
  integratedSite?: DiscoveryIntegratedSite | null;
  /** 国际站 id：MODELGO_AI 的模型据此拼跨站详情链接（prd#1016）。 */
  globalModelId?: string | null;
  /**
   * 排序与格式化用的原始数值。**不要从展示串反解析** —— `price` 在无数据时是「—」，
   * 解析出来是 0，会把「没有成本数据」显示成「$0.00」，和真的 0（免费）分不开
   * （需求方#969 缺陷 1：95 个模型里 45 个 cost_value=null，全被渲染成 $0.00）。
   */
  raw?: { price: number | null };
};

/**
 * 兜底白名单：只在接口没下发 integration_status 时用，按厂商猜它接在国内站。
 * 有字段就一律以字段为准（字段是真源，白名单只是缺字段时的降级）。
 * 比对前统一小写并去掉空格与标点：接口 creator_name 的写法与展示名不一致
 * （"Z AI" vs "Z.ai"、"ByteDance Seed"、"KlingAI"）。
 */
/**
 * 国际站控制台的生产地址。与 .env.production 的 VITE_GLOBAL_CONSOLE 同值，
 * 但这里不读 env：跨站详情链接在测试环境也要指向线上（见 globalModelDetailUrl）。
 */
const GLOBAL_CONSOLE_PROD = "https://console.modelgo.ai";

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

/** 只依赖 provider / supported / integrationStatus / integratedSite，故对散点用的轻量模型对象同样适用。 */
type AccessShape = Pick<DiscoveryModel, "provider" | "supported" | "integrationStatus" | "integratedSite">;

/**
 * 三态判据（qa#727）：徽标、可点性、落点全部从这里派生。优先接口下发的
 * `integrated_site`；字段缺失时按后端同一条规则本地推导（is_integrated + 国别）。
 */
function accessSite(model: AccessShape) {
  return integratedSiteOf({ integratedSite: model.integratedSite, supported: model.supported, domestic: isDomesticModel(model) });
}

/**
 * 这个模型接在哪个站：`integration_status === 'MODELGO'` → 国内站 modelgo.com，
 * `'MODELGO_AI'` → 国外站 modelgo.ai。字段缺省时才退回本地厂商白名单。
 *
 * ⚠️ 它**不是**厂商国别（此前注释这么写，是错的，2026-09-08 owner 纠正）。
 * 所以 `is_integrated=false` + `MODELGO_AI` 不矛盾：国内站没接入、国外站接了，
 * 点详情就该外链去 modelgo.ai。
 *
 * 此前这里写的是 `model.supported || 白名单`，而那时 `supported` 取自
 * `integration_status === 'MODELGO'` —— 两个维度被揉成一个，于是境外厂商里我们真上架了
 * 的模型（如 Claude Fable 5）被判成「海外未接入」，点击跳去 ModelGo.ai 外链而不是站内详情。
 */
function isDomesticModel(model: AccessShape) {
  // 名字里的 domestic 指「接在国内站」，不是厂商是不是国产公司。
  if (model.integrationStatus) return model.integrationStatus === "MODELGO";
  return domesticModelProviders.has(normalizeProviderName(model.provider));
}

/**
 * 该模型在页面上是否算「有落点」= `integrated_site` 不是 NOT_INTEGRATED（qa#727）。
 * 未接入的（含境外未接入）没有落点 —— 显示「暂未接入 ModelGo」+ 禁用按钮；
 * 「按国别猜它在 ModelGo.ai 可用」的旧启发式已被产品否决（qa#721）。
 */
function isModelConnected(model: AccessShape) {
  return accessSite(model) !== "NOT_INTEGRATED";
}

/** 三态文案 = integrated_site 查表（qa#727），与可点性/落点同源。 */
function modelAccessLabel(t: TFn, model: DiscoveryModel) {
  const site = accessSite(model);
  if (site === "MODELGO") return t("modelsDiscovery.status.integratedCn");
  if (site === "MODELGO_AI") return t("modelsDiscovery.status.integratedCom");
  return t("modelsDiscovery.status.notIntegrated");
}


const buildModalityOptions = (t: TFn): Array<{ key: ModalityKey; label: string }> => [
  { key: "agent", label: "Agent" },
  { key: "text", label: t("modelsDiscovery.modality.text") },
  { key: "image", label: t("modelsDiscovery.modality.image") },
  { key: "video", label: t("modelsDiscovery.modality.video") },
  { key: "audio", label: t("modelsDiscovery.modality.audio") },
];

/**
 * 本版本先不上线的模态 —— 只从 tab 列表隐藏，**配置与数据链路全部保留**
 * （audio 的 taskMetricProfiles / discoveryConfigs / audioTaskConfigs /
 * TTS-STT 专项榜都还在，接口侧 TTS 96 个、STT 67 个模型也是通的）。
 *
 * 要恢复上线：把这个数组清空即可，不用改别处。**不要顺手删掉 audio 的配置**，
 * 那些 Record<ModalityKey, …> 缺一个键就编译不过，而且下个版本还要用。
 */
const HIDDEN_MODALITIES: readonly ModalityKey[] = ["audio"];

const buildVisibleModalityOptions = (t: TFn) =>
  buildModalityOptions(t).filter((option) => !HIDDEN_MODALITIES.includes(option.key));

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

/**
 * 单次任务成本的原始数值。**只读 `raw.price`，不解析展示串** ——
 * 接口 `cost_value` 为 null 时 `price` 是「—」，`plainMetricValue("—")` 会得到 0。
 * 返回 null 表示第三方没有该模型的成本数据，调用方必须按空处理，不能当 0 参与比较。
 */
function taskCostFor(model: DiscoveryModel): number | null {
  const value = model.raw?.price;
  return typeof value === "number" ? value : null;
}

/** 无成本数据显示「—」；真的 0 显示「免费」，与「没数据」区分开。 */
function formatTaskCost(t: TFn, value: number | null) {
  if (value === null) return EMPTY;
  if (value === 0) return t("modelsDiscovery.unit.free");
  return `$${value.toFixed(2)}`;
}

/**
 * task 既是显示名又是 taskMetricProfiles / discoveryConfigs 的对象 key，
 * 所以标识保持中文不动，只在渲染处映射成当前语言的显示名。
 * 表里没有的（如 "Agent"）原样返回 —— 那是不翻译的专有名词。
 */
const TASK_LABEL_KEYS: Record<string, string> = {
  "文本对话": "modelsDiscovery.task.textChat",
  "代码生成": "modelsDiscovery.task.codeGen",
  "文生图": "modelsDiscovery.task.textToImage",
  "图片编辑": "modelsDiscovery.task.imageEdit",
  "文生视频": "modelsDiscovery.task.textToVideo",
  "图生视频": "modelsDiscovery.task.imageToVideo",
  "语音合成（TTS）": "modelsDiscovery.task.tts",
  "语音识别（STT）": "modelsDiscovery.task.stt",
};

function taskLabel(t: TFn, task: string) {
  const key = TASK_LABEL_KEYS[task];
  return key ? t(key) : task;
}

function discoveryConfigFor(t: TFn, modality: ModalityKey) {
  return modality === "agent" ? buildAgentDiscoveryConfig(t) : buildDiscoveryConfigs(t)[modality];
}

function metricValue(value: string) {
  const amount = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amount)) return 0;
  if (value.includes("B")) return amount * 1_000_000_000;
  if (value.includes("M")) return amount * 1_000_000;
  if (value.includes("K")) return amount * 1_000;
  return amount;
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

function compactNumber(value: number) {
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(value >= 10_000_000_000_000 ? 0 : 1)}T`;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(value >= 10_000_000_000 ? 0 : 1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  if (value >= 100) return `${Math.round(value)}`;
  if (value >= 10) return value.toFixed(1).replace(/\.0$/, "");
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function ModelDiscoveryPage({ onOpenModel, onViewAllModels }: { onOpenModel: (modelId: string) => void; onViewAllModels: () => void }) {
  const { t } = useTranslation()
  const visibleModalityOptions = useMemo(() => buildVisibleModalityOptions(t), [t]);
  const rankingMetricOptions = useMemo(() => buildRankingMetricOptions(t), [t]);
  const taskMetricProfiles = useMemo(() => buildTaskMetricProfiles(t), [t]);
  const summaryTooltipCopy = useMemo(() => buildSummaryTooltipCopy(t), [t]);
  const audioTaskConfigs = useMemo(() => buildAudioTaskConfigs(t), [t]);
  const [modality, setModality] = useState<ModalityKey>("agent");
  const config = discoveryConfigFor(t, modality);
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
  // scope 必须声明在 useDiscoveryQuery 之前：总览的六张卡要跟着「仅看已接入」收窄，
  // 否则会出现榜单全是已接入、卡片却推荐了个用不了的模型（接口文档第三节（一））
  const [scope, setScope] = useState<"all" | "supported">("all");
  const {
    models: apiModels,
    summaryCards: apiSummaryCards,
    snapshotDate,
    dataType: discoveryDataType,
    isLoading: discoveryLoading,
    isError: discoveryError,
    refetch: refetchDiscovery,
  } = useDiscoveryQuery(modality, task, scope);
  // 区块锚点与到达上报（qa#726）：等首屏数据落地再观察，骨架屏阶段各区块高度还会变，
  // 这时候绑 observer 会在重排里连报好几个区块。
  useSectionAnchor(!discoveryLoading);
  const configuredModels = apiModels;
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
  const tableFilterKey = `${modality}|${task}|${scope}|${rankingMetric}|${providerFilter.join(",")}|${tableAccess}`;
  const [lastTableFilterKey, setLastTableFilterKey] = useState(tableFilterKey);
  if (lastTableFilterKey !== tableFilterKey) {
    setLastTableFilterKey(tableFilterKey);
    setTablePage(1);
  }
  const sourceConstrainedProfiles = useMemo(() => buildSourceConstrainedAnalysisProfiles(t), [t]);
  const constrainedAnalysisProfile = sourceConstrainedProfiles[modality]?.[task];
  const isTextAgent = modality === "text" || modality === "agent";
  /**
   * Y 轴可选项只保留**接口真的有数据**的那些。
   *
   * config.yMetrics 里还列着「Coding Index」「运动一致性」这类同类型下拿不到的指标，
   * 原型靠对主指标做等比衰减伪造出它们的值。真实数据下不能这么干——一个 type 只有
   * 一个主指标，所以非 constrained 档位就只给主指标一项。
   */
  const analysisYMetrics = constrainedAnalysisProfile?.yMetrics ?? [taskProfile.qualityLabel];
  const analysisCostLabel = taskProfile.valueLabel.split(" / ").at(-1) ?? t("modelsDiscovery.metric.costPerTask");
  const analysisPresetPrefix = modality === "image" ? "Elo" : t("modelsDiscovery.metric.quality");
  const defaultAnalysisXMetrics: AnalysisAxisProfile["xMetrics"] = [
    { label: analysisCostLabel, unit: isTextAgent ? "USD / Task" : "USD", source: "price", lowerIsBetter: true, presetLabel: `${analysisPresetPrefix} × ${t("modelsDiscovery.preset.axisCost")}` },
    { label: taskProfile.speedLabel, unit: taskProfile.speedUnit, source: "speed", lowerIsBetter: false, presetLabel: `${analysisPresetPrefix} × ${t("modelsDiscovery.preset.axisTps")}` },
    { label: taskProfile.latencyLabel, unit: taskProfile.latencyUnit, source: "latency", lowerIsBetter: true, presetLabel: `${analysisPresetPrefix} × ${t("modelsDiscovery.preset.axisLatency")}` },
    { label: taskProfile.usageLabel, unit: taskProfile.usageUnit, source: "usage", lowerIsBetter: false, presetLabel: `${analysisPresetPrefix} × ${t("modelsDiscovery.preset.axisUsage")}` },
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
    rows: specialtyRows(item.kind, taskModels, { scoreAscending }),
  }));
  const imageBenchmarkRankings = [
    {
      kind: "score" as SpecialtyKind,
      title: t("modelsDiscovery.metric.qualityElo"),
      description: t("modelsDiscovery.summary.imageEloDesc"),
      source: "Artificial Analysis",
      lowerIsBetter: false,
      rows: [...taskModels].sort((first, second) => metricValue(second.score) - metricValue(first.score)).map((model) => ({ model: model.name, value: model.score })),
    },
    {
      kind: "value" as SpecialtyKind,
      title: t("modelsDiscovery.metric.valueForMoney"),
      description: t("modelsDiscovery.summary.valueQualityPerApi"),
      source: "Artificial Analysis",
      lowerIsBetter: false,
      rows: specialtyRows("value", taskModels),
    },
    {
      kind: "price" as SpecialtyKind,
      title: t("modelsDiscovery.metric.apiPrice"),
      description: t("modelsDiscovery.summary.perKImageUnit"),
      source: "Artificial Analysis",
      lowerIsBetter: true,
      // 同 #969 缺陷 1：无价格的模型不进榜，也不要把展示串「—」解析成 0
      rows: [...taskModels]
        .filter((model) => typeof model.raw?.price === "number")
        .sort((first, second) => (first.raw!.price ?? 0) - (second.raw!.price ?? 0))
        .map((model) => ({ model: model.name, value: model.price })),
    },
    {
      kind: "usage" as SpecialtyKind,
      title: t("modelsDiscovery.metric.usage7d"),
      description: t("modelsDiscovery.summary.tasksDesc"),
      source: "ModelGo",
      lowerIsBetter: false,
      rows: [...taskModels].sort((first, second) => metricValue(second.usage) - metricValue(first.usage)).map((model) => ({ model: model.name, value: model.usage })),
    },
  ];
  const videoBenchmarkRankings = [
    {
      kind: "score" as SpecialtyKind,
      title: t("modelsDiscovery.metric.qualityElo"),
      description: t("modelsDiscovery.summary.videoEloDesc"),
      source: "Artificial Analysis",
      lowerIsBetter: false,
      rows: [...taskModels].sort((first, second) => metricValue(second.score) - metricValue(first.score)).map((model) => ({ model: model.name, value: model.score })),
    },
    {
      kind: "value" as SpecialtyKind,
      title: t("modelsDiscovery.metric.valueForMoney"),
      description: t("modelsDiscovery.summary.valueQualityPerApi"),
      source: "Artificial Analysis",
      lowerIsBetter: false,
      rows: specialtyRows("value", taskModels),
    },
    {
      kind: "price" as SpecialtyKind,
      title: t("modelsDiscovery.metric.apiPrice"),
      description: t("modelsDiscovery.summary.perMinVideoUnit"),
      source: "Artificial Analysis",
      lowerIsBetter: true,
      // 同 #969 缺陷 1：无价格的模型不进榜，也不要把展示串「—」解析成 0
      rows: [...taskModels]
        .filter((model) => typeof model.raw?.price === "number")
        .sort((first, second) => (first.raw!.price ?? 0) - (second.raw!.price ?? 0))
        .map((model) => ({ model: model.name, value: model.price })),
    },
    {
      kind: "usage" as SpecialtyKind,
      title: t("modelsDiscovery.metric.usage7d"),
      description: t("modelsDiscovery.summary.tasksDesc"),
      source: "ModelGo",
      lowerIsBetter: false,
      rows: [...taskModels].sort((first, second) => metricValue(second.usage) - metricValue(first.usage)).map((model) => ({ model: model.name, value: model.usage })),
    },
  ];
  /**
   * 文本/Agent 专项榜四卡 —— 真源是 PRD 原型 `ModelDiscoveryPage.tsx` 的 `specialties`
   * （性价比领先 / 输出 TPS / 首 Token 时延领先 / 近 7 日热度）。
   *
   * 曾经是「综合评分 / 单次任务成本 / 输出 TPS / 近 7 日热度」，两处偏离原型且没留理由：
   * 综合评分与 Top 5 的主指标重复（同一列数据换个形状再排一遍），单次任务成本则把
   * 「性价比」这个复合维度降级成了单价——PRD 文档 §5.1/§5.2 与设计文档也都写的是性价比。
   * 时延这一项与散点图「质量 × 时延」预设同源（owner 2026-09-10 拍板保留 4 个含时延）。
   */
  const textBenchmarkRankings = [
    {
      kind: "value" as SpecialtyKind,
      title: t("modelsDiscovery.metric.valueLeader"),
      description: t("modelsDiscovery.summary.valueDesc"),
      source: "Artificial Analysis",
      lowerIsBetter: false,
      // 分母缺失时接口给 value_score = null，这类模型不进榜也不补 0（设计文档 §13 同此，
      // 与 #969 缺陷 1「无价格的模型不进榜」同一口径）
      rows: [...taskModels]
        .filter((model) => model.raw?.valueScore !== null)
        .sort((first, second) => (second.raw!.valueScore ?? 0) - (first.raw!.valueScore ?? 0))
        .map((model) => ({ model: model.name, value: model.valueScore })),
    },
    {
      kind: "tps" as SpecialtyKind,
      title: t("modelsDiscovery.metric.outputTps"),
      description: t("modelsDiscovery.summary.tpsDescUnit"),
      source: "Artificial Analysis",
      lowerIsBetter: false,
      rows: [...taskModels].sort((first, second) => metricValue(second.performance) - metricValue(first.performance)).map((model) => ({ model: model.name, value: model.performance })),
    },
    {
      kind: "latency" as SpecialtyKind,
      title: t("modelsDiscovery.metric.ttftLeader"),
      description: t("modelsDiscovery.metric.ttftP50"),
      source: "Artificial Analysis",
      lowerIsBetter: true,
      // 时延为空的模型不进榜（设计文档：AA 端到端响应时延为空则隐藏该项，不用 TTFT 代替）
      rows: [...taskModels]
        .filter((model) => model.raw?.latencyMs !== null)
        .sort((first, second) => (first.raw!.latencyMs ?? 0) - (second.raw!.latencyMs ?? 0))
        .map((model) => ({ model: model.name, value: model.latency })),
    },
    {
      kind: "usage" as SpecialtyKind,
      title: t("modelsDiscovery.metric.popularity7d"),
      description: t("modelsDiscovery.summary.tokensDesc"),
      source: "ModelGo",
      lowerIsBetter: false,
      rows: [...taskModels].sort((first, second) => metricValue(second.usage) - metricValue(first.usage)).map((model) => ({ model: model.name, value: model.usage })),
    },
  ];
  const audioBenchmarkRankings = task === "语音合成（TTS）"
    ? [
      {
        kind: "score" as SpecialtyKind,
        title: t("modelsDiscovery.metric.voiceQualityElo"),
        description: t("modelsDiscovery.summary.voiceEloDesc"),
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
   * 专项榜的行数据 —— 每张榜按自己的 metric 向服务端要前 10，不再从主榜那 100 条里挑。
   * 口径与实测依据见 useDiscoverySpecialtyModels 的注释（用量榜原先只出 6 条且错位）。
   *
   * 不 memo kinds：queryKey 由 type/kind/metric 决定，每次渲染重建这个小数组不会让
   * react-query 重新请求，而 useMemo + 字符串键那版会被 React Compiler 判为
   * 「manual memoization could not be preserved」直接拒掉整个组件的优化。
   */
  const specialtyKinds = rankingCards.map((card) => card.kind);
  const { byKind: specialtyModels, isSettled: specialtySettled } = useDiscoverySpecialtyModels(modality, task, specialtyKinds, scope);
  /** 某张榜的服务端结果还没到时，先用主榜池子垫着，避免整块空白闪一下。 */
  const specialtyModelsFor = (kind: SpecialtyKind) => specialtyModels[kind] ?? visibleModels;
  /**
   * 模型选择器与厂商筛选的候选来自 model-options（该类型的**全部**模型，不分页）。
   * 之前用的是榜单前 100 条，导致选择器只有 100 个模型、厂商下拉只有二十来家——
   * 实测 TEXT_CHAT 全量是 631 个模型 / 59 家厂商。
   */
  const { options: allModelOptions, vendors: providers } = useDiscoveryModelOptions(modality, task);
  const availableRankingMetricOptions = isTextAgent
    ? rankingMetricOptions
    : modality === "audio" && task === "语音识别（STT）"
      ? [{ key: "overall", label: t("modelsDiscovery.metric.accuracy") }, { key: "price", label: t("modelsDiscovery.metric.apiPrice"), specialtyIndex: 0 }, { key: "usage", label: t("modelsDiscovery.metric.usage"), specialtyIndex: 1 }] satisfies typeof rankingMetricOptions
      : [{ key: "overall", label: modality === "audio" ? t("modelsDiscovery.metric.voiceQuality") : t("modelsDiscovery.metric.eloScore") }, { key: "value", label: t("modelsDiscovery.metric.valueForMoney"), specialtyIndex: 0 }, { key: "price", label: t("modelsDiscovery.metric.apiPrice"), specialtyIndex: 1 }, { key: "usage", label: t("modelsDiscovery.metric.usage"), specialtyIndex: 2 }] satisfies typeof rankingMetricOptions;
  const selectedRankingOption = availableRankingMetricOptions.find((option) => option.key === rankingMetric) ?? availableRankingMetricOptions[0];
  const selectedSpecialty = selectedRankingOption.specialtyIndex === undefined ? undefined : specialties[selectedRankingOption.specialtyIndex];
  const selectedMetricRows = selectedSpecialty
    ? specialtyRows(selectedSpecialty.kind, specialtyModelsFor(selectedSpecialty.kind), { scoreAscending })
    : [];
  const selectedMetricValues = new Map(selectedMetricRows.map((row) => [row.model, row.value]));
  const specialtyDescriptions = isTextAgent
    ? [taskProfile.valueLabel, taskProfile.speedLabel, taskProfile.latencyLabel, taskProfile.usageLabel]
    : modality === "audio" && task === "语音识别（STT）"
      ? [t("modelsDiscovery.metric.publicApiPrice"), taskProfile.usageLabel]
      : [taskProfile.valueLabel, t("modelsDiscovery.metric.publicApiPrice"), taskProfile.usageLabel];
  const selectedMetricHeader = rankingMetric === "value"
    ? isTextAgent
      ? t("modelsDiscovery.value.perTaskCost", { metric: taskProfile.qualityLabel })
      : t("modelsDiscovery.value.perPublicPrice", { metric: taskProfile.qualityLabel })
    : rankingMetric === "price"
      ? t("modelsDiscovery.metric.apiPrice")
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
    isError: tableError,
    refetch: refetchTable,
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
  type DetailShape = Pick<DiscoveryModel, "id" | "name" | "provider" | "supported" | "integrationStatus" | "integratedSite" | "globalModelId">;

  /**
   * 能不能点 —— 与状态标签**同一个判据**（isModelConnected）。
   *
   * PRD 第 8 节：前两态（ModelGo 已接入 / ModelGo.ai 已接入）可点，第三态
   * （国产未接入）「按钮禁用，显示待支持」；10.2 表格操作列同此。所以标签写
   * 「暂未接入」的行必须点不动 —— 一律返回 true 那版让它既标着未接入又点得进
   * 详情页，自相矛盾（owner 2026-09-09 报的就是这个）。
   */
  function canOpenModelDetail(model: DetailShape) {
    return isModelConnected(model);
  }

  /**
   * 国际站详情页地址。**固定用生产域名**：测试环境只有国内一套站，
   * VITE_GLOBAL_CONSOLE 在 test 里指回 console.test.modelgo.com，跳过去照样
   * 没有这个模型 —— 而这个链接的意义就是让人看到真实产品页，所以 test 上也
   * 直接跳线上（owner 2026-09-14 口径）。
   */
  function globalModelDetailUrl(globalId: string) {
    return `${GLOBAL_CONSOLE_PROD}/models/${encodeURIComponent(globalId)}`;
  }

  function modelDetailAriaLabel(model: DetailShape) {
    return model.supported
      ? t("modelsDiscovery.action.viewModelDetail", { name: model.name })
      : t("modelsDiscovery.action.viewOnGlobal", { name: model.name });
  }

  /**
   * 点「查看详情」：按 PRD 第 8 节三态分流，判据见 detailTarget。
   * 这里只做动作，不重新推断落点——三次返工都是因为在这里另立判据。
   */
  function openModelDetail(model: DetailShape) {
    switch (detailTarget({ id: model.id, site: accessSite(model), globalId: model.globalModelId })) {
      case "inside":
        onOpenModel(model.id!);
        return;
      case "global":
        // 接在国外站的模型（MODELGO_AI）：本站没有它的详情页，新开一页去国际站看
        // （prd#1016，QA 口径「modelgo.ai 接入的新开页面跳国际站」）。
        // noopener 断开 window.opener —— 外链新窗口的基本要求。
        window.open(globalModelDetailUrl(model.globalModelId!), "_blank", "noopener,noreferrer");
        return;
      case "no-id":
        // 已接入却没给 modelgo_id：说不出详情页在哪，但不能静默
        // （owner 2026-09-08：「ID 不存在的话要提示」）。
        appToast.info(t("modelsDiscovery.empty.notOnModelGo"), t("modelsDiscovery.empty.noDetailPage"));
        return;
      default:
        // disabled：第三态本来就点不动（canOpenModelDetail 已挡住），
        // 键盘/程序化调用兜底一句提示，不静默。
        appToast.info(t("modelsDiscovery.empty.notOnModelGo"), t("modelsDiscovery.empty.noDetailPage"));
    }
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
    if (rankingMetric === "price") return model.raw?.price ?? Number.POSITIVE_INFINITY;
    if (rankingMetric === "usage") return metricValue(model.usage);
    if (rankingMetric === "value") {
      const quality = metricValue(model.score);
      // 无成本数据算不出性价比，排到末尾（返回 0），不要用 0 当分母算出一个虚高的值
      const cost = isTextAgent ? taskCostFor(model) : model.raw?.price ?? null;
      if (cost === null) return 0;
      return taskProfile.qualityLowerIsBetter ? 1 / Math.max(quality * cost, 0.01) : quality / Math.max(cost, 0.01);
    }
    return metricValue(model.score);
  }

  function supportingMetrics(model: DiscoveryModel): Array<{ text: string; title?: string }> {
    return [
      {
        text: isTextAgent ? formatTaskCost(t, taskCostFor(model)) : model.price,
        // tooltip 首行标明是「计费单价」——接口文档要求，四档单价之和不等于这笔任务成本
        title: (() => {
          const detail = unitPriceDetail(t, model.unitPrices);
          return detail ? t("modelsDiscovery.price.unitPrice", { detail }) : undefined;
        })(),
      },
      { text: model.release ?? "—" },
      { text: model.usage },
    ];
  }

  const supportingMetricHeaders = isTextAgent
    ? [t("modelsDiscovery.metric.costPerTask"), t("modelsDiscovery.metric.releaseDate"), t("modelsDiscovery.summary.usageDesc")]
    : [t("modelsDiscovery.metric.publicPrice"), t("modelsDiscovery.metric.releaseDate"), t("modelsDiscovery.summary.usageDesc")];
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
      // 接入态只认 is_integrated。此前这三处用的是 integration_status === "MODELGO"，
      // 那是「接在哪个站」（国内站/国外站）不是「有没有接入」，于是国外站已接入的模型
      // 被判成未接入、从未接入的国内站模型被判成已接入 —— prd#969 第 7 条就是它。
      // 当时 model-options 不下发 is_integrated，只能这么将就；后端 2026-09-08 补齐，改回。
      .filter((option) => scope === "all" || option.is_integrated === true)
      .map((option) => ({
        // 有 modelgo_id 就给 id，**不要求已接入** —— owner 2026-09-09：「你只要返回字段
        // 你就给我跳转」。此前这里要求 is_integrated，把 27 个有 modelgo_id 但未接入的
        // 模型（gpt-5.4 / claude-opus-4.8 / glm-5 …）的 id 丢掉了，点它们只能弹提示。
        // 与 toPrototypeModel 的口径对齐（那条线早就是 `item.modelgo_id || undefined`）。
        id: option.modelgo_id || undefined,
        sourceModelId: option.source_model_id,
        name: option.model_name,
        provider: option.creator_name ?? "",
        supported: option.is_integrated === true,
        // 三态判据字段（qa#727）：不带它，model-options 这条线会退回本地推导。
        integratedSite: option.integrated_site ?? null,
        // 落点判据：supported 只说「有没有接入」，跳哪个站要看它接在哪个站。
        // 不带这个字段，model-options 这条线的详情跳转就会退化成「一律站内」。
        integrationStatus: option.integration_status,
      })),
    [allModelOptions, scope],
  );
  /**
   * 散点图默认选中 = 专项榜四卡（实际渲染的那几张）Top 10 的并集（qa#723，
   * owner 2026-09-09 口头；取代 09-08 的「默认全选」——AGENT 模态全选 261 个，
   * 散点密成一坨）。并集口径与空并集回退见 defaultScatterSelection 的注释。
   * 不放 useState 初值（那时接口数据没到）、不用 effect（本仓 eslint 禁
   * set-state-in-effect），走「渲染期按上一次值调整状态」，与上方 tablePage
   * 归位同一套写法。
   *
   * ⚠️ 判据必须是**数据实际对应的类型**（接口响应里的 type），不能用当前选中的
   * `modality|task`。查询开了 placeholderData 保留旧数据，切 tab 的那一帧入参已经
   * 变了、models 却还是上一个类型的：拿入参做判据会在旧数据上就把重置执行掉并把
   * key 记成新值，等真数据到达时条件已不成立，于是散点图停在「上一个 tab 的模型名」
   * 上，在新候选里一个也匹配不到，图表空掉。
   *
   * 三个数据源各自的「到达」判据：候选 chartCandidates 来自 model-options
   * （没开 placeholderData，非空即当前类型）；主榜垫底数据看 selectionKey
   * （= 主榜响应的 type）；专项榜四个独立 query 看 specialtySettled
   * （同样以各响应的 type 为准）——三者都到了才设默认值，否则会拿上一个 tab
   * 的榜行算并集，一个都匹配不上、退化成全选后再也不纠正。
   */
  const defaultSelection = () =>
    defaultScatterSelection(
      rankingCards.map((card) => specialtyRows(card.kind, specialtyModelsFor(card.kind), { scoreAscending })),
      chartCandidates.map((model) => model.name),
    );
  const selectionKey = discoveryDataType ?? "";
  const [lastSelectionKey, setLastSelectionKey] = useState("");
  if (chartCandidates.length > 0 && specialtySettled && lastSelectionKey !== selectionKey) {
    setLastSelectionKey(selectionKey);
    setSelectedModelNames(defaultSelection());
  }
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
  const { points: analysisPoints, isError: analysisError, refetch: refetchAnalysis } = useDiscoveryAnalysis(
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
  const { data: trendData, isError: trendError, refetch: refetchTrend } = useDiscoveryTrends(modality, task, trendModels.map((model) => model.sourceModelId));
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
  const trendUsageLabel = modality === "text" ? t("modelsDiscovery.metric.usageTokens7d") : taskProfile.usageLabel;
  /* 空态要说清是哪一种「没有」，否则用户只看到一句「暂无」，分不清是自己没选模型、
     还是平台确实没数据。 */
  const trendEmptyHint = trendModels.length === 0
    ? t("modelsDiscovery.empty.pickIntegrated")
    : trendData && trendData.models.some((item) => Number(item.current_usage) > 0)
      ? t("modelsDiscovery.empty.noGrowth")
      : t("modelsDiscovery.empty.noTrend");
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
    // 🔴 只在状态**实际变化**时上报（PRD §13.3，prd#1007）：重复点当前已选中的模态
    // 不该产生 _category_switch。Tabs 的 onValueChange 在重复点同一项时也会触发，
    // 所以去重必须做在这里，不能指望组件。
    if (next !== modality) {
      trackEvent('model_discovery_category_switch', { from_category: modality, to_category: next });
    }
    const nextConfig = discoveryConfigFor(t, next);
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

  function switchScope(next: typeof scope) {
    // 同上：只在真的换了范围时上报（prd#1007）
    if (next !== scope) {
      trackEvent('model_discovery_access_scope_change', { category: modality, from_scope: scope, to_scope: next });
    }
    setScope(next);
  }

  function switchTask(nextTask: string) {
    // 同上：只在真的换了子任务时上报（prd#1007）
    if (nextTask !== task) {
      trackEvent('model_discovery_task_switch', { category: modality, from_task: task, to_task: nextTask });
    }
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
          {/* 标题行按 PRD 原型：大标题 + 右侧数据快照胶囊，副标题另起一行。
              每日 08:30 刷新一次，不是实时值；同步失败时接口继续返回上一次成功的
              快照，日期会停在旧值——所以这里必须展示接口回传的真实日期。 */}
          <div className="model-discovery-title-row">
            <h1>{t("modelsDiscovery.page.title")}</h1>
            <Badge size="sm" variant="outline">{snapshotDate ? t("modelsDiscovery.page.snapshot", { date: snapshotDate }) : t("modelsDiscovery.page.snapshotLoading")}</Badge>
          </div>
          <p>{t("modelsDiscovery.page.subtitle")}</p>
        </div>
        <Button onClick={onViewAllModels} size="sm" type="button" variant="brand-outline">
          {t("modelsDiscovery.page.backToCatalog")}<LuArrowUpRight size={13} />
        </Button>
      </header>

      {/* 一级模态导航独占一行（§3.2 模块 2），下面 taskbar 是二级任务 + 范围筛选。
          曾把范围筛选并到模态行、Agent 模态整行不渲染 taskbar，结果 tab 底边直接贴住
          首个卡片（实测间距 0px）；按 PRD 原型改回两行，taskbar 始终渲染。 */}
      <div className="model-discovery-modality-bar">
        <Tabs onValueChange={(value) => switchModality(value as ModalityKey)} value={modality}>
          <TabsList aria-label={t("modelsDiscovery.a11y.modality")} variant="underline">
            {visibleModalityOptions.map((option) => (
              <TabsTrigger key={option.key} value={option.key} variant="underline">{option.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* 二级任务 tab：Agent 无二级任务（§3.2 模块可见性），左侧留空，范围筛选仍靠右 */}
      <div className="model-discovery-taskbar">
        {modality !== "agent" && (
          <Tabs onValueChange={switchTask} value={task}>
            <TabsList aria-label={t("modelsDiscovery.a11y.taskType")} variant="underline">
              {config.tasks.map((item) => <TabsTrigger key={item} value={item} variant="underline">{taskLabel(t, item)}</TabsTrigger>)}
            </TabsList>
          </Tabs>
        )}
        <Tabs className="ml-auto" onValueChange={(value) => switchScope(value as typeof scope)} value={scope}>
          <TabsList aria-label={t("modelsDiscovery.a11y.scope")} variant="pills">
            <TabsTrigger value="all" variant="pills">{t("modelsDiscovery.scope.all")}</TabsTrigger>
            <TabsTrigger value="supported" variant="pills">{t("modelsDiscovery.scope.supported")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <section className="model-discovery-overview" id="model-discovery-overview">
        <article className="mg-tile model-discovery-rank-card">
          <div className="model-discovery-card-head"><div><h2>{taskLabel(t, task)} Top 5</h2><span>{taskProfile.qualityBasis}</span></div></div>
          <div className="model-discovery-rank-head"><span>#</span><span>{t("modelsDiscovery.table.model")}</span><span>{t("modelsDiscovery.metric.integrationStatus")}</span><span>{taskProfile.qualityLabel}<em className="model-discovery-source-tag">{metricSource}</em></span></div>
          {!discoveryLoading && discoveryError && visibleModels.length === 0 && (
            <DiscoveryLoadError onRetry={refetchDiscovery} text={t("modelsDiscovery.error.rank")} />
          )}
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
            return <div aria-label={hasDetail ? modelDetailAriaLabel(model) : undefined} className={`model-discovery-rank-row ${hasDetail ? "model-discovery-row-clickable" : ""}`} data-rank-top={index < 3 ? index + 1 : undefined} key={model.name} onClick={hasDetail ? () => openModelDetail(model) : undefined} onKeyDown={hasDetail ? (event) => handleModelRowKeyDown(event, model) : undefined} role={hasDetail ? "link" : undefined} tabIndex={hasDetail ? 0 : undefined}><span>{index + 1}</span><strong className="model-discovery-rank-name"><DiscoveryModelIcon model={model.name} provider={model.provider} /><span><OverflowTip text={model.name} /><small>{model.provider}</small></span></strong><em className={isModelConnected(model) ? "supported" : "pending"}>{modelAccessLabel(t, model)}</em><div><ProgressBar flow showGlow={false} size="xs" value={rankBarWidth(model, visibleModels.slice(0, 5), scoreAscending)} /><b>{model.score}</b></div></div>;
          })}
          <div className="model-discovery-rank-more"><button onClick={viewFullRanking} type="button">{t("modelsDiscovery.action.viewMore")}<LuChevronDown size={13} /></button></div>
        </article>
        <div className={`model-discovery-summary-grid cards-${summaryCards.length}`}>
          {summaryCards.map((item, index) => (
            <article className={`mg-tile model-discovery-summary-card ${summaryCards.length % 2 === 1 && index === summaryCards.length - 1 ? "wide" : ""}`} key={item.label}>
              <span>{item.label}<InfoTip align="end" className="ml-auto" text={item.tooltip} /></span>
              <div className="model-discovery-summary-content">
                {item.empty ? (
                  <p className="model-discovery-summary-empty">{t("modelsDiscovery.empty.noData")}</p>
                ) : (
                  <>
                    <div className="model-discovery-summary-model">
                      <DiscoveryModelIcon model={item.model} provider={item.provider} />
                      <strong>{item.model}</strong>
                    </div>
                    <div className="model-discovery-summary-value"><b>{item.value}</b><small>{item.unit}</small></div>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="model-discovery-section" id="model-discovery-specialty-rank">
        <div className="model-discovery-section-head"><div><h2>{t("modelsDiscovery.section.specialtyRank")}</h2></div></div>
        <div className="model-discovery-specialties">{rankingCards.map((item) => {
          const specialtySource = specialtyModelsFor(item.kind);
          const rows = specialtyRows(item.kind, specialtySource, { scoreAscending });
          // 柱子此前有 hover 效果和 tabIndex，却没有任何点击行为——看着可点其实是死的。
          // 从**本榜自己那批模型**里找回完整对象后接上跳详情（改服务端排序后，
          // 榜上的模型可能不在主榜那 100 条里，只查 visibleModels 会找不到而变成死柱子）。
          const barModelOf = (name: string) =>
            specialtySource.find((model) => model.name === name) ?? visibleModels.find((model) => model.name === name);
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

      {(modality !== "audio" || task === "语音合成（TTS）") && <section className="model-discovery-section" id="model-discovery-multi-dim">
        <div className="model-discovery-section-head"><div><h2>{t("modelsDiscovery.section.multiDim")}</h2></div></div>
        <div className="mg-tile model-discovery-analysis-card">
          <div className="model-discovery-analysis-tools">
            <div className="model-discovery-presets">{analysisPresets.map((preset, index) => <button className={preset.y === yMetric && preset.x === xMetric ? "active" : ""} key={preset.label} onClick={() => applyPreset(index)} type="button">{preset.label}</button>)}</div>
            <div className="model-discovery-selects">
              <span className="model-discovery-fixed-axis">{t("modelsDiscovery.chart.yAxis")}<strong>{activeYAxisLabel}</strong></span>
              <span className="model-discovery-fixed-axis">{t("modelsDiscovery.chart.xAxis")}<strong>{activeXAxis.label}</strong></span>
              <button className={pareto ? "active" : ""} onClick={() => setPareto((current) => !current)} type="button"><LuSlidersHorizontal size={12} />{t("modelsDiscovery.chart.advantageZone")}</button>
            </div>
          </div>
          <div className="model-discovery-analysis-grid">
            <div className={`model-discovery-scatter ${pareto ? "show-pareto" : ""}`}>
              <div className="model-discovery-scatter-legend">
                {chartProviders.map((provider) => <span key={provider}><i style={{ "--legend-color": providerColor(provider) } as CSSProperties} />{provider}</span>)}
                <em>{t("modelsDiscovery.chart.legend")}</em>
              </div>
              {analysisError && scatterPoints.length === 0 ? (
                <DiscoveryLoadError onRetry={refetchAnalysis} text={t("modelsDiscovery.error.analysis")} />
              ) : (
              <AnalysisScatterChart
                emptyHint={
                  selectedModelNames.length === 0
                    ? t("modelsDiscovery.empty.pickAtLeastOne")
                    : t("modelsDiscovery.chart.noDataForSelection", { count: selectedModelNames.length, y: activeYAxisLabel, x: activeXAxis.label })
                }
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
              )}
            </div>
            <aside className="model-discovery-analysis-aside">
              <div className="mg-tile model-discovery-model-filter">
                <h3><LuListFilter size={14} />{t("modelsDiscovery.section.modelFilter")}</h3><p>{t("modelsDiscovery.section.modelFilterDesc")}</p>
                {/* 走 ui/Popover 而不是自己 absolute 定位：组件统一了玻璃表面、
                    --mg-z-popover 层级、点击外部与 ESC 关闭、视口边缘避让。
                    原先这里是手写浮层 + 硬编码 z-index:20，绕开了全局层级体系。
                    className 必须带 .model-discovery-scope：Popover portal 到 body，
                    不带的话 --line/--panel/--accent 在面板里全空，按钮填充/选中态
                    一直悄悄失效（discovery-tokens.css 顶部有这条警告，2026-09-04 补上）。 */}
                <Popover
                  className="model-discovery-model-filter-panel model-discovery-scope"
                  position="bottom"
                  trigger={
                    <button className="model-discovery-model-filter-trigger" type="button">
                      <span>{t("modelsDiscovery.filter.modelCount", { selected: chartModels.length, total: chartCandidates.length })}</span>
                      <LuChevronDown size={14} />
                    </button>
                  }
                  content={
                    <>
                      {/* 面板内搜索统一 ui/Input sm 档（2026-09-04 控件统一）：
                          32px 高度 + 13px 字号，替换原型手写的 label+input */}
                      <Input
                        autoFocus
                        placeholder={t("modelsDiscovery.action.searchModel")}
                        value={modelFilterSearch}
                        onChange={(event) => setModelFilterSearch(event.target.value)}
                        prefix={<LuSearch className="w-3.5 h-3.5" />}
                        size="sm"
                      />
                      <div className="model-discovery-model-filter-list">
                        {filteredModelOptions.map((model) => <button className={selectedModelNames.includes(model.name) ? "selected" : ""} key={model.name} onClick={() => toggleChartModel(model.name)} type="button"><DiscoveryModelIcon model={model.name} provider={model.provider} /><span><strong title={model.name}>{model.name}</strong><small>{model.provider}</small></span>{selectedModelNames.includes(model.name) && <LuCheck size={14} />}</button>)}
                        {filteredModelOptions.length === 0 && <em>{t("modelsDiscovery.empty.noMatchModel")}</em>}
                      </div>
                      <footer><button onClick={() => setSelectedModelNames([])} type="button"><LuX size={13} />{t("modelsDiscovery.action.clear")}</button><button onClick={() => setSelectedModelNames(chartCandidates.map((model) => model.name))} type="button"><LuCheckCheck size={13} />{t("modelsDiscovery.action.selectAll")}</button><button onClick={() => setSelectedModelNames(defaultSelection())} type="button"><LuRotateCcw size={13} />恢复默认</button></footer>
                    </>
                  }
                />
              </div>
              <div className="mg-tile model-discovery-trend"><h3><LuTrendingUp size={14} />{t("modelsDiscovery.section.trend")}</h3><p>{t("modelsDiscovery.section.trendDesc")}</p>
                {trendSeries.length > 0
                  ? <><TrendBarChart points={trendPoints} usageLabel={trendUsageLabel} /><div className="model-discovery-trend-legend">{trendSeries.map((series) => <span key={series.model.name}><i style={{ "--trend-color": series.color } as CSSProperties} /><strong title={series.model.name}>{series.model.name}</strong><b>{formatGrowth(series.growth)}</b></span>)}</div></>
                  : trendError
                    ? <div className="model-discovery-trend-empty"><DiscoveryLoadError onRetry={refetchTrend} text={t("modelsDiscovery.error.trend")} /></div>
                    : <div className="model-discovery-trend-empty">{trendEmptyHint}</div>}
              </div>
            </aside>
          </div>
        </div>
      </section>}

      <section className="model-discovery-section" id="model-discovery-full-ranking">
        <div className="model-discovery-section-head"><div><h2>{t("modelsDiscovery.section.fullRanking")}</h2></div></div>
        <div className="mg-tile model-discovery-table-card">
          <div className="model-discovery-table-tools">
            <div className="model-discovery-table-primary-filter">
              {/* 走控制台 Select（Radix）而不是原生 <select>：原生的下拉列表由操作系统渲染，
                  macOS 上是一层半透明系统材质，底下的表头文字会透出来，我们的 CSS 一行都够不着
                  （2026-09-03 视觉验收）。全站浮层要统一质感，就不能留原生下拉。 */}
              <SelectRoot onValueChange={(value) => setRankingMetric(value as RankingMetric)} value={selectedRankingOption.key}>
                <SelectTrigger aria-label={t("modelsDiscovery.a11y.metricType")} triggerSize="sm" className="model-discovery-select-trigger model-discovery-metric-trigger">
                  <LuChartColumn className="shrink-0" size={14} />
                  <span className="model-discovery-metric-label">{t("modelsDiscovery.a11y.metricType")}</span>
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
                    <button className="model-discovery-provider-filter-trigger" title={providerFilter.length > 0 ? providerFilter.join("、") : t("modelsDiscovery.action.allVendors")} type="button">
                      <span>{providerFilter.length === 0 ? t("modelsDiscovery.action.allVendors") : providerFilter.slice(0, 2).join("、")}</span>
                      {providerFilter.length > 2 && <em>+{providerFilter.length - 2}</em>}
                      <LuChevronDown size={12} />
                    </button>
                  }
                  content={(close) => (
                    <>
                      <header><div><strong>{t("modelsDiscovery.filter.selectVendor")}</strong><span>{providerFilter.length === 0 ? t("modelsDiscovery.action.showingAll") : t("modelsDiscovery.filter.selectedCount", { count: providerFilter.length })}</span></div><button disabled={providerFilter.length === 0} onClick={() => setProviderFilter([])} type="button">重置</button></header>
                      <div className="model-discovery-provider-options">{providers.map((provider) => {
                        const selected = providerFilter.includes(provider);
                        return <button aria-pressed={selected} className={selected ? "selected" : ""} key={provider} onClick={() => toggleProvider(provider)} type="button"><i>{selected && <LuCheck size={11} />}</i><span>{provider}</span></button>;
                      })}</div>
                      <footer><span>{providerFilter.length === 0 ? t("modelsDiscovery.filter.vendorCount", { count: providers.length }) : t("modelsDiscovery.filter.vendorFiltered", { count: providerFilter.length })}</span><button onClick={close} type="button">完成</button></footer>
                    </>
                  )}
                />
              </div>
              <SelectRoot onValueChange={(value) => setTableAccess(value as "all" | "supported" | "pending")} value={tableAccess}>
                <SelectTrigger aria-label={t("modelsDiscovery.metric.integrationStatus")} triggerSize="sm" className="model-discovery-select-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("modelsDiscovery.filter.allStatus")}</SelectItem>
                  <SelectItem value="supported">{t("modelsDiscovery.filter.integrated")}</SelectItem>
                  <SelectItem value="pending">{t("modelsDiscovery.filter.pending")}</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>
          </div>
          {/* 语义表格（plan §3.2 模块 7：走现有 Table + Pagination，不手写表格体系）。
              横向滚动由 Table 自带的 overflow-auto 外层承担（配合 discovery-responsive.css
              里 .model-discovery-table 的 min-width:980px，窄屏才有滚动余量）——不要再额外套一层 div。
              .model-discovery-table-scroll 挂在那个外层上：原型契约
              (modelgo_prd scripts/assert-model-discovery.mjs:96) 与 TC-DISC-110 按此类名定位滚动容器，
              缺了会被判成「无横向滚动容器」而误报（prd#1006）。 */}
          <Table className="model-discovery-table" wrapperClassName="model-discovery-table-scroll">
            <TableHeader>
              <TableRow>
                <TableHead>{t("modelsDiscovery.table.rank")}</TableHead>
                <TableHead align="left">{t("modelsDiscovery.table.model")}</TableHead>
                <TableHead>{t("modelsDiscovery.table.status")}</TableHead>
                <TableHead>
                  {selectedMetricHeader}<em className="model-discovery-source-tag">{selectedMetricSource}</em>
                </TableHead>
                {supportingMetricHeaders.map((header) => <TableHead key={header}>{header}</TableHead>)}
                <TableHead><span className="sr-only">{t("modelsDiscovery.table.actions")}</span></TableHead>
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
              {tableModels.length === 0 && !tableLoading && tableError && (
                <TableRow>
                  <TableCell align="center" colSpan={8}>
                    <DiscoveryLoadError onRetry={refetchTable} text={t("modelsDiscovery.error.rankData")} />
                  </TableCell>
                </TableRow>
              )}
              {tableModels.length === 0 && !tableLoading && !tableError && (
                <TableRow>
                  <TableCell align="center" colSpan={8}>{t("modelsDiscovery.empty.noModelUnderFilter")}</TableCell>
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
                      <em className={isModelConnected(model) ? "supported" : "pending"}>{modelAccessLabel(t, model)}</em>
                    </TableCell>
                    <TableCell><b className="metric-primary">{selectedMetricValue(model)}</b></TableCell>
                    {supportingValues.map((value, valueIndex) => (
                      <TableCell key={`${model.name}-${valueIndex}`}>
                        {value.title
                          ? <span className="model-discovery-unit-price" title={value.title}>{value.text}</span>
                          : value.text}
                      </TableCell>
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
                        ? <button aria-label={modelDetailAriaLabel(model)} className="model-discovery-detail-btn" onClick={(event) => { event.stopPropagation(); openModelDetail(model); }} title={t("modelsDiscovery.action.viewDetail")} type="button">{t("modelsDiscovery.action.viewDetail")}<LuArrowUpRight size={13} /></button>
                        : <button aria-label={t("modelsDiscovery.status.pendingSupport", { name: model.name })} className="model-discovery-detail-btn" disabled title={t("modelsDiscovery.status.notIntegratedShort")} type="button">待支持</button>}
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
            totalLabel={t("modelsDiscovery.table.totalModels", { count: tableTotal })}
          />
        </div>
      </section>

      {modality === "agent" && <AgentPopularityLeaderboard />}
    </div>
  );
}

export default ModelDiscoveryPage
