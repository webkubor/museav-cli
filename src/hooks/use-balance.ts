import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getBalance, getBalanceBreakdown } from '@/services/billing'

export const balanceKey = (tenantId: string | null | undefined) =>
  ['balance', tenantId] as const

export const balanceBreakdownKey = (tenantId: string | null | undefined) =>
  ['balance', 'breakdown', tenantId] as const

export function useBalance(
  tenantId: string | null | undefined,
  opts?: { pollWhileHealthyMs?: number },
) {
  const pollMs = opts?.pollWhileHealthyMs
  return useQuery({
    queryKey: balanceKey(tenantId),
    queryFn: () => getBalance(tenantId!),
    enabled: !!tenantId,
    staleTime: 30_000,
    // 低余额预警用：仅余额健康时按 pollMs 轮询，低于阈值后停轮（变回正常靠充值 invalidate 刷新）。
    // 后台/最小化标签页默认不轮（refetchIntervalInBackground 默认 false），开销随真正在看的人走。
    refetchInterval: pollMs
      ? (query) => {
          const d = query.state.data
          if (!d) return pollMs
          const avail = Number.parseFloat(d.available?.amount ?? '')
          const thr = Number.parseFloat(d.low_balance_threshold?.amount ?? '')
          const low = Number.isFinite(avail) && Number.isFinite(thr) && avail <= thr
          return low ? false : pollMs
        }
      : undefined,
  })
}

export function useBalanceBreakdown(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: balanceBreakdownKey(tenantId),
    queryFn: () => getBalanceBreakdown(tenantId!),
    enabled: !!tenantId,
    staleTime: 30_000,
  })
}

export function useInvalidateBalance() {
  const qc = useQueryClient()
  return (tenantId: string) => {
    void qc.invalidateQueries({ queryKey: balanceKey(tenantId) })
    void qc.invalidateQueries({ queryKey: balanceBreakdownKey(tenantId) })
  }
}
