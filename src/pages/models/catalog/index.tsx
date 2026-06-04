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
import { Tooltip } from '@/components/ui/Tooltip'

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

              {/* 右上角斜角标触发器及系统 Tooltip 组件 */}
              {/* 右上角提示小气泡触发器及系统 Tooltip 组件 */}
              <div 
                onClick={(e) => e.stopPropagation()}
                className="absolute top-4 right-4 z-30"
              >
                <Tooltip
                  position="top"
                  className="z-[9999]"
                  content={
                    <div className="space-y-1.5 text-left text-slate-100 p-1 min-w-[150px] leading-normal select-none">
                      <div className="font-extrabold text-[12.5px] border-b border-white/10 pb-1 mb-1 tracking-tight text-white">
                        {model.display_name}
                      </div>
                      <div className="space-y-1 text-[11px] font-semibold text-slate-200">
                        <p>⚡ {isZh ? '窗口：' : 'Ctx: '}<strong>{formatContextLength(model.context_length)}</strong></p>
                        {model.knowledge_cutoff && <p>📅 {isZh ? '截止：' : 'Cutoff: '}<strong>{model.knowledge_cutoff}</strong></p>}
                        <p>📥 {isZh ? '输入：' : 'Input: '}<strong>{formatModelPrice(model.pricing?.input_per_1m, model.pricing?.currency)}</strong>/1M</p>
                        <p>📤 {isZh ? '输出：' : 'Output: '}<strong>{formatModelPrice(model.pricing?.output_per_1m, model.pricing?.currency)}</strong>/1M</p>
                      </div>
                    </div>
                  }
                >
                  {/* 右上角带动画、带样式的小提示气泡触发器 */}
                  <div 
                    className="w-[20px] h-[20px] rounded-full bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-400 dark:text-neutral-500 hover:text-brand-base dark:hover:text-brand-mid hover:border-brand-base/30 hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer shadow-sm relative"
                    title={isZh ? '查看模型详情' : 'View model details'}
                  >
                    {/* 呼吸脉冲底圈 */}
                    <span className="absolute -inset-[2px] rounded-full bg-neutral-200/35 dark:bg-neutral-850/35 animate-pulse pointer-events-none" />
                    
                    {/* 提示小角标字符 i */}
                    <span className="font-mono text-[9px] font-bold select-none leading-none">i</span>
                    
                    {/* 气泡右上角橙色状态小角标（呼吸红点） */}
                    <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                    </span>
                  </div>
                </Tooltip>
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
