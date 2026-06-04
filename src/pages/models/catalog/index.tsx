import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LuSearch,
  LuCopy,
  LuCheck,
  LuMessageSquare,
  LuZap,
  LuGitCompareArrows,
} from 'react-icons/lu'
import { useModels } from '@/features/models/hooks/useModels'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { appToast } from '@/lib/app-toast'
import { cn, formatContextLength, formatModelPrice } from '@/lib/utils'
import {
  categories,
  matchesCategory,
  modalityBadges,
  vendorNode,
  type CategoryKey,
} from '../model-experience-data'
import { ModelsCompareModal } from '../components/ModelsCompareModal'

export default function ModelsCatalogPage() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const isZh = i18n.language.startsWith('zh')

  const [category, setCategory] = useState<CategoryKey>('all')
  const [isCompareOpen, setIsCompareOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const {
    search,
    setSearch,
    modelsQuery,
    filteredModels,
  } = useModels()

  const allModels = useMemo(() => modelsQuery.data?.items ?? [], [modelsQuery.data?.items])

  const visibleModels = useMemo(
    () => filteredModels.filter((model) => matchesCategory(model, category)),
    [category, filteredModels],
  )

  const handleCopyApiId = async (modelId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    try {
      await navigator.clipboard.writeText(modelId)
      setCopiedId(modelId)
      appToast.success(isZh ? '模型 API ID 已复制' : 'Model API ID copied')
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      appToast.error(isZh ? '复制失败' : 'Failed to copy')
    }
  }

  const handleGoPlayground = (modelId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    navigate('/models/playground', { state: { selectedModelId: modelId } })
  }

  return (
    <div className="space-y-6">
      {/* 头部看板 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-mg-text-0">
            {isZh ? '所有模型' : 'All Models'}
          </h1>
          <p className="text-sm text-mg-text-1 mt-1.5">
            {isZh
              ? '浏览受支持的全部大语言模型及多模态模型，获取 API ID 对接您的客户端'
              : 'Browse all supported LLMs and multimodal models, and copy API IDs to configure your clients.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="rounded-full h-9 px-4 text-xs font-bold shrink-0"
            onClick={() => setIsCompareOpen(true)}
          >
            <LuGitCompareArrows size={14} className="mr-1.5" />
            {isZh ? '对比模型' : 'Compare Models'}
          </Button>
        </div>
      </div>

      {/* 搜索与分类栏 */}
      <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between bg-mg-bg-0 p-4 border border-mg-border/60 rounded-2xl">
        {/* 检索 */}
        <Input
          prefix={<LuSearch size={15} className="text-mg-text-2" />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={isZh ? '搜索模型、厂商、ID...' : 'Search models, providers, IDs...'}
          className="w-full md:w-80 rounded-full bg-mg-bg-1/40 hover:bg-mg-bg-1/80 focus:bg-card-bg"
        />

        {/* 分类 Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={cn(
                'px-3.5 py-1.5 text-xs font-bold rounded-full transition-all duration-200 cursor-pointer whitespace-nowrap',
                category === item
                  ? 'bg-brand-base text-white shadow-sm shadow-brand-glow/10'
                  : 'bg-mg-fill-0/50 text-mg-text-1 hover:text-mg-text-0 hover:bg-mg-fill-0',
              )}
            >
              {isZh
                ? {
                    all: '全部',
                    text: '文本',
                    image: '图像',
                    video: '视频',
                    code: '代码',
                    reasoning: '推理',
                    multimodal: '多模态',
                  }[item]
                : item.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* 卡片网格列表 */}
      {modelsQuery.isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-mg-text-2 text-sm gap-2">
          <div className="w-6 h-6 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
          <span>{isZh ? '正在加载模型...' : 'Loading models...'}</span>
        </div>
      ) : modelsQuery.isError ? (
        <div className="py-20 text-center text-mg-text-2 text-sm">
          {isZh ? '模型列表加载失败，请稍后重试' : 'Failed to load models. Please try again later.'}
        </div>
      ) : visibleModels.length === 0 ? (
        <div className="py-20 text-center text-mg-text-2 text-sm">
          {isZh ? '暂无匹配的模型' : 'No matching models found.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleModels.map((model) => (
            <div
              key={model.id}
              className="group bg-mg-bg-0 border border-mg-border/50 rounded-2xl p-5 flex flex-col gap-4 shadow-sm hover:shadow-md hover:border-brand-base/40 transition-all duration-300 relative overflow-hidden"
            >
              {/* 卡片头部：厂商图标 & 名字 */}
              <div className="flex items-center gap-3">
                <div className="shrink-0">{vendorNode(model)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-bold text-mg-text-2 leading-none">
                      {model.vendor || 'ModelGo'}
                    </span>
                  </div>
                  <h3 className="text-[15px] font-bold text-mg-text-0 mt-1 truncate leading-tight">
                    {model.display_name}
                  </h3>
                </div>
              </div>

              {/* API ID 展示与快捷复制区 */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-mg-text-2 uppercase tracking-wide">
                  API ID
                </span>
                <div
                  onClick={(e) => handleCopyApiId(model.model_id, e)}
                  className={cn(
                    'group/id flex items-center justify-between gap-2 px-3 py-2 bg-mg-bg-1/60 hover:bg-brand-base/3 border border-mg-border/40 hover:border-brand-base/30 rounded-xl cursor-pointer transition-all duration-200',
                    copiedId === model.model_id && 'bg-emerald-500/5 border-emerald-500/30'
                  )}
                  title={isZh ? '点击复制 API ID' : 'Click to copy API ID'}
                >
                  <code className="font-mono text-xs font-bold text-mg-text-0 truncate select-all leading-none">
                    {model.model_id}
                  </code>
                  <span className="shrink-0 transition-colors">
                    {copiedId === model.model_id ? (
                      <LuCheck size={12} className="text-emerald-500" />
                    ) : (
                      <LuCopy size={12} className="text-mg-text-2 group-hover/id:text-brand-base" />
                    )}
                  </span>
                </div>
              </div>

              {/* 能力模态标签 */}
              <div className="flex flex-wrap gap-1.5">
                {modalityBadges(model)}
              </div>

              {/* 参数指标行 */}
              <div className="grid grid-cols-2 gap-3 py-2.5 border-y border-mg-border/30 text-xs">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-semibold text-mg-text-2">
                    {isZh ? '上下文长度' : 'Context Length'}
                  </span>
                  <span className="font-bold text-mg-text-0 flex items-center gap-1">
                    <LuZap size={12} className="text-amber-500" />
                    {formatContextLength(model.context_length)}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-semibold text-mg-text-2">
                    {isZh ? '支持提供商' : 'Providers'}
                  </span>
                  <span className="font-bold text-mg-text-0">
                    {model.providers_count || 1} 个
                  </span>
                </div>
              </div>

              {/* 计费单价与快速操作 */}
              <div className="flex items-center justify-between pt-1 mt-auto">
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold text-mg-text-2">
                    {isZh ? '预估输入单价' : 'Input Price'}
                  </span>
                  <span className="font-mono text-[12.5px] font-bold text-mg-text-0 mt-0.5 tabular-nums">
                    {formatModelPrice(model.pricing?.input_per_1m, model.pricing?.currency)}
                  </span>
                </div>
                <Button
                  variant="brand"
                  size="sm"
                  onClick={(e) => handleGoPlayground(model.model_id, e)}
                  className="rounded-full h-8 px-4 text-xs font-semibold shadow-sm hover:shadow-brand-glow/10 active:scale-95 transition-transform"
                >
                  <LuMessageSquare size={13} className="mr-1.5" />
                  {isZh ? '去体验' : 'Try'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 模型对比 Modal */}
      <ModelsCompareModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        allModels={allModels}
        onConfirmCompare={(ids) => {
          if (ids.length > 0) {
            navigate('/models/compare', { state: { selectedIds: ids } })
          }
        }}
      />
    </div>
  )
}
