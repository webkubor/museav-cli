/**
 * 异步任务 Summary 指标条（需求方#668）。
 *
 * 守两类容易出错的判定：
 * ① **undefined 不能当 0**。把「读不到」渲染成「本来就是 0」是本仓反复出现的病症
 *    （需求方#650 的调整记录/充值也是这个），所以每项指标都要有缺失→「—」的用例。
 * ② **币种不取响应的 currency**。后端 total_spend 是跨币种裸求和、currency 取的是
 *    少数派币种（QA 2026-08-19 实测 15/2380 条 USD 就把整体标成 USD）。前端必须用
 *    租户结算币种，否则会把 99.94% 是人民币的一笔钱渲染成美元。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { AsyncTasksSummary } from '@/types'

const getAsyncTasksSummary = vi.fn<() => Promise<AsyncTasksSummary>>()
vi.mock('@/services/tasks', () => ({
  getAsyncTasksSummary: () => getAsyncTasksSummary(),
  listTasks: vi.fn(),
  getTask: vi.fn(),
}))

// 租户结算币种固定成 ¥，用来验证「不跟随响应的 currency」
vi.mock('@/hooks/use-platform-config', () => ({
  useCurrency: () => ({ symbol: '¥' }),
}))

// `logs` 是懒加载命名空间（src/i18n.ts 只内置 5 个 core ns），测试环境里不会载入，
// 真 i18n 只会把 key 原样吐出来。所以这里 mock 掉 useTranslation 让 t 回
// `key:值1/值2`，辅助行的数值才可断言；用 importOriginal 保留 initReactI18next，
// 否则 src/i18n.ts 的 .use(initReactI18next) 会在导入期就炸。
// key 是否真配了，由下面 zh/en JSON 的对照用例保证（比渲染断言更严：能抓到只配了一种语言）。
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join('/')}` : key,
  }),
}))

import { useAuthStore } from '@/store/auth'
import { AsyncTasksSummaryBar } from '@/pages/logs/summary'
import zhLogs from '@/locales/zh/logs.json'
import enLogs from '@/locales/en/logs.json'

function renderBar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AsyncTasksSummaryBar params={{ preset: '7d' }} />
    </QueryClientProvider>,
  )
}

/** 从 tile 的数值行里取文本；tile 的值用 font-mono 渲染 */
function values() {
  return [...document.querySelectorAll('.font-mono')].map((n) => n.textContent ?? '')
}

function subs() {
  return [...document.querySelectorAll('.mg-text-caption')].map((n) => n.textContent ?? '')
}

const FULL: AsyncTasksSummary = {
  total_tasks: 2380,
  succeeded_tasks: 2000,
  queued_tasks: 30,
  running_tasks: 12,
  failed_tasks: 300,
  expired_tasks: 38,
  failed_or_expired_tasks: 338,
  total_spend: '5175.580982',
  currency: 'USD', // ← 少数派币种，前端不该采信
  pending_billing_tasks: 7,
  available_products: 124,
  expired_products: 56,
}

beforeEach(() => {
  useAuthStore.setState({ activeTenantId: 't-1' })
  getAsyncTasksSummary.mockReset()
})

