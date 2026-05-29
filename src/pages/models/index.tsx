import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/Input'
import { SideSheet } from '@/components/ui/SideSheet'
import { LuSearch } from 'react-icons/lu'
import { useModels } from '@/features/models/hooks/useModels'
import { ModelCard } from '@/features/models/components/ModelCard'
import { ModelDetailPanel } from '@/features/models/components/ModelDetailPanel'
import { cn } from '@/lib/utils'

const Spinner = () => (
  <svg className="animate-spin text-current h-6 w-6 text-[var(--brand-base)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
)

export default function ModelsPage() {
  const { t } = useTranslation()
  const {
    search,
    setSearch,
    activeTag,
    setActiveTag,
    selectedId,
    setSelectedId,
    modelsQuery,
    detailQuery,
    providersQuery,
    filteredModels,
    tags,
  } = useModels()

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-[var(--mg-text-0)] m-0 mb-1.5 tracking-tight">
          {t('modelsCatalog.title')}
        </h1>
        <p className="text-[13px] text-[var(--mg-text-1)] m-0">
          {t('modelsCatalog.desc')}
        </p>
      </div>

      {/* 搜索栏 */}
      <div className="relative w-[320px] mb-5">
        <LuSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--mg-text-2)] w-4 h-4" />
        <Input
          placeholder={t('modelsCatalog.placeholder.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-4 rounded-full"
        />
      </div>

      {/* 标签筛选 */}
      {tags.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-7">
          <button
            onClick={() => setActiveTag(null)}
            className={cn(
              "px-3.5 py-1 rounded-full text-[12.5px] cursor-pointer transition-all duration-150 border",
              !activeTag
                ? "border-[var(--mg-text-0)] bg-[var(--mg-text-0)] text-card-bg font-semibold"
                : "border-[var(--mg-border)] hover:border-[var(--mg-text-2)] bg-transparent text-[var(--mg-text-1)]"
            )}
          >
            {t('modelsCatalog.filter.all')}
          </button>
          {tags.filter((t) => t.enabled).sort((a, b) => a.sort_order - b.sort_order).map((tag) => {
            const isActive = activeTag === tag.code
            return (
              <button
                key={tag.code}
                onClick={() => setActiveTag(isActive ? null : tag.code)}
                className={cn(
                  "px-3.5 py-1 rounded-full text-[12.5px] cursor-pointer transition-all duration-150 border",
                  isActive
                    ? "border-[var(--mg-text-0)] bg-[var(--mg-text-0)] text-card-bg font-semibold"
                    : "border-[var(--mg-border)] hover:border-[var(--mg-text-2)] bg-transparent text-[var(--mg-text-1)]"
                )}
              >
                {tag.name_zh || tag.name_en}
              </button>
            )
          })}
        </div>
      )}

      {/* 模型网格 */}
      {modelsQuery.isLoading ? (
        <div className="flex justify-center items-center h-[200px]">
          <Spinner />
        </div>
      ) : modelsQuery.isError ? (
        <div className="text-[var(--mg-danger)] text-[13px] py-6">{t('modelsCatalog.error.load')}</div>
      ) : filteredModels.length === 0 ? (
        <div className="text-center py-12">
          <span className="text-[var(--mg-text-2)] text-[13px]">{t('modelsCatalog.empty')}</span>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {filteredModels.map((model) => (
            <ModelCard key={model.model_id} model={model} onSelect={setSelectedId} />
          ))}
        </div>
      )}

      {/* 模型详情右侧抽屉 */}
      <SideSheet
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        width={560}
        title={
          detailQuery.data ? (
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-[var(--mg-text-0)]">{t('modelsCatalog.detail.title')}</span>
              <span className="text-[11px] text-[var(--mg-text-2)] bg-[var(--mg-fill-0)] px-2 py-0.5 rounded-full font-medium">
                {detailQuery.data.model_id}
              </span>
            </div>
          ) : t('modelsCatalog.detail.title')
        }
        className="p-6 flex flex-col overflow-y-auto"
      >
        <div className="flex-1 mt-4">
          {detailQuery.isLoading || providersQuery.isLoading ? (
            <div className="flex justify-center items-center h-[200px]">
              <Spinner />
            </div>
          ) : detailQuery.isError ? (
            <div className="text-[var(--mg-danger)] text-[13px] py-6 text-center">
              {t('modelsCatalog.error.loadDetail')}
            </div>
          ) : detailQuery.data ? (
            <ModelDetailPanel detail={detailQuery.data} providers={providersQuery.data?.items ?? []} />
          ) : null}
        </div>
      </SideSheet>
    </div>
  )
}
