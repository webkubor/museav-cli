import {
  catalogPayloadForMarket,
  marketPermissionDiff,
  permissionCatalogMeta,
  validatePermissionCatalog,
} from '../src/config/permission-catalog.ts'

type SyncMode = 'check' | 'dry-run' | 'apply'
/** 市场维度：同一套码在国内/国外可有不同菜单集（如发票仅国内）。 */
type SyncMarket = 'china' | 'global'

interface ApiEnvelope {
  code: number
  msg?: string
  data?: unknown
  request_id?: string
  trace_id?: string
}

// 推送只打**测试环境**(单一域名);上线由服务器把测试库提生产,不在此推生产。
const DEFAULT_API_BASE = 'https://modelgo-controller.test.modelgo.com/api/v1'

function apiBase(): string {
  return (process.env.PERMISSIONS_API_BASE?.trim() || DEFAULT_API_BASE).replace(/\/$/, '')
}

function readMode(args: readonly string[]): SyncMode {
  const selected = [
    args.includes('--check') ? 'check' : null,
    args.includes('--dry-run') ? 'dry-run' : null,
    args.includes('--apply') ? 'apply' : null,
  ].filter((mode): mode is SyncMode => mode !== null)

  if (selected.length > 1) throw new Error('只能选择 --check、--dry-run、--apply 中的一项')
  return selected[0] ?? 'apply'
}

/** 市场必须显式指定：--market china（推国内菜单）| --market global（推国外菜单）。 */
function readMarket(args: readonly string[]): SyncMarket {
  const i = args.indexOf('--market')
  const value = i >= 0 ? args[i + 1] : undefined
  if (value === 'china' || value === 'global') return value
  throw new Error('缺少市场参数：--market china（推国内菜单）或 --market global（推国外菜单）')
}

function optionalAdminToken(): string | undefined {
  const token = process.env.PERMISSIONS_ADMIN_TOKEN?.trim()
  return token || undefined
}

function assertLocalCatalog(): void {
  const errors = validatePermissionCatalog()
  if (errors.length > 0) {
    throw new Error(`权限目录校验失败：\n- ${errors.join('\n- ')}`)
  }
}

async function readEnvelope(response: Response): Promise<ApiEnvelope> {
  const text = await response.text()
  let envelope: ApiEnvelope
  try {
    envelope = JSON.parse(text) as ApiEnvelope
  } catch {
    throw new Error(`权限同步接口返回非 JSON：HTTP ${response.status} ${text.slice(0, 300)}`)
  }
  if (!response.ok || envelope.code !== 0) {
    const requestRef = envelope.request_id ?? envelope.trace_id
    const suffix = requestRef ? `，request=${requestRef}` : ''
    throw new Error(`权限同步失败：HTTP ${response.status} / code ${envelope.code} / ${envelope.msg ?? 'unknown'}${suffix}`)
  }
  return envelope
}

async function syncRemote(mode: Exclude<SyncMode, 'check'>, market: SyncMarket): Promise<Record<string, unknown>> {
  const dryRun = mode === 'dry-run'
  // market 走 query（后端 body schema 严格）;body 用**按市场过滤后**的目录(国外剔除发票等国内特例)。
  const url = `${apiBase()}/menu-permissions/catalog/sync?dry_run=${String(dryRun)}&market=${market}`
  const token = optionalAdminToken()
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(catalogPayloadForMarket(market)),
  })
  return (await readEnvelope(response)).data as Record<string, unknown> ?? {}
}

/** 推送前核对：两市场各自菜单/权限数 + 仅国内/仅国外的差异,确保一开始就推对。 */
function printMarketDiff(): void {
  const d = marketPermissionDiff()
  console.log('── 国内/国外菜单差异(推送前核对) ──')
  console.log(`  国内 china ：${d.china.menus} 菜单 / ${d.china.perms} 权限`)
  console.log(`  国外 global：${d.global.menus} 菜单 / ${d.global.perms} 权限`)
  console.log(`  仅国内(${d.onlyChina.length})：${d.onlyChina.join('、') || '无'}`)
  console.log(`  仅国外(${d.onlyGlobal.length})：${d.onlyGlobal.join('、') || '无'}`)
}

/** 高亮本次同步的增量,让运营一眼看清动了什么。 */
function printDelta(result: Record<string, unknown>): void {
  const arr = (k: string): string[] => (Array.isArray(result[k]) ? (result[k] as string[]) : [])
  if (result.has_changes === false) {
    console.log('· 无变更：后端目录已与本地一致')
    return
  }
  const rows: Array<[string, string[]]> = [
    ['新增菜单', arr('created_menu_keys')],
    ['新增权限', arr('created_permission_ids')],
    ['更新菜单', arr('updated_menu_keys')],
    ['废弃菜单', arr('deprecated_menu_keys')],
  ]
  for (const [label, ids] of rows) {
    if (ids.length) console.log(`· ${label}(${ids.length})：${ids.join('、')}`)
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const mode = readMode(args)
  assertLocalCatalog()
  console.log(`✓ 本地权限目录校验通过：${permissionCatalogMeta.menu_count} 个菜单 / ${permissionCatalogMeta.permission_count} 个 Permission ID`)

  if (mode === 'check') {
    // check 不推送,只本地核对两市场差异
    printMarketDiff()
    console.log('（远端对账用 --dry-run；正式推送 sync:permissions:cn / sync:permissions:global）')
    return
  }

  const market = readMarket(args)
  const label = market === 'china' ? '国内' : '国外'
  console.log(`${mode === 'dry-run' ? '▶ Dry-run' : '▶ Apply'} [${label} · market=${market}]：${apiBase()}/menu-permissions/catalog/sync`)
  const result = await syncRemote(mode, market)
  printDelta(result)
}

main().catch((error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