describe('AsyncTasksSummaryBar', () => {
  it('渲染 PRD 规定的六项指标', async () => {
    getAsyncTasksSummary.mockResolvedValue(FULL)
    renderBar()

    await waitFor(() => expect(values()).toHaveLength(6))
  })

  it('用到的 asyncSummary.* key 在中英两份文案里都配齐了', async () => {
    getAsyncTasksSummary.mockResolvedValue(FULL)
    renderBar()
    await waitFor(() => expect(values()).toHaveLength(6))

    // 从渲染结果里反解出组件实际用到的 key（mock 的 t 会把 key 原样吐出来）
    const rendered = [
      ...document.querySelectorAll('.mg-text-label, .mg-text-caption'),
    ].map((n) => (n.textContent ?? '').split(':')[0])
    const used = [...new Set(rendered.filter((k) => k.startsWith('logs.asyncSummary.')))]
    expect(used.length).toBeGreaterThanOrEqual(6)

    // JSON 本身有类型，取到 asyncSummary 这一层再当字典用，不对整棵树做断言
    for (const [lang, dict] of [
      ['zh', zhLogs.logs.asyncSummary],
      ['en', enLogs.logs.asyncSummary],
    ] as const) {
      const table: Record<string, string> = dict
      for (const key of used) {
        const leaf = key.replace('logs.asyncSummary.', '')
        expect(table[leaf], `${lang} 缺 ${key}`).toBeTruthy()
      }
    }
  })

  it('总任务数 / 完成率 / 处理中 / 失败过期 / 可用产物 取值正确', async () => {
    getAsyncTasksSummary.mockResolvedValue(FULL)
    renderBar()

    await waitFor(() => expect(values()[0]).toBe('2,380'))
    const v = values()
    expect(v[1]).toBe('84.0%')          // 2000/2380，保留 1 位小数（PRD）
    expect(v[2]).toBe('42')             // 处理中 = 排队 30 + 执行 12
    expect(v[3]).toBe('338')            // 用后端的合计值，不前端重算
    expect(v[5]).toBe('124')            // 可用产物
  })

  it('总费用用租户币种 ¥，不跟随响应里的 USD', async () => {
    getAsyncTasksSummary.mockResolvedValue(FULL)
    renderBar()

    await waitFor(() => expect(values()[4]).toContain('¥'))
    expect(values()[4]).not.toContain('$')
  })

  it('辅助信息带上待结算与已过期产物数', async () => {
    getAsyncTasksSummary.mockResolvedValue(FULL)
    renderBar()

    await waitFor(() => expect(subs().length).toBeGreaterThan(0))
    const s = subs().join(' | ')
    expect(s).toContain('7')    // 待结算任务数
    expect(s).toContain('56')   // 已过期产物数
  })

  // ── 缺失判定：读不到 ≠ 0 ──

  it('字段缺失显「—」，不显 0', async () => {
    getAsyncTasksSummary.mockResolvedValue({})
    renderBar()

    await waitFor(() => expect(values()).toHaveLength(6))
    // 六项里除了「处理中」（需两个字段）其余都直接是 —；总之一个 0 都不该出现
    expect(values().every((v) => v === '—')).toBe(true)
  })

  it('处理中：排队或执行任一缺失就显「—」，不当 0 相加', async () => {
    getAsyncTasksSummary.mockResolvedValue({ ...FULL, running_tasks: undefined })
    renderBar()

    // 若把 undefined 当 0，这里会渲染成 "30" —— 那是把「读不到」说成「只有 30 个」
    await waitFor(() => expect(values()[0]).toBe('2,380'))
    expect(values()[2]).toBe('—')
  })

  it('总任务数为 0 时完成率显「—」而不是 0.0% 或 NaN', async () => {
    getAsyncTasksSummary.mockResolvedValue({ total_tasks: 0, succeeded_tasks: 0 })
    renderBar()

    await waitFor(() => expect(values()[0]).toBe('0'))
    expect(values()[1]).toBe('—')
  })

  it('真实的 0 要显 0，不能被当成缺失', async () => {
    getAsyncTasksSummary.mockResolvedValue({ ...FULL, available_products: 0 })
    renderBar()

    await waitFor(() => expect(values()[5]).toBe('0'))
  })

  // ── 费用口径：qa#669 后端改为按币种分组 ──

  it('混币窗口按币种并列显示，不相加、不吐 ¥0', async () => {
    // qa#669 修复后的真实形状：混币时 total_spend/currency 都是空字符串
    getAsyncTasksSummary.mockResolvedValue({
      ...FULL,
      total_spend: '',
      currency: '',
      spend_by_currency: [
        { currency: 'CNY', amount: '5203.30' },
        { currency: 'USD', amount: '3.04' },
      ],
    })
    renderBar()

    await waitFor(() => expect(values()[4]).toContain('5,203.3'))
    const spend = values()[4]
    expect(spend).toContain('¥')
    expect(spend).toContain('$')
    expect(spend).toContain('3.04')
    // 回归闸门：空字符串曾走 formatMoney(Number('')=0) 渲染成 ¥0，把 5203 元说成 0
    expect(spend).not.toBe('¥0')
  })

  it('单币种窗口用后端给的币种，不再是跨币种裸求和', async () => {
    getAsyncTasksSummary.mockResolvedValue({
      ...FULL,
      total_spend: '43.89',
      currency: 'CNY',
      spend_by_currency: [{ currency: 'CNY', amount: '43.89' }],
    })
    renderBar()

    await waitFor(() => expect(values()[4]).toBe('¥43.89'))
  })

  it('total_spend 是空字符串且没有分组数据时显「—」，不显 ¥0', async () => {
    getAsyncTasksSummary.mockResolvedValue({ ...FULL, total_spend: '', currency: '' })
    renderBar()

    await waitFor(() => expect(values()[0]).toBe('2,380'))
    expect(values()[4]).toBe('—')
  })

  it('接口失败时静默显「—」，不抛错打断列表', async () => {
    getAsyncTasksSummary.mockRejectedValue(new Error('boom'))
    renderBar()

    await waitFor(() => expect(values()).toHaveLength(6))
    expect(values().every((v) => v === '—')).toBe(true)
  })
})
