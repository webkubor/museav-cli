/**
 * 客服模块用到的 i18n key 必须在中英两份 locales 里都取得到。
 *
 * 2026-09-16 test 实测踩到：`t('common.customerService.thanks')` 的文案实际挂在
 * `customerService.rating.thanks`（多一层）。i18n 取不到时不报错、不抛异常，
 * 而是把 key 原样渲染出来 —— 页面上真的显示了一行 "common.customerService.thanks"。
 * 点赞的条件渲染、按钮变色全都是对的，从外面看却像「§8.4 感谢反馈没生效」，
 * 查了一圈代码才定位到是文案路径。
 *
 * 这类错的特征：不报错、不崩、类型检查也过，只有肉眼看见页面才发现 —— 所以用断言兜。
 *
 * 源码用 import.meta.glob 以 ?raw 读进来，不走 node:fs：本仓是浏览器应用的
 * tsconfig，不带 node 类型，import 了 fs 连类型检查都过不去。
 */
import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import zh from '@/locales/zh/common.json'

const sources = import.meta.glob('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

function collectKeys(): string[] {
  const keys = new Set<string>()
  for (const [path, src] of Object.entries(sources)) {
    if (/\.test\./.test(path)) continue
    for (const m of src.matchAll(/t\(\s*'(common\.customerService\.[A-Za-z0-9_.]+)'/g)) keys.add(m[1])
  }
  return [...keys].sort()
}

const resolve = (bundle: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], bundle)

describe('客服模块的 i18n key 都能取到文案', () => {
  const keys = collectKeys()

  it('至少扫到一批 key（扫不到说明正则或 glob 失效，测试会变成空转）', () => {
    expect(keys.length).toBeGreaterThan(5)
  })

  it.each(keys)('%s 在 zh 与 en 里都有文案', (key) => {
    expect(typeof resolve(zh, key), `zh 缺 ${key} —— 取不到时 i18n 会把 key 原样渲染到页面上`).toBe('string')
    expect(typeof resolve(en, key), `en 缺 ${key}`).toBe('string')
  })
})
