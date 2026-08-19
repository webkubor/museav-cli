import { describe, expect, it } from 'vitest'

// 守卫：登录/注册路径上**不许再出现本地冷却**（shared/modelgo_prd#721）。
//
// 原来那套（front-guard）把失败计数存在 localStorage 里：换隐私窗口、清站点数据、直接打接口
// 全都绕过，所以对攻击者零作用；而它比服务端更严（3 次就锁 30 秒起，服务端到第 5 次才要求解一次
// 滑块），多出来的严格只落在真实用户头上。判定已经挪进风控模块，这条断言防止它以任何形式回来。
//
// 用 import.meta.glob 而不是 node:fs：app 的 tsconfig 不含 node 类型，用 fs 会让 pre-commit 的
// tsc 直接失败（实测踩过）。
const sources = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

describe('no local cooldown (#721)', () => {
  it('src 下不再 import front-guard，也不再有 auth_guard 存储键', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.endsWith('no-local-cooldown.test.ts'))
      .filter(([, body]) => /from '@\/lib\/auth\/front-guard'/.test(body) || /auth_guard:/.test(body))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })

  it('front-guard 模块本身已删除', () => {
    const paths = Object.keys(sources)
    expect(paths.filter((p) => p.includes('lib/auth/front-guard'))).toEqual([])
  })
})
