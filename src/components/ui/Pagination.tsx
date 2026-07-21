/**
 * 统一分页器组件
 * 覆盖项目三种分页模式，替代各页面内联实现：
 *   - cursor    游标翻页（上一页/下一页 + 页码），用于后端 CursorPage（如 logs）
 *   - page      页码导航（offset/page-number），用于 total 已知的列表（如 tasks）
 *   - load-more 追加加载（加载更多按钮），用于 useInfiniteQuery（如 billing）
 * 文案走 common.pagination.* i18n，颜色用 Semi/mg token，按钮复用 Button。
 */
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import Select from '@/components/ui/Select'

/** 游标翻页：后端 CursorPage，前端维护 cursor 栈 */
interface CursorPaginationProps {
  mode: 'cursor'
  /** 当前页码（从 1 开始，仅展示） */
  page: number
  /** 是否有下一页 */
  hasMore: boolean
  onPrev: () => void
  onNext: () => void
  /** 翻页请求进行中，禁用按钮 */
  loading?: boolean
  /** 当前筛选命中的总条数，可选展示「共 N 条」；与 pageSize 同传时页码显示 X / Y 总页数 */
  total?: number
  /** 每页条数（传入即在左侧展示「每页 N 条」选择器） */
  pageSize?: number
  /** 每页条数可选项，默认 [10, 15, 20, 50] */
  pageSizeOptions?: number[]
  /** 每页条数变更回调；不传则不展示选择器 */
  onPageSizeChange?: (size: number) => void
}

/** 页码导航：total 已知，可跳转任意页 */
interface PageNumberPaginationProps {
  mode: 'page'
  /** 当前页（从 1 开始） */
  page: number
  /** 总条数 */
  total: number
  /** 每页条数 */
  pageSize: number
  onPageChange: (page: number) => void
  loading?: boolean
}

/** 追加加载：useInfiniteQuery 场景 */
interface LoadMorePaginationProps {
  mode: 'load-more'
  hasMore: boolean
  onLoadMore: () => void
  loading?: boolean
}

export type PaginationProps =
  | CursorPaginationProps
  | PageNumberPaginationProps
  | LoadMorePaginationProps

const WRAP =
  'flex items-center justify-between mg-panel border-t border-mg-border gap-4 flex-wrap select-none'
const PAGE_BADGE =
  'mg-text-code text-mg-text-2 bg-mg-fill-0 border border-mg-border px-[var(--mg-control-px-sm)] py-[var(--mg-space-1)] rounded-sm'

export function Pagination(props: PaginationProps) {
  const { t } = useTranslation()

  if (props.mode === 'load-more') {
    const { hasMore, onLoadMore, loading } = props
    if (!hasMore) return null
    return (
      <div className="flex justify-center mg-panel">
        <Button size="sm" variant="outline" disabled={loading} onClick={onLoadMore} className="font-semibold">
          {t('common.pagination.loadMore')}
        </Button>
      </div>
    )
  }

  if (props.mode === 'page') {
    const { page, total, pageSize, onPageChange, loading } = props
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    return (
      <div className={WRAP}>
        <span className="mg-text-caption text-mg-text-3">{t('common.pagination.total', { count: total })}</span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={loading || page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="font-semibold"
          >
            {t('common.pagination.prev')}
          </Button>
          <span className={PAGE_BADGE}>{`${page} / ${totalPages}`}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={loading || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="font-semibold"
          >
            {t('common.pagination.next')}
          </Button>
        </div>
      </div>
    )
  }

  // mode === 'cursor'
  const { page, hasMore, onPrev, onNext, loading, total, pageSize, pageSizeOptions, onPageSizeChange } = props
  const sizeOptions = pageSizeOptions ?? [10, 15, 20, 50]
  // 总页数（需求方#160）：后端补 total 后可算；未知时退回「第 X 页」
  const totalPages = typeof total === 'number' && pageSize ? Math.max(1, Math.ceil(total / pageSize)) : null
  return (
    <div className={WRAP}>
      <div className="flex items-center gap-2 mg-text-caption text-mg-text-3">
        {typeof total === 'number' && (
          <span>{t('common.pagination.total', { count: total })}</span>
        )}
        {onPageSizeChange && pageSize != null && (
          <span className="flex items-center gap-1.5">
            每页
            <Select
              value={String(pageSize)}
              onChange={(v) => onPageSizeChange(Number(v))}
              className="w-20"
              disabled={loading}
            >
              {sizeOptions.map((size) => (
                <Select.Option key={size} value={String(size)}>{size}</Select.Option>
              ))}
            </Select>
            条
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={loading || page <= 1}
          onClick={onPrev}
          className="font-semibold"
        >
          {t('common.pagination.prev')}
        </Button>
        <span className={PAGE_BADGE}>{totalPages != null ? `${page} / ${totalPages}` : t('common.pagination.page', { page })}</span>
        <Button
          size="sm"
          variant="outline"
          disabled={loading || !hasMore}
          onClick={onNext}
          className="font-semibold"
        >
          {t('common.pagination.next')}
        </Button>
      </div>
    </div>
  )
}
