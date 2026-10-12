import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installDataLayerIdentitySync, pushDataLayer, resetDataLayerIdentityForTest } from './gtm-datalayer'
import { useAuthStore } from '@/store/auth'

const dl = () => (window as Window & { dataLayer?: Record<string, unknown>[] }).dataLayer ?? []

describe('gtm-datalayer', () => {
  let unsubscribe = () => {}

  beforeEach(() => {
    ;(window as Window & { dataLayer?: unknown[] }).dataLayer = undefined
    useAuthStore.setState({ account: null, activeWorkspaceId: null })
    resetDataLayerIdentityForTest()
  })

  afterEach(() => {
    unsubscribe()
    useAuthStore.setState({ account: null, activeWorkspaceId: null })
  })

  it('dataLayer 不存在时自动创建', () => {
    pushDataLayer({ event: 'x' })
    expect(dl()).toEqual([{ event: 'x' }])
  })

  it('身份变化才推 mg_identity，同值不重复；登出推 undefined 清掉旧值', () => {
    unsubscribe = installDataLayerIdentitySync()
    useAuthStore.setState({ account: { account_id: 'acc_1' } as never, activeWorkspaceId: 'ws_1' })
    useAuthStore.setState({ isLoading: false })
    useAuthStore.setState({ activeWorkspaceId: 'ws_2' })
    useAuthStore.setState({ account: null, activeWorkspaceId: null })
    expect(dl()).toEqual([
      { event: 'mg_identity', user_id: 'acc_1', workspace_id: 'ws_1' },
      { event: 'mg_identity', user_id: 'acc_1', workspace_id: 'ws_2' },
      { event: 'mg_identity', user_id: undefined, workspace_id: undefined },
    ])
  })
})
