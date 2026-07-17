/**
 * API Key 页共享的类型、常量与纯函数 helper
 */
import { LuUser, LuBuilding2, LuUsers, LuZap } from 'react-icons/lu'
import { SiCurl } from 'react-icons/si'
import type { DateRangeValue } from '@/components/ui/DateRangePicker'
import { addFromNowISO, endOfLocalDayISO, type TimeUnit } from '@/lib/datetime'
import { marketFromHostname } from '@/lib/market-domain'
import Claude from '@lobehub/icons/es/Claude'
import ClaudeCode from '@lobehub/icons/es/ClaudeCode'
import Codex from '@lobehub/icons/es/Codex'
import OpenAI from '@lobehub/icons/es/OpenAI'

export type ScopeType = 'personal' | 'workspace' | 'member'
export type ConnectActionKey = 'mgc' | 'cc-switch' | 'claude-code' | 'codex' | 'openai-sdk' | 'curl'

export type ConnectParam = {
  label: string
  value: string
}

export type ConnectSnippet = {
  id: ConnectActionKey
  title: string
  desc: string
  launchLabel: string
  launchHref: string
  copyLabel: string
  params: ConnectParam[]
  copyText: string
  command?: string
}

export const SCOPE_OPTIONS: { value: ScopeType; icon: React.ReactNode; label: string; desc: string }[] = [
  {
    value: 'personal',
    icon: <LuUser className="w-4 h-4" />,
    label: '个人',
    desc: '仅供当前账户个人使用',
  },
  {
    value: 'workspace',
    icon: <LuBuilding2 className="w-4 h-4" />,
    label: '工作空间',
    desc: '工作空间服务集成使用',
  },
  {
    value: 'member',
    icon: <LuUsers className="w-4 h-4" />,
    label: '成员',
    desc: '代表指定成员创建密钥',
  },
]

export const EXPIRATION_PRESETS = [
  { key: 'all', label: '永不过期' },
  { key: '24h', label: '24 小时后' },
  { key: '7d', label: '7 天后' },
  { key: '30d', label: '30 天后' },
  { key: '1y', label: '1 年后' },
  { key: 'custom', label: '自定义截止日期' },
]

/**
 * 限额周期（PRD §8.2）：不限额 / 每日 / 每月 / 总额。
 * none = 不限额（金额输入禁用，不下发 spending_limit）。
 * total = 总额（生命周期上限）后端独立 period_unit 待 #420；落地前按 period_unit='total' 上报兜底。
 */
export type LimitPeriod = 'none' | 'day' | 'month' | 'total'

export const LIMIT_PERIOD_OPTIONS: { value: LimitPeriod; label: string }[] = [
  { value: 'none', label: '不限额' },
  { value: 'day', label: '每日' },
  { value: 'month', label: '每月' },
  { value: 'total', label: '总额' },
]

/** 周期 → 展示文案（含兼容旧数据 hour/week） */
export const LIMIT_PERIOD_LABEL: Record<string, string> = {
  none: '不限额',
  day: '每日',
  month: '每月',
  total: '总额',
  hour: '每小时',
  week: '每周',
}

/**
 * 把过期时间选择器的值解析成后端要的 ISO 时刻；永不过期返回 null。
 * 创建/编辑两处共用，避免各写一份导致行为漂移。
 *
 * 自定义截止日：取「用户显示时区下所选日的当天结束」再转 UTC（见 @/lib/datetime）。
 * 原生 new Date 按浏览器时区解析裸日期，用户改过显示时区就会偏、密钥提前失效。
 * 相对预设：从当前时刻往后推。
 */
export function resolveExpiryISO(range: DateRangeValue): string | null {
  if (!range.preset || range.preset === 'all') return null
  if (range.preset === 'custom') {
    return range.endDate ? endOfLocalDayISO(range.endDate) : null
  }
  const offsets: Record<string, [number, TimeUnit]> = {
    '1h': [1, 'hour'],
    '24h': [1, 'day'],
    '7d': [7, 'day'],
    '30d': [30, 'day'],
    '1y': [365, 'day'],
  }
  const offset = offsets[range.preset]
  return offset ? addFromNowISO(offset[0], offset[1]) : null
}

