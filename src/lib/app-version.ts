/**
 * 应用版本信息：
 * - 当前版本 = 构建时烘焙进包的常量（__APP_VERSION__ / __BUILD_COMMIT__ / __BUILD_TIME__）。
 * - 最新版本 = 运行时拉取服务器 /version.json（每次部署产出，见 vite.config emitVersionJson）。
 * 用于「新版本强制更新弹窗」展示「当前 → 最新」对比（需求方#233）。
 */
export interface AppVersionInfo {
  version: string
  commit: string
  time: string
}

/** 当前正在运行的版本（烘焙进当前 bundle） */
export const CURRENT_VERSION: AppVersionInfo = {
  version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
  commit: typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : '',
  time: typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '',
}

/** 拉取服务器最新部署的版本（带时间戳绕过缓存 + no-store，避免读到旧缓存） */
export async function fetchLatestVersion(): Promise<AppVersionInfo | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    if (data && typeof data === 'object') return data as AppVersionInfo
    return null
  } catch {
    return null
  }
}

/** ISO 时间 → 「MM-DD HH:mm」；解析失败原样返回 */
export function formatBuildTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 组合成一行短标识：v1.0.3 · a1b2c3 · 07-23 16:40（缺项自动省略） */
export function formatVersionLine(info: AppVersionInfo): string {
  return [
    info.version ? `v${info.version}` : '',
    info.commit,
    formatBuildTime(info.time),
  ].filter(Boolean).join(' · ')
}
