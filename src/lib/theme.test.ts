import { afterEach, describe, expect, it } from 'vitest'
import { getMarketDefaultTheme, getUserTheme, isThemeLockedToDark, resolveTheme, saveTheme } from '@/lib/theme'
import { storageKeys } from '@/lib/storage'

// qa：国外(global)控制台产品决策——不提供主题选择，写死深色。resolveTheme/saveTheme
// 是所有主题读写的收口点（PreferencesTab 开关、dev-toolbar、文档站 ?theme= 跳转都走这里），
// 在这两处强制锁死，比在每个调用点分别判断更不容易漏。
function setMarketViaQuery(market: 'china' | 'global' | null) {
  window.history.pushState(null, '', market ? `/?market=${market}` : '/')
}

describe('theme lock for global market', () => {
  afterEach(() => {
    setMarketViaQuery(null)
    localStorage.clear()
  })

  it('china 市场不锁定，system 主题走浏览器偏好', () => {
    setMarketViaQuery('china')
    expect(isThemeLockedToDark()).toBe(false)
    expect(resolveTheme('light')).toBe('light')
  })

  it('global 市场下 resolveTheme 无视传入值，始终返回 dark', () => {
    setMarketViaQuery('global')
    expect(isThemeLockedToDark()).toBe(true)
    expect(resolveTheme('light')).toBe('dark')
    expect(resolveTheme('dark')).toBe('dark')
    expect(resolveTheme('system')).toBe('dark')
  })

  it('global 市场默认主题是 dark', () => {
    setMarketViaQuery('global')
    expect(getMarketDefaultTheme()).toBe('dark')
  })

  it('global 市场下 saveTheme 不会把 light 写进 localStorage（避免存的偏好跟渲染结果不一致）', () => {
    setMarketViaQuery('global')
    saveTheme('light')
    expect(localStorage.getItem(storageKeys.theme())).toBe('dark')
  })

  it('china 市场下 saveTheme 正常存用户选的值', () => {
    setMarketViaQuery('china')
    saveTheme('light')
    expect(localStorage.getItem(storageKeys.theme())).toBe('light')
  })
})

// dev-toolbar 曾经 saveTheme(next) 不传 userId，只写匿名 key；而 DashboardHeader 的
// useEffect([account]) 用 getUserTheme(account_id) 重新 applyTheme，用户 key 里的旧值
// 会把切换翻回去，表现成「点了没反应」。这两条钉住「匿名 key 不得遮蔽用户 key」的口径。
describe('匿名 key 与用户 key 的优先级', () => {
  afterEach(() => {
    setMarketViaQuery(null)
    localStorage.clear()
  })

  it('用户 key 存在时，只写匿名 key 改不动该用户的主题', () => {
    setMarketViaQuery('china')
    saveTheme('dark', 'u1')
    saveTheme('light') // 不带 userId：只落匿名 key
    expect(getUserTheme('u1')).toBe('dark')
    expect(localStorage.getItem(storageKeys.theme())).toBe('light')
  })

  it('带上 userId 才能真正改掉该用户的主题', () => {
    setMarketViaQuery('china')
    saveTheme('dark', 'u1')
    saveTheme('light', 'u1')
    expect(getUserTheme('u1')).toBe('light')
  })
})
