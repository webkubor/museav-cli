import {
  PERMISSION_SYNC_PAYLOAD,
  permissionCatalogMeta,
  validatePermissionCatalog,
} from '../src/config/permission-catalog.ts'

type SyncMode = 'check' | 'dry-run' | 'apply'

interface ApiEnvelope {
  code: number
  msg?: string
  data?: unknown
  request_id?: string
  trace_id?: string
}

const DEFAULT_API_BASE = 'https://modelgo-controller.test.modelgo.com/api/v1'

function readMode(args: readonly string[]): SyncMode {
  const selected = [
    args.includes('--check') ? 'check' : null,
    args.includes('--dry-run') ? 'dry-run' : null,
    args.includes('--apply') ? 'apply' : null,
  ].filter((mode): mode is SyncMode => mode !== null)

  if (selected.length > 1) throw new Error('只能选择 --check、--dry-run、--apply 中的一项')
  // 缺省即正式同步：`npm run sync:permissions` 直接触发 apply；
  // 预览用 -- --dry-run，仅本地校验用 -- --check。
  return selected[0] ?? 'apply'
}

function normalizedApiBase(): string {
  return (process.env.PERMISSIONS_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, '')
}

// catalog/sync 是内网免鉴权的开发期脚手架接口（设计决定，2026-07-14），token
// 非必需；设置 PERMISSIONS_ADMIN_TOKEN 时仍随请求携带，便于未来收口无需改脚本。
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

async function syncRemote(mode: Exclude<SyncMode, 'check'>): Promise<unknown> {
  const dryRun = mode === 'dry-run'
  const url = `${normalizedApiBase()}/menu-permissions/catalog/sync?dry_run=${String(dryRun)}`
  const token = optionalAdminToken()
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(PERMISSION_SYNC_PAYLOAD),
  })

  return (await readEnvelope(response)).data
}

async function main(): Promise<void> {
  const mode = readMode(process.argv.slice(2))
  assertLocalCatalog()
  console.log(`✓ 本地权限目录校验通过：${permissionCatalogMeta.menu_count} 个菜单 / ${permissionCatalogMeta.permission_count} 个 Permission ID`)

  if (mode === 'check') {
    console.log('仅执行本地校验；远端对账使用 --dry-run，正式同步直接 npm run sync:permissions')
    return
  }

  console.log(`${mode === 'dry-run' ? '▶ Dry-run' : '▶ Apply'}：${normalizedApiBase()}/menu-permissions/catalog/sync`)
  const result = await syncRemote(mode)
  console.log(JSON.stringify(result ?? {}, null, 2))
}

main().catch((error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
