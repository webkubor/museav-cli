/**
 * 配置管理 —— 环境变量 > 配置文件
 *
 * 两类凭证：
 *   - token：个人用户通过 `museav login` 设备授权拿到的 JWT（Bearer 鉴权）
 *   - apiKey：租户/B 端的 sk-studio-xxx（X-API-Key 鉴权）
 * token 优先于 apiKey（个人用户场景为主）。
 *
 * 配置文件：~/.museav.json，存 { baseUrl, token, apiKey }
 * 环境变量：MUSEAV_BASE_URL / MUSEAV_API_KEY（旧名 STUDIO_BASE_URL / STUDIO_API_KEY 仍有效，
 *          中台文档与既有 CI 都在用，不能说停就停）
 */
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CONFIG_PATH = join(homedir(), '.museav.json')
/**
 * 更名前遗留在用户机器上的配置文件，按新到旧排列，**只读**兼容。
 *
 * 这两个文件名是历史事实（用户硬盘上真实存在的路径），不是本项目还在用的叫法——
 * 想读到它们就只能原样写出来。留着它们的理由不是念旧：apiKey 明文在中台只在创建那一次
 * 返回，很多租户唯一的一份就躺在这些文件里，直接不读 = 逼人去找管理员重置密钥。
 * 读到之后下一次 saveConfig 自然落到 ~/.museav.json，旧文件不动也不删。
 */
const LEGACY_CONFIG_PATHS = [
  join(homedir(), '.studio-cli.json'),
  join(homedir(), '.studio-image.json'),
]
/** 旧域名 webkubor.online 已弃用，API 统一走 manager.museav.top。 */
export const DEFAULT_BASE_URL = 'https://manager.museav.top'

export interface StudioConfig {
  baseUrl: string
  /** 个人用户 JWT（login 获得），优先用 */
  token?: string
  /** 租户 apikey（sk-studio-xxx），B 端场景 */
  apiKey?: string
  /**
   * 租户自己后台的域名（如 https://manager.hympro.cn）。
   * 只给 `products` / `assets` 两个命令用——那两个命令查的是租户自己的产品/素材数据，
   * 数据物理上不在 Studio 中台，而在租户自己的数据库，所以要单独一个 base url。
   * 已知租户（hym / mzmeso）不配也能跑（TenantClient 内置了默认值），
   * 其他租户或本地联调时才需要显式配置。
   */
  tenantBaseUrl?: string
}

/**
 * 读配置文件（不存在返回空对象）。
 * 新路径缺失时按 LEGACY_CONFIG_PATHS 从新到旧回落，读到什么用什么——
 * 下一次 saveConfig 会自然写到新路径，不主动搬文件、不删旧文件。
 */
function readFileConfig(): Partial<StudioConfig> {
  for (const path of [CONFIG_PATH, ...LEGACY_CONFIG_PATHS]) {
    try {
      if (!existsSync(path)) continue
      return JSON.parse(readFileSync(path, 'utf-8'))
    } catch {
      // 坏掉的那份跳过，继续试下一个
    }
  }
  return {}
}

/** 写配置文件 */
export function saveConfig(patch: Partial<StudioConfig>): StudioConfig {
  const current = readFileConfig()
  const next: StudioConfig = {
    baseUrl: patch.baseUrl || current.baseUrl || DEFAULT_BASE_URL,
    token: 'token' in patch ? patch.token : current.token,
    apiKey: 'apiKey' in patch ? patch.apiKey : current.apiKey,
    tenantBaseUrl: 'tenantBaseUrl' in patch ? patch.tenantBaseUrl : current.tenantBaseUrl,
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 })
  // mode 只在文件新建时生效；已存在的旧配置文件（可能是更早版本用默认权限创建的）显式收紧一次
  chmodSync(CONFIG_PATH, 0o600)
  return next
}

/** 清除登录态（token），保留其他配置 */
export function clearToken(): StudioConfig {
  return saveConfig({ token: '' })
}

/**
 * 解析最终配置：环境变量 > 配置文件 > 默认值
 * 优先级：MUSEAV_API_KEY / STUDIO_API_KEY 环境变量 > 文件里的 token > 文件里的 apiKey
 * 缺任何凭证时抛错，提示 login 或 config
 *
 * 改名后新增 MUSEAV_* 两个环境变量，旧的 STUDIO_* 继续认：中台对外文档和已经跑起来的
 * CI 里写的都是 STUDIO_API_KEY，改名不该让别人的流水线在毫无预警的情况下断掉。
 * 两个都设时以 MUSEAV_* 为准（显式用了新名字就是明确意图）。
 */
export function loadConfig(): StudioConfig {
  const file = readFileConfig()
  const baseUrl = process.env.MUSEAV_BASE_URL || process.env.STUDIO_BASE_URL || file.baseUrl || DEFAULT_BASE_URL
  // tenantBaseUrl 只来自配置文件（没有对应的环境变量），跟 token/apiKey 的取舍无关，
  // 统一透出去，用不用由调用方（目前只有 products/assets 两个命令）决定
  const tenantBaseUrl = file.tenantBaseUrl

  // 环境变量 apiKey 优先（CI/agent 场景）
  const envApiKey = process.env.MUSEAV_API_KEY || process.env.STUDIO_API_KEY
  if (envApiKey) return { baseUrl, apiKey: envApiKey, tenantBaseUrl }

  // 文件里的 token（个人用户 login）优先于 apiKey
  if (file.token) return { baseUrl, token: file.token, tenantBaseUrl }
  if (file.apiKey) return { baseUrl, apiKey: file.apiKey, tenantBaseUrl }

  throw new Error(
    `未登录。请运行：museav login\n` +
    `（或租户/B端配置：museav config --apiKey sk-studio-xxx）`
  )
}