export const CONNECT_ACTIONS: {
  key: ConnectActionKey
  label: string
  desc: string
  icon: React.ReactNode
}[] = [
  {
    key: 'mgc',
    label: '一键接入',
    desc: '勾选即用',
    icon: <LuZap size={16} className="text-brand-base" />,
  },
  {
    key: 'cc-switch',
    label: 'CC Switch',
    desc: '一键切换',
    icon: <img src="/tools/cc-switch.png" alt="" className="h-4 w-4 rounded-sm" />,
  },
  {
    key: 'claude-code',
    label: 'Claude Code',
    desc: '终端接入',
    icon: <ClaudeCode.Color size={16} />,
  },
  {
    key: 'codex',
    label: 'Codex',
    desc: '配置导入',
    icon: <Codex.Color size={16} />,
  },
  {
    key: 'openai-sdk',
    label: 'OpenAI SDK',
    desc: '代码示例',
    icon: <OpenAI size={16} />,
  },
  {
    key: 'curl',
    label: 'cURL',
    desc: '连通检查',
    icon: <SiCurl className="h-4 w-4" style={{ color: '#073551' }} />,
  },
]

export const getConnectAction = (id: string) => CONNECT_ACTIONS.find((action) => action.key === id)

/** @model-go/config 一键接入：可勾选的常用客户端（id 对应 CLI 的 --only 值） */
export const MGC_CLIENT_OPTIONS: { id: string; label: string }[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'crush', label: 'Crush' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'copilot', label: 'Copilot CLI' },
  { id: 'factory', label: 'Factory' },
]

/**
 * 从网关地址推导站点，复用域名→市场唯一真源（market-domain）。
 * 注意返回的是 @model-go/config CLI 的 --region 取值（外部已发布契约，只认
 * global | domestic），不是前端 Market（'china' | 'global'）——市场词汇改名不改 CLI 参数。
 */
export function deriveRegionFromBaseUrl(baseUrl: string): 'global' | 'domestic' {
  let market: 'china' | 'global'
  try {
    market = marketFromHostname(new URL(baseUrl).hostname)
  } catch {
    market = marketFromHostname(baseUrl)
  }
  return market === 'global' ? 'global' : 'domestic'
}

/**
 * 生成 @model-go/config 一键接入命令：Key 与站点已预填，客户端由 UI 勾选。
 * all=true → --only all；否则用所选 id；一个都没选时回退到 claude,codex。
 */
export function buildMgcCommand(args: {
  apiKey: string
  region: 'global' | 'domestic'
  selected: string[]
  all: boolean
}): string {
  const only = args.all ? 'all' : args.selected.length ? args.selected.join(',') : 'claude,codex'
  return `npx @model-go/config -k ${args.apiKey} -r ${args.region} --only ${only}`
}

