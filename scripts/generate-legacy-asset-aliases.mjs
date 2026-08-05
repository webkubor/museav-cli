/**
 * 生产旧 hash 资源兼容别名
 * 职责：构建完成后，为近期线上 HTML 已引用过的旧 JS hash 生成同名兼容文件。
 * 背景：静态服务把缺失的 /assets/*.js fallback 成 index.html，会触发 module MIME 白屏。
 */
import { copyFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const assetsDir = path.resolve(process.cwd(), 'dist/assets')

const legacyAliases = [
  { legacy: 'index-B2mqdo5A.js', prefix: 'index' },
  { legacy: 'vendor-react-Ds7iS9xc.js', prefix: 'vendor-react' },
  { legacy: 'vendor-i18n-PaLHWX5k.js', prefix: 'vendor-i18n' },
  { legacy: 'common-mK9psa0S.js', prefix: 'common' },
  { legacy: 'common-DYiGkTv6.js', prefix: 'common' },
  { legacy: 'request-CmSUi7fW.js', prefix: 'request', excludePrefixes: ['request-error-message'] },
  { legacy: 'request-error-message-CF5HWWmi.js', prefix: 'request-error-message' },
  { legacy: 'utils-4Bfu84db.js', prefix: 'utils' },
  { legacy: 'workspaces-CGRL2Iiu.js', prefix: 'workspaces' },
  { legacy: 'tenants-BOjgbuTN.js', prefix: 'tenants' },
]

async function newestCandidate(files, alias) {
  const candidates = files.filter((file) => {
    if (!file.endsWith('.js') || !file.startsWith(`${alias.prefix}-`)) return false
    return !alias.excludePrefixes?.some((prefix) => file.startsWith(`${prefix}-`))
  })
  if (candidates.length === 0) return null

  const stats = await Promise.all(
    candidates.map(async (file) => ({
      file,
      mtimeMs: (await stat(path.join(assetsDir, file))).mtimeMs,
    })),
  )
  return stats.sort((a, b) => b.mtimeMs - a.mtimeMs || a.file.localeCompare(b.file))[0].file
}

const files = await readdir(assetsDir)
const copied = []

for (const alias of legacyAliases) {
  const current = await newestCandidate(files, alias)
  const { legacy } = alias
  if (!current || current === legacy) continue
  await copyFile(path.join(assetsDir, current), path.join(assetsDir, legacy))
  copied.push(`${legacy} -> ${current}`)
}

if (copied.length > 0) {
  process.stdout.write(`legacy asset aliases generated:\n${copied.join('\n')}\n`)
}
