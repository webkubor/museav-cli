/**
 * 模块 7：完整指标榜单（§3.6）。
 *
 * 表格体系用现有 Table + Pagination，不手搓（组件铁律）。
 * 筛选与页码由父组件通过 URL 驱动 —— 本组件是纯受控展示。
 *
 * 行为：
 * - 已接入行整行可点 + 行内「查看详情」显式入口，两者行为一致（§2.3）
 * - 未接入行禁用、状态标签保持可读，**不给 clickable 语义**
 * - 筛选结果为空时保留筛选条件 + 给「清空筛选」动作，不是死路
 */
import { LuArrowRight } from 'react-icons/lu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { DiscoveryConfig, DiscoveryModel } from './discovery-mock'

const PAGE_SIZE = 5

export function DiscoveryLeaderboard({
  config,
  models,
  page,
  onPageChange,
  onOpenModel,
  onClearFilters,
  hasActiveFilters,
}: {
  config: DiscoveryConfig
  models: DiscoveryModel[]
  page: number
  onPageChange: (page: number) => void
  onOpenModel: (model: DiscoveryModel) => void
  onClearFilters: () => void
  hasActiveFilters: boolean
}) {
  const start = (page - 1) * PAGE_SIZE
  const rows = models.slice(start, start + PAGE_SIZE)

  return (
    <section className="mg-tile p-0">
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-[14px] font-semibold text-mg-text-0">完整指标榜单</h2>
        <span className="text-[12px] text-mg-text-3">共 {models.length} 个模型</span>
      </header>

      {models.length === 0 ? (
        <div className="px-4 pb-4">
          <EmptyState
            title="没有符合条件的模型"
            description={hasActiveFilters ? '当前筛选组合下没有数据，可清空筛选重新查看' : '该任务下暂无模型数据'}
            action={
              hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={onClearFilters}>
                  清空筛选
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>模型</TableHead>
                  <TableHead>厂商</TableHead>
                  <TableHead className="text-right">{config.scoreLabel}</TableHead>
                  <TableHead className="text-right">性能</TableHead>
                  <TableHead className="text-right">价格</TableHead>
                  <TableHead className="text-right">近 7 日用量</TableHead>
                  <TableHead className="w-24 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((model, index) => {
                  const clickable = Boolean(model.id)
                  return (
                    <TableRow
                      key={`${model.name}-${index}`}
                      className={cn(clickable && 'cursor-pointer')}
                      {...(clickable
                        ? {
                            onClick: () => onOpenModel(model),
                            tabIndex: 0,
                            onKeyDown: (event: React.KeyboardEvent) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                onOpenModel(model)
                              }
                            },
                          }
                        : {})}
                    >
                      <TableCell className="text-mg-text-3">{start + index + 1}</TableCell>
                      <TableCell className="font-medium text-mg-text-0">{model.name}</TableCell>
                      <TableCell className="text-mg-text-2">{model.provider}</TableCell>
                      <TableCell className="text-right font-semibold">{model.score}</TableCell>
                      <TableCell className="text-right text-mg-text-2">{model.performance}</TableCell>
                      <TableCell className="text-right text-mg-text-2">{model.price}</TableCell>
                      <TableCell className="text-right text-mg-text-2">{model.usage}</TableCell>
                      <TableCell className="text-right">
                        {clickable ? (
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-base">
                            查看详情
                            <LuArrowRight size={12} aria-hidden />
                          </span>
                        ) : (
                          <span className="text-[11px] text-mg-text-3">暂未接入</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination
            mode="page"
            page={page}
            total={models.length}
            pageSize={PAGE_SIZE}
            onPageChange={onPageChange}
          />
        </>
      )}
    </section>
  )
}