export function formatEndpointDisplay(baseUrl: string) {
  try {
    const url = new URL(baseUrl)
    const path = url.pathname === '/' ? '' : url.pathname
    return `${url.hostname}${path}`
  } catch {
    return baseUrl.replace(/^https?:\/\//, '')
  }
}

export function getGatewayVisual(index: number) {
  if (index === 0) {
    return { label: 'OpenAI', icon: <OpenAI size={16} /> }
  }

  return { label: 'Anthropic', icon: <Claude.Color size={16} /> }
}

/**
 * 根据当前网关地址与（可选的）新建密钥构建各工具的接入配置片段。
 * createdKeyText 为空时用占位符，便于未创建密钥时也能预览参数。
 */
export function buildConnectSnippets(args: {
  openAIBaseUrl: string
  anthropicBaseUrl: string
  createdKeyText: string
  docsUrl: string
}): ConnectSnippet[] {
  const { openAIBaseUrl, anthropicBaseUrl, createdKeyText, docsUrl } = args
  const keyForSnippet = createdKeyText || '<YOUR_MODELGO_API_KEY>'

  const buildCcSwitchProviderLink = (app: 'claude' | 'codex', endpoint: string) => {
    const params = new URLSearchParams({
      resource: 'provider',
      app,
      name: 'ModelGo',
      endpoint,
    })
    if (createdKeyText) {
      params.set('apiKey', createdKeyText)
    }
    return `ccswitch://v1/import?${params.toString()}`
  }

  const buildClaudeCodeLink = () => {
    const prompt = [
      '请帮我在 Claude Code 中接入 ModelGo。',
      '',
      '使用下面的 Anthropic 协议地址，只写入本机环境或本地忽略配置，不要提交密钥：',
      `ANTHROPIC_BASE_URL=${anthropicBaseUrl}`,
      `ANTHROPIC_API_KEY=${keyForSnippet}`,
    ].join('\n')
    return `claude-cli://open?q=${encodeURIComponent(prompt)}`
  }

  return [
    {
      id: 'cc-switch',
      title: 'CC Switch 导入 Provider',
      desc: '拉起 CC Switch，直接导入 Claude Provider。',
      launchLabel: '拉起 CC Switch',
      launchHref: buildCcSwitchProviderLink('claude', anthropicBaseUrl),
      copyLabel: '复制参数',
      params: [
        { label: 'Provider Name', value: 'ModelGo' },
        { label: 'App', value: 'Claude' },
        { label: 'Endpoint', value: anthropicBaseUrl },
        { label: 'API Key', value: keyForSnippet },
      ],
      copyText: [
        'Provider Name: ModelGo',
        'App: Claude',
        `Endpoint: ${anthropicBaseUrl}`,
        `API Key: ${keyForSnippet}`,
      ].join('\n'),
    },
    {
      id: 'claude-code',
      title: 'Claude Code 参数',
      desc: '打开 Claude Code 终端，预填 ModelGo 接入提示。',
      launchLabel: '打开 Claude Code',
      launchHref: buildClaudeCodeLink(),
      copyLabel: '复制终端命令',
      params: [
        { label: 'ANTHROPIC_BASE_URL', value: anthropicBaseUrl },
        { label: 'ANTHROPIC_API_KEY', value: keyForSnippet },
      ],
      copyText: [
        `export ANTHROPIC_BASE_URL="${anthropicBaseUrl}"`,
        `export ANTHROPIC_API_KEY="${keyForSnippet}"`,
        'claude',
      ].join('\n'),
      command: [
        `export ANTHROPIC_BASE_URL="${anthropicBaseUrl}"`,
        `export ANTHROPIC_API_KEY="${keyForSnippet}"`,
        'claude',
      ].join('\n'),
    },
    {
      id: 'codex',
      title: 'Codex Provider 导入',
      desc: '通过 CC Switch 导入 Codex Provider。',
      launchLabel: '导入 Codex 配置',
      launchHref: buildCcSwitchProviderLink('codex', openAIBaseUrl),
      copyLabel: '复制参数',
      params: [
        { label: 'Provider Name', value: 'ModelGo' },
        { label: 'App', value: 'Codex' },
        { label: 'Base URL', value: openAIBaseUrl },
        { label: 'API Key', value: keyForSnippet },
      ],
      copyText: [
        'Provider Name: ModelGo',
        'App: Codex',
        `Base URL: ${openAIBaseUrl}`,
        `API Key: ${keyForSnippet}`,
      ].join('\n'),
    },
    {
      id: 'openai-sdk',
      title: 'Node.js SDK 示例',
      desc: '打开开发文档查看 SDK 接入方式。',
      launchLabel: '打开 SDK 文档',
      launchHref: docsUrl,
      copyLabel: '复制代码示例',
      params: [
        { label: 'baseURL', value: openAIBaseUrl },
        { label: 'apiKey', value: keyForSnippet },
      ],
      copyText: [
        "import OpenAI from 'openai'",
        '',
        'const client = new OpenAI({',
        `  apiKey: '${keyForSnippet}',`,
        `  baseURL: '${openAIBaseUrl}',`,
        '})',
        '',
        'const models = await client.models.list()',
        'process.stdout.write(JSON.stringify(models.data, null, 2))',
      ].join('\n'),
      command: [
        "import OpenAI from 'openai'",
        '',
        'const client = new OpenAI({',
        `  apiKey: '${keyForSnippet}',`,
        `  baseURL: '${openAIBaseUrl}',`,
        '})',
      ].join('\n'),
    },
    {
      id: 'curl',
      title: '接口连通性检查',
      desc: '打开接口文档确认路径与参数。',
      launchLabel: '打开接口文档',
      launchHref: docsUrl,
      copyLabel: '复制 cURL 命令',
      params: [
        { label: 'Method', value: 'GET' },
        { label: 'URL', value: `${openAIBaseUrl}/models` },
        { label: 'Header', value: `Authorization: Bearer ${keyForSnippet}` },
      ],
      copyText: [
        `curl "${openAIBaseUrl}/models" \\`,
        `  -H "Authorization: Bearer ${keyForSnippet}"`,
      ].join('\n'),
      command: [
        `curl "${openAIBaseUrl}/models" \\`,
        `  -H "Authorization: Bearer ${keyForSnippet}"`,
      ].join('\n'),
    },
  ]
}
