import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getBalance, getBalanceBreakdown } from '@/services/billing'

export const balanceKey = (tenantId: string | null | undefined) =>
  ['balance', tenantId] as const

export const balanceBreakdownKey = (tenantId: string | null | undefined) =>
  ['balance', 'breakdown', tenantId] as const

export function useBalance(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: balanceKey(tenantId),
    queryFn: () => getBalance(tenantId!),
    enabled: !!tenantId,
    staleTime: 30_000,
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
