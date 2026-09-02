import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// 只关心空态走哪一支，i18n 直接回落成 key，断言 key 比断言中文更稳（文案还会再改）
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// derive → constants.tsx 引 @lobehub 图标，其 fluent-emoji 的 ESM 目录导入在 vitest/node 下
// 无法解析（存量环境问题，derive.expired.test.ts / ModelsCompareModal.test.tsx 同样命中）。
// 本用例只看空态分支，表格行一个都不渲染，把 derive 整个 mock 掉即可。
vi.mock('./derive', () => ({
  keyTypeLabel: () => '',
  responsibleOf: () => '',
  periodSpendOf: () => null,
  lastCalledOf: () => null,
  isExpiringSoon: () => false,
  isExpiredKey: () => false,
  cap: () => null,
  formatLimit: () => '',
  statusLabel: () => '',
}))

const { ApiKeyTable } = await import('./ApiKeyTable')

function renderTable(overrides: Partial<React.ComponentProps<typeof ApiKeyTable>> = {}) {
  return render(
    <table>
      <ApiKeyTable
        isLoading={false}
        items={[]}
        canAction={() => true}
        canReveal
        onOpenDetail={vi.fn()}
        onToggleStatus={vi.fn()}
        onCopyKey={vi.fn()}
        copyingKeyId={null}
        enablePendingId={null}
        hasKeys={false}
        isFiltered={false}
        canCreate
        selfScopeOnly={false}
        onCreate={vi.fn()}
        onClearFilters={vi.fn()}
        {...overrides}
      />
    </table>
  )
}

/**
 * 需求方#909 的回归锁。
 *
 * 上一轮把新文案写进了 emptyWorkspace，但那一支在真实数据下走不到：
 * selfScopeOnly = !allKeys.some(是他人的)，空间零 Key 时 allKeys 是空数组，
 * [].some() 恒为 false ⇒ selfScopeOnly 恒 true ⇒ 一律被自领那支截胡。
 * QA 得用响应拦截强塞一条他人 Key 才逼出该分支，界面上需求方看不到任何变化。
 *
 * 所以这里锁的是**分支选择**，不是文案本身 —— 文案还会再改，分支错了才是 bug。
 */
describe('ApiKeyTable 空态分支（需求方#909）', () => {
  it('空间一个 Key 都没有 → 走 emptyWorkspace，即使 selfScopeOnly 为真', () => {
    // 这正是 #909 的场景：零 Key 时 selfScopeOnly 必然是 true（[].some() 恒 false）
    renderTable({ hasKeys: false, selfScopeOnly: true })

    expect(screen.getByText('apiKeys.emptyWorkspace.title')).toBeInTheDocument()
    expect(screen.queryByText('apiKeys.emptySelfScope.title')).not.toBeInTheDocument()
  })

  it('空间有 Key 但都不归我管 → 才走 emptySelfScope', () => {
    renderTable({ hasKeys: true, selfScopeOnly: true })

    expect(screen.getByText('apiKeys.emptySelfScope.title')).toBeInTheDocument()
    expect(screen.queryByText('apiKeys.emptyWorkspace.title')).not.toBeInTheDocument()
  })

  it('筛选无结果优先于两种空态', () => {
    renderTable({ hasKeys: true, isFiltered: true, selfScopeOnly: true })

    expect(screen.getByText('apiKeys.emptyFiltered.title')).toBeInTheDocument()
    expect(screen.queryByText('apiKeys.emptySelfScope.title')).not.toBeInTheDocument()
    expect(screen.queryByText('apiKeys.emptyWorkspace.title')).not.toBeInTheDocument()
  })

  it('零 Key 且筛选态 → 仍是 emptyWorkspace（isFiltered 要配合 hasKeys 才成立）', () => {
    renderTable({ hasKeys: false, isFiltered: true, selfScopeOnly: true })

    expect(screen.getByText('apiKeys.emptyWorkspace.title')).toBeInTheDocument()
  })
})
