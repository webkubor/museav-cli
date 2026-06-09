/**
 * 菜单权限同步脚本
 * 将 src/config/menu-sync-data.ts 定义的全部菜单推送到后端，后端按 key upsert。
 *
 * 使用：
 *   pnpm sync:menus                  # 推送到 test 环境（默认）
 *   MENUS_API_BASE=https://xxx pnpm sync:menus  # 自定义目标
 */

import { MENUS } from '../src/config/menu-sync-data.ts'

async function syncMenus() {
  const base = process.env.MENUS_API_BASE ?? 'https://modelgo-web-api.test.modelgo.com'
  const url = `${base}/api/v1/admin/menus/sync`

  console.log(`▶ Syncing ${MENUS.length} menus to ${url}`)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ menus: MENUS }),
  })

  const text = await res.text()

  if (!res.ok) {
    console.error(`✗ HTTP ${res.status}:`, text)
    process.exit(1)
  }

  try {
    const json = JSON.parse(text)
    const { upserted = '?', skipped = '?' } = json?.data ?? {}
    console.log(`✓ Done — upserted: ${upserted}, skipped: ${skipped}`)
  } catch {
    console.log('✓ Done:', text)
  }
}

syncMenus().catch((err) => {
  console.error('✗ Error:', err)
  process.exit(1)
})
