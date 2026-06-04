import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LuSearch,
  LuCopy,
  LuCheck,
  LuZap,
  LuGitCompareArrows,
  LuChevronRight,
  LuCalendar,
  LuClock,
  LuCpu,
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

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    card.style.setProperty('--mouse-x', `${x}px`)
    card.style.setProperty('--mouse-y', `${y}px`)

    const width = rect.width
    const height = rect.height
    // 阻尼 3D 旋转计算
    const rotateX = ((y - height / 2) / height) * -3.5 // 限制在 -3.5deg 到 3.5deg
    const rotateY = ((x - width / 2) / width) * 3.5
    card.style.setProperty('--rotate-x', `${rotateX}deg`)
    card.style.setProperty('--rotate-y', `${rotateY}deg`)
  }

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget
    card.style.setProperty('--rotate-x', '0deg')
    card.style.setProperty('--rotate-y', '0deg')
  }


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
      appToast.success(isZh ? 'API ID 已复制' : 'Model API ID copied')
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
    <div className="space-y-8 py-2">
      {/* 极简大气头部看板 */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight text-mg-text-0 md:text-4xl">
            {isZh ? '所有模型' : 'All Models'}
          </h1>
          <p className="text-[14px] text-mg-text-2 font-medium max-w-2xl leading-relaxed">
            {isZh
              ? '聚合支持的全部大语言及多模态模型。一键复制 API ID 后，即可无缝对接至您的本地智能代理或服务端中。'
              : 'Browse all supported models, copy API IDs, and configure your local clients or servers seamlessly.'}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="outline"
            className="rounded-full h-10 px-5 text-xs font-bold shadow-sm hover:shadow-md transition-all duration-300"
            onClick={() => setIsCompareOpen(true)}
          >
            <LuGitCompareArrows size={14} className="mr-2 text-brand-base" />
            {isZh ? '对比模型' : 'Compare Models'}
          </Button>
        </div>
      </div>

      {/* 极雅毛玻璃质感 搜索与过滤栏 */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-5 justify-between bg-mg-bg-0/60 backdrop-blur-md p-4 border border-mg-border/40 rounded-2xl shadow-sm">
        {/* 极简无框搜索 */}
        <Input
          variant="search"
          prefix={<LuSearch size={16} className="text-mg-text-2/80" />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={isZh ? '检索模型名称、API ID 或厂商...' : 'Search model name, API ID, provider...'}
          className="w-full lg:w-96 h-11 text-[13.5px]"
        />

        {/* 高感胶囊分类 Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0 scrollbar-none fade-edge-x">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={cn(
                'px-4 py-2 text-xs font-bold rounded-full transition-all duration-300 cursor-pointer whitespace-nowrap tracking-wide',
                category === item
                  ? 'bg-brand-base text-white shadow-md shadow-brand-glow/20'
                  : 'bg-mg-fill-0/40 text-mg-text-1 hover:text-mg-text-0 hover:bg-mg-fill-0/90 active:scale-95',
              )}
            >
              {isZh
                ? {
                    all: '全部模型',
                    text: '文本对话',
                    image: '图像生成',
                    video: '视频理解',
                    code: '代码编写',
                    reasoning: '深度推理',
                    multimodal: '多模态',
                  }[item]
                : item.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* 呼吸感卡片网格列表 */}
      {modelsQuery.isLoading ? (
        <div className="py-28 flex flex-col items-center justify-center text-mg-text-2 text-sm gap-3">
          <div className="w-7 h-7 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
          <span className="font-semibold tracking-wider">{isZh ? '正在拉取可用模型...' : 'Loading models...'}</span>
        </div>
      ) : modelsQuery.isError ? (
        <div className="py-28 text-center text-mg-text-2 text-sm font-semibold tracking-wide">
          {isZh ? '模型列表加载失败，请稍后重试' : 'Failed to load models. Please try again later.'}
        </div>
      ) : visibleModels.length === 0 ? (
        <div className="py-28 text-center text-mg-text-2 text-sm font-semibold tracking-wide">
          {isZh ? '暂无匹配的模型数据' : 'No matching models found.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {visibleModels.map((model) => (
            <div
              key={model.id}
              onClick={(e) => handleGoPlayground(model.model_id, e)}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              style={{
                transform: 'perspective(1000px) rotateX(var(--rotate-x, 0deg)) rotateY(var(--rotate-y, 0deg)) scale3d(var(--scale, 1), var(--scale, 1), var(--scale, 1))',
                transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              className="group relative p-[1px] rounded-2xl bg-[rgba(15,23,42,0.09)] dark:bg-[rgba(255,255,255,0.14)] transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) hover:shadow-[0_20px_40px_-10px_var(--brand-glow)] shadow-[0_8px_30px_rgb(0,0,0,0.02)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] [--scale:1] hover:[--scale:1.015] flex cursor-pointer"
            >
              {/* 渐变边框 Spotlight 层（光斑跟随，Hover 时显现） */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{
                  background: 'radial-gradient(220px circle at var(--mouse-x, 0px) var(--mouse-y, 0px), color-mix(in srgb, var(--brand-base) 15%, transparent) 0%, color-mix(in srgb, var(--brand-mid) 8%, transparent) 50%, transparent 100%)',
                }}
              />

              {/* 磨砂玻璃内容包裹容器 */}
              <div className="relative w-full rounded-[15px] bg-white/90 dark:bg-mg-bg-0/80 backdrop-blur-2xl -webkit-backdrop-blur-2xl p-7 flex flex-col gap-6 overflow-hidden flex-1">
                {/* 内层内容 Spotlight 背景光晕（光斑跟随，Hover 时显现） */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{
                    background: 'radial-gradient(350px circle at var(--mouse-x, 0px) var(--mouse-y, 0px), color-mix(in srgb, var(--brand-base) 3.5%, transparent) 0%, color-mix(in srgb, var(--brand-mid) 1.5%, transparent) 60%, transparent 100%)',
                  }}
                />

                {/* 磨砂玻璃流光扫掠光效 */}
                <div className="absolute inset-0 w-[200%] h-full bg-gradient-to-r from-transparent via-white/20 dark:via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1400ms] cubic-bezier(0.16, 1, 0.3, 1) pointer-events-none" />

                {/* 卡片头部：精致的厂商图标 & 名字 */}
                <div className="flex items-start gap-4 relative z-10">
                  <div className="shrink-0 p-1.5 bg-mg-fill-0/40 rounded-xl border border-mg-border/10">
                    {vendorNode(model)}
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="text-[10px] font-bold text-mg-text-2/70 uppercase tracking-widest">
                      {model.vendor || 'ModelGo'}
                    </div>
                    <h3 className="text-17px font-extrabold text-mg-text-0 mt-1 truncate tracking-tight">
                      {model.display_name}
                    </h3>
                  </div>
                </div>

                {/* 隐藏式 API ID 复制栏：默认素雅，悬浮时露出动作 */}
                <div className="space-y-1.5 relative z-10">
                  <div
                    onClick={(e) => handleCopyApiId(model.model_id, e)}
                    className={cn(
                      'group/id flex items-center justify-between gap-3 px-3.5 py-2.5 bg-mg-fill-0/30 hover:bg-brand-base/5 border border-mg-border/10 hover:border-brand-base/20 rounded-xl cursor-pointer transition-all duration-300',
                      copiedId === model.model_id && 'bg-emerald-500/5 border-emerald-500/20'
                    )}
                    title={isZh ? '点击复制 API ID' : 'Click to copy API ID'}
                  >
                    <code className="font-mono text-xs font-semibold text-mg-text-1 group-hover/id:text-mg-text-0 truncate select-all leading-none">
                      {model.model_id}
                    </code>
                    <div className="shrink-0 flex items-center justify-center w-5 h-5 rounded-md transition-all duration-300 opacity-0 group-hover:opacity-100 group-hover/id:bg-brand-base/5">
                      {copiedId === model.model_id ? (
                        <LuCheck size={12} className="text-emerald-500" />
                      ) : (
                        <LuCopy size={11} className="text-mg-text-2 group-hover/id:text-brand-base" />
                      )}
                    </div>
                  </div>
                </div>

                {/* 能力模态标签：仅在有模态标签时展示 */}
                {model.modalities && model.modalities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 relative z-10">
                    {modalityBadges(model)}
                  </div>
                )}

                {/* 参数指标行：舍弃生硬的实线，通过高空隙排版划分层级 */}
                <div className="grid grid-cols-2 gap-4 py-1 text-xs relative z-10">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-mg-text-2/70 uppercase tracking-wider block">
                      {isZh ? '上下文窗口' : 'Context Length'}
                    </span>
                    <span className="font-extrabold text-mg-text-0 flex items-center gap-1 text-[13px]">
                      <LuZap size={13} className="text-amber-500 shrink-0" />
                      {formatContextLength(model.context_length)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-mg-text-2/70 uppercase tracking-wider block">
                      {isZh ? '数据隐私' : 'Data Privacy'}
                    </span>
                    <span className="font-extrabold text-mg-text-0 text-[13px]">
                      {model.zero_data_retention ? (
                        <span className="text-emerald-500 font-bold">{isZh ? '零留存' : 'Zero Retention'}</span>
                      ) : (
                        <span className="text-mg-text-1">{isZh ? '标准保护' : 'Standard'}</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* 计费单价与快速体验按钮 */}
                <div className="flex items-end justify-between pt-3 mt-auto border-t border-mg-border/20 relative z-10">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-mg-text-2/70 uppercase tracking-wider block">
                      {isZh ? '预估输入单价' : 'Input Price'}
                    </span>
                    <span className="font-mono text-[14px] font-black text-mg-text-0 tabular-nums">
                      {formatModelPrice(model.pricing?.input_per_1m, model.pricing?.currency)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleGoPlayground(model.model_id, e)}
                    className="rounded-full h-8 px-4 text-xs font-bold text-brand-base hover:text-white border border-brand-base/20 hover:bg-brand-base flex items-center gap-1 cursor-pointer transition-all duration-300 active:scale-95 hover:shadow-sm hover:shadow-brand-glow/20"
                  >
                    {isZh ? '去体验' : 'Try'}
                    <LuChevronRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
              </div>

              {/* 气泡详情 Popover (聊天气泡风格) */}
              <div 
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-[calc(100%+14px)] right-2 left-auto translate-x-0 w-[330px] bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-xl border border-mg-border/60 dark:border-white/10 shadow-[0_20px_50px_-12px_rgba(37,99,235,0.15)] dark:shadow-[0_20px_50px_-12px_rgba(29,195,155,0.25)] rounded-[22px] rounded-br-[2px] p-5 origin-bottom-right transition-all duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] opacity-0 scale-90 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0 group-hover:pointer-events-auto z-50 text-left cursor-default before:absolute before:inset-x-0 before:top-full before:h-[18px] before:content-[''] before:pointer-events-auto"
              >
                {/* Top Shimmer Line */}
                <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-[#2563eb] via-[#1dbd96] to-[#1DC39B] rounded-t-[22px] rounded-tr-[2px]" />

                {/* Speech Bubble Tail */}
                <svg 
                  width="16" 
                  height="12" 
                  viewBox="0 0 16 12" 
                  fill="none" 
                  className="absolute top-[calc(100%-1px)] right-6 z-20 text-white dark:text-[#0f172a]"
                >
                  <path 
                    d="M16 0C12 0 8 2.5 5.5 5.5C3 8.5 1.5 10 0 12C4 12 8 9 11 5.5C13.5 2.5 15 1 16 0Z" 
                    fill="currentColor"
                  />
                  <path 
                    d="M16 0C12 0 8 2.5 5.5 5.5C3 8.5 1.5 10 0 12" 
                    stroke="currentColor" 
                    strokeWidth="1.2"
                    className="text-mg-border/60 dark:text-white/10"
                    fill="none"
                  />
                </svg>
                
                {/* Content */}
                <div className="relative z-20 space-y-4 pt-1">
                  {/* Header */}
                  <div className="flex items-center justify-between pb-1">
                    <div>
                      <span className="text-[10px] font-bold text-brand-base dark:text-[#1DC39B] uppercase tracking-widest block">{model.vendor || 'ModelGo'}</span>
                      <h4 className="text-[16px] font-black text-mg-text-0 tracking-tight mt-0.5">{model.display_name}</h4>
                    </div>
                    {model.modalities && model.modalities[0] && (
                      <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-brand-base/10 dark:bg-brand-mid/10 text-brand-base dark:text-brand-mid rounded-md border border-brand-base/20">
                        {model.modalities[0]}
                      </span>
                    )}
                  </div>
                  
                  {/* Grid Specs */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {/* Released At */}
                    <div className="bg-mg-fill-0/20 dark:bg-white/[0.02] border border-mg-border/20 dark:border-white/5 rounded-xl p-2.5 flex items-center gap-2.5 transition-colors hover:bg-mg-fill-0/40 dark:hover:bg-white/[0.04]">
                      <div className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-brand-base/10 dark:bg-[#1DC39B]/10 text-brand-base dark:text-[#1DC39B]">
                        <LuCalendar size={14} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[9px] text-mg-text-2 font-medium tracking-wide block uppercase leading-none">{isZh ? '发布时间' : 'Released At'}</span>
                        <span className="font-extrabold text-[12px] text-mg-text-0 block mt-1 truncate">{model.released_at || '—'}</span>
                      </div>
                    </div>

                    {/* Knowledge Cutoff */}
                    <div className="bg-mg-fill-0/20 dark:bg-white/[0.02] border border-mg-border/20 dark:border-white/5 rounded-xl p-2.5 flex items-center gap-2.5 transition-colors hover:bg-mg-fill-0/40 dark:hover:bg-white/[0.04]">
                      <div className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-brand-base/10 dark:bg-[#1DC39B]/10 text-brand-base dark:text-[#1DC39B]">
                        <LuClock size={14} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[9px] text-mg-text-2 font-medium tracking-wide block uppercase leading-none">{isZh ? '知识截止' : 'Knowledge'}</span>
                        <span className="font-extrabold text-[12px] text-mg-text-0 block mt-1 truncate">{model.knowledge_cutoff || '—'}</span>
                      </div>
                    </div>

                    {/* Context Length */}
                    <div className="bg-mg-fill-0/20 dark:bg-white/[0.02] border border-mg-border/20 dark:border-white/5 rounded-xl p-2.5 flex items-center gap-2.5 transition-colors hover:bg-mg-fill-0/40 dark:hover:bg-white/[0.04]">
                      <div className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-brand-base/10 dark:bg-[#1DC39B]/10 text-brand-base dark:text-[#1DC39B]">
                        <LuCpu size={14} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[9px] text-mg-text-2 font-medium tracking-wide block uppercase leading-none">{isZh ? '上下文窗口' : 'Context'}</span>
                        <span className="font-extrabold text-[12px] text-mg-text-0 block mt-1 truncate">{formatContextLength(model.context_length)}</span>
                      </div>
                    </div>

                    {/* Max Output Tokens */}
                    <div className="bg-mg-fill-0/20 dark:bg-white/[0.02] border border-mg-border/20 dark:border-white/5 rounded-xl p-2.5 flex items-center gap-2.5 transition-colors hover:bg-mg-fill-0/40 dark:hover:bg-white/[0.04]">
                      <div className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-brand-base/10 dark:bg-[#1DC39B]/10 text-brand-base dark:text-[#1DC39B]">
                        <LuZap size={14} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[9px] text-mg-text-2 font-medium tracking-wide block uppercase leading-none">{isZh ? '最大输出' : 'Max Output'}</span>
                        <span className="font-extrabold text-[12px] text-mg-text-0 block mt-1 truncate">{model.max_output_tokens?.toLocaleString() || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Pricing Details Table */}
                  <div className="bg-mg-fill-0/30 dark:bg-white/[0.02] border border-mg-border/30 dark:border-white/5 rounded-xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between text-[10px] font-extrabold text-mg-text-2/70 uppercase tracking-widest pb-1 border-b border-mg-border/10">
                      <span>{isZh ? '定价细则' : 'Pricing Detail'}</span>
                      <span className="text-brand-base dark:text-brand-mid font-mono text-[9px] lowercase">per 1M tokens</span>
                    </div>
                    <div className="space-y-2 text-[12px]">
                      <div className="flex justify-between items-center text-mg-text-1">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          {isZh ? '输入单价' : 'Input Price'}
                        </span>
                        <span className="font-mono font-black text-mg-text-0">{formatModelPrice(model.pricing?.input_per_1m, model.pricing?.currency)}</span>
                      </div>
                      <div className="flex justify-between items-center text-mg-text-1">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#1DC39B]" />
                          {isZh ? '输出单价' : 'Output Price'}
                        </span>
                        <span className="font-mono font-black text-mg-text-0">{formatModelPrice(model.pricing?.output_per_1m, model.pricing?.currency)}</span>
                      </div>
                      <div className="flex justify-between items-center text-mg-text-1">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                          {isZh ? '缓存读取' : 'Cache Read'}
                        </span>
                        <span className="font-mono font-black text-mg-text-0">{formatModelPrice(model.pricing?.cache_read_per_1m, model.pricing?.currency)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Feature Badges with pulse dots */}
                  {(model.zero_data_retention || model.in_region_routing) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {model.zero_data_retention && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 tracking-wide">
                          <span className="relative flex h-1.5 w-1.5 mr-1.5 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                          </span>
                          {isZh ? '数据零留存' : 'Zero Retention'}
                        </span>
                      )}
                      {model.in_region_routing && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold text-blue-600 dark:text-blue-400 tracking-wide">
                          <span className="relative flex h-1.5 w-1.5 mr-1.5 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
                          </span>
                          {isZh ? '区域内路由' : 'In-Region'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
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
