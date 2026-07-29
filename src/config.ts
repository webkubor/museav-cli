/**
 * 配置管理 —— 环境变量 > 配置文件
 *
 * 两类凭证：
 *   - token：个人用户通过 `studio-image login` 设备授权拿到的 JWT（Bearer 鉴权）
 *   - apiKey：租户/B 端的 sk-studio-xxx（X-API-Key 鉴权）
 * token 优先于 apiKey（个人用户场景为主）。
 *
 * 配置文件：~/.studio-image.json，存 { baseUrl, token, apiKey }
 * 环境变量：STUDIO_BASE_URL / STUDIO_API_KEY（适合 CI / agent）
 */
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CONFIG_PATH = join(homedir(), '.studio-image.json')
export const DEFAULT_BASE_URL = 'https://studio.webkubor.online'

export interface StudioConfig {
  baseUrl: string
  /** 个人用户 JWT（login 获得），优先用 */
  token?: string
  /** 租户 apikey（sk-studio-xxx），B 端场景 */
  apiKey?: string
}

/** 读配置文件（不存在返回空对象） */
function readFileConfig(): Partial<StudioConfig> {
  try {
    if (!existsSync(CONFIG_PATH)) return {}
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

/** 写配置文件 */
export function saveConfig(patch: Partial<StudioConfig>): StudioConfig {
  const current = readFileConfig()
  const next: StudioConfig = {
    baseUrl: patch.baseUrl || current.baseUrl || DEFAULT_BASE_URL,
    token: 'token' in patch ? patch.token : current.token,
    apiKey: 'apiKey' in patch ? patch.apiKey : current.apiKey,
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
 * 优先级：STUDIO_API_KEY 环境变量 > 文件里的 token > 文件里的 apiKey
 * 缺任何凭证时抛错，提示 login 或 config
 */
export function loadConfig(): StudioConfig {
  const file = readFileConfig()
  const baseUrl = process.env.STUDIO_BASE_URL || file.baseUrl || DEFAULT_BASE_URL

  // 环境变量 apiKey 优先（CI/agent 场景）
  const envApiKey = process.env.STUDIO_API_KEY
  if (envApiKey) return { baseUrl, apiKey: envApiKey }

  // 文件里的 token（个人用户 login）优先于 apiKey
  if (file.token) return { baseUrl, token: file.token }
  if (file.apiKey) return { baseUrl, apiKey: file.apiKey }

  throw new Error(
    `未登录。请运行：studio-image login\n` +
    `（或租户/B端配置：studio-image config --apiKey sk-studio-xxx）`
  )
}
