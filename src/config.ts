/**
 * 配置管理 —— 环境变量 > 配置文件
 *
 * 配置文件：~/.studio-image.json，存 { baseUrl, apiKey }
 * 环境变量：STUDIO_BASE_URL / STUDIO_API_KEY（优先级更高，适合 CI / agent）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CONFIG_PATH = join(homedir(), '.studio-image.json')
export const DEFAULT_BASE_URL = 'https://studio.webkubor.online'

export interface StudioConfig {
  baseUrl: string
  apiKey: string
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
    apiKey: patch.apiKey || current.apiKey || '',
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n')
  return next
}

/**
 * 解析最终配置：环境变量 > 配置文件 > 默认值
 * 缺 apiKey 时抛错，提示用户先 config
 */
export function loadConfig(): StudioConfig {
  const file = readFileConfig()
  const baseUrl = process.env.STUDIO_BASE_URL || file.baseUrl || DEFAULT_BASE_URL
  const apiKey = process.env.STUDIO_API_KEY || file.apiKey || ''
  if (!apiKey) {
    throw new Error(
      `未配置 apiKey。请运行：studio-image config --apiKey sk-studio-xxx\n` +
      `或设置环境变量：export STUDIO_API_KEY=sk-studio-xxx`
    )
  }
  return { baseUrl, apiKey }
}
