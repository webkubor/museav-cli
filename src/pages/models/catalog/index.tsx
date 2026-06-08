import { useMemo, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LuSearch,
  LuCopy,
  LuCheck,
  LuZap,
  LuGitCompareArrows,
  LuChevronRight,
  LuChevronDown,
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

interface ModelMeta {
  descriptionZh: string
  descriptionEn: string
  tagsZh: string[]
  tagsEn: string[]
  scores: {
    speed: number
    reasoning: number
    cost: number
  }
}

const MODEL_META_MAP: Record<string, ModelMeta> = {
  'qwen/qwen3.7-max': {
    descriptionZh: '适合中文长上下文，复杂推理与企业知识库检索。',
    descriptionEn: 'Tailored for long Chinese context, complex reasoning, and enterprise knowledge base retrieval.',
    tagsZh: ['客服知识库', '代码理解', '长文档分析'],
    tagsEn: ['Customer Support', 'Code Analysis', 'Long Document'],
    scores: { speed: 2, reasoning: 3, cost: 2 }
  },
  'qwen/qwen3.6-flash': {
    descriptionZh: '极速响应的轻量级模型，适合高频对话、文本分类及实时交互。',
    descriptionEn: 'Ultra-fast lightweight model, ideal for high-frequency chats, classification, and real-time interactions.',
    tagsZh: ['即时客服', '日常对话', '文本分类'],
    tagsEn: ['Live Chat', 'General Chat', 'Classification'],
    scores: { speed: 4, reasoning: 1, cost: 4 }
  },
  'openai/gpt-5.5': {
    descriptionZh: '前沿的通用智能旗舰模型，在逻辑推理、代码生成与多模态任务中表现卓越。',
    descriptionEn: 'Cutting-edge flagship general model, excelling in logic, code generation, and multimodal tasks.',
    tagsZh: ['复杂逻辑', '智能Agent', '多模态交互'],
    tagsEn: ['Complex Logic', 'AI Agents', 'Multimodal'],
    scores: { speed: 3, reasoning: 4, cost: 1 }
  },
  'anthropic/claude-opus-4.7-fast': {
    descriptionZh: '长文本理解与精细逻辑的代表作，适合深度阅读、学术分析及复杂指令遵循。',
    descriptionEn: 'Masterpiece of long context and fine-grained logic, perfect for reading comprehension and complex instructions.',
    tagsZh: ['论文精读', '长文本分析', '高精指令'],
    tagsEn: ['Paper Reading', 'Long Text', 'Fine Instruction'],
    scores: { speed: 3, reasoning: 4, cost: 1 }
  },
  'mistralai/mistral-medium-3-5': {
    descriptionZh: '欧洲明星大模型，平衡了出色的推理能力与合理的运行成本。',
    descriptionEn: 'European star model balancing outstanding reasoning capabilities with reasonable operation costs.',
    tagsZh: ['内容创作', '逻辑分析', '多语言翻译'],
    tagsEn: ['Content Creation', 'Logic Analysis', 'Translation'],
    scores: { speed: 3, reasoning: 3, cost: 3 }
  }
}

function getModelMeta(modelId: string, isZh: boolean) {
  const matched = MODEL_META_MAP[modelId]
  if (matched) {
    return {
      description: isZh ? matched.descriptionZh : matched.descriptionEn,
      tags: isZh ? matched.tagsZh : matched.tagsEn,
      scores: matched.scores
    }
  }

  const idLower = modelId.toLowerCase()
  const isReasoning = idLower.includes('reason') || idLower.includes('think') || idLower.includes('opus') || idLower.includes('max')
  const isFlash = idLower.includes('flash') || idLower.includes('speed') || idLower.includes('lite') || idLower.includes('mini')
  
  let speed = 3
  let reasoning = 2
  let cost = 3

  if (isReasoning) {
    speed = 2
    reasoning = 4
    cost = 1
  } else if (isFlash) {
    speed = 4
    reasoning = 1
    cost = 4
  }

  const tags = isZh 
    ? ['业务对接', '接口测试', '快速集成']
    : ['Business Integration', 'API Testing', 'Fast Setup']

  const description = isZh
    ? '支持高并发的多功能通用智能模型，可灵活对接企业级生产业务。'
    : 'A versatile general model supporting high concurrency and flexible business integration.'

  return {
    description,
    tags,
    scores: { speed, reasoning, cost }
  }
}

export default function ModelsCatalogPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const isZh = i18n.language.startsWith('zh')

  const [category, setCategory] = useState<CategoryKey>('all')
  const [isCompareOpen, setIsCompareOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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
      appToast.success(t('modelsCatalog.toast.copied'))
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      appToast.error(t('modelsCatalog.toast.copyFailed'))
    }
  }

  const handleGoPlayground = (modelId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    navigate('/models/playground', { state: { selectedModelId: modelId } })
  }

  const handleToggleExpand = useCallback((modelId: string) => {
    setExpandedId(prev => prev === modelId ? null : modelId)
  }, [])

  return (
    <div className="space-y-8 py-2">
      {/* 极简大气头部看板 */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight text-mg-text-0 md:text-4xl">
            {t('modelsCatalog.allModels.title')}
          </h1>
          <p className="text-[13.5px] text-mg-text-2 font-medium max-w-2xl leading-relaxed">
            {t('modelsCatalog.allModels.desc')}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="outline"
            className="rounded-full h-10 px-5 text-xs font-bold shadow-sm hover:shadow-md transition-all duration-300"
            onClick={() => setIsCompareOpen(true)}
          >
            <LuGitCompareArrows size={14} className="mr-2 text-brand-base" />
            {t('modelsCatalog.button.compare')}
          </Button>
        </div>
      </div>

      {/* 搜索与过滤栏 */}
      <div className="flex flex-col gap-3 bg-mg-bg-0/60 backdrop-blur-md px-4 pt-4 pb-3 border border-mg-border/40 rounded-2xl shadow-sm">
        <Input
          variant="search"
          prefix={<LuSearch size={16} className="text-mg-text-2/80" />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('modelsCatalog.placeholder.search')}
          className="w-full h-11 text-[13.5px]"
        />
        <div className="flex items-center gap-2 flex-wrap">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={cn(
                'px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-300 cursor-pointer whitespace-nowrap tracking-wide',
                category === item
                  ? 'bg-brand-base text-white shadow-md shadow-brand-glow/20'
                  : 'bg-mg-fill-0/40 text-mg-text-1 hover:text-mg-text-0 hover:bg-mg-fill-0/90 active:scale-95',
              )}
            >
              {t(`modelsCatalog.filter.${item}`)}
            </button>
          ))}
        </div>
      </div>

      {/* 呼吸感卡片网格列表 */}
      {modelsQuery.isLoading ? (
        <div className="py-28 flex flex-col items-center justify-center text-mg-text-2 text-sm gap-3">
          <div className="w-7 h-7 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
          <span className="font-semibold tracking-wider">{t('modelsCatalog.loading')}</span>
        </div>
      ) : modelsQuery.isError ? (
        <div className="py-28 text-center text-mg-text-2 text-sm font-semibold tracking-wide">
          {t('modelsCatalog.error.load')}
        </div>
      ) : visibleModels.length === 0 ? (
        <div className="py-28 text-center text-mg-text-2 text-sm font-semibold tracking-wide">
          {t('modelsCatalog.empty')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {visibleModels.map((model, idx) => {
            const meta = getModelMeta(model.model_id, isZh)
            const position = windowWidth > 1024
              ? (idx % 3 === 2 ? 'left' : 'right')
              : (windowWidth > 768 ? (idx % 2 === 1 ? 'left' : 'right') : 'top')

            const arrowClass = position === 'left'
              ? 'border-l-[#0b0d0b] dark:border-l-[#0b0d0b]'
              : (position === 'right' ? 'border-r-[#0b0d0b] dark:border-r-[#0b0d0b]' : 'border-t-[#0b0d0b] dark:border-t-[#0b0d0b]')

            const isExpanded = expandedId === model.id

            return (
              <div key={model.id} className="flex flex-col gap-0 w-full">
              <Tooltip
                position={position}
                containerClassName="w-full flex"
                className="z-[9999] max-w-[440px] border border-mg-border dark:border-emerald-500/20 shadow-[0_20px_50px_rgba(0,0,0,0.10)] dark:shadow-[0_20px_50px_rgba(16,185,129,0.15)] bg-white dark:bg-[#0b0d0b] text-mg-text-0 dark:text-neutral-100 p-0 rounded-2xl animate-in fade-in-0 duration-300"
                arrowClassName={arrowClass}
                interactive={true}
                content={
                  <div className="p-5 select-none w-[420px] text-left space-y-4">
                    {/* 头部：大图标、厂商、在线状态 */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 p-1.5 bg-mg-fill-0 dark:bg-[#141614] border border-mg-border dark:border-neutral-800/60 rounded-xl">
                          {vendorNode(model, 'lg')}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-[15px] text-mg-text-0 tracking-tight truncate leading-tight">
                            {model.display_name}
                          </h4>
                          <span className="text-[11px] text-mg-text-2 font-bold block mt-0.5">
                            {model.vendor || 'ModelGo'}
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {isZh ? '在线' : 'Online'}
                      </span>
                    </div>

                    {/* 描述语 */}
                    <p className="text-mg-text-2 text-[11px] leading-relaxed">
                      {meta.description}
                    </p>
                    
                    {/* 参数网格：仅保留参数网格那一块的上下边框 */}
                    <div className="grid grid-cols-[1.2fr_1fr] gap-x-4 text-[11px] leading-normal border-y border-mg-border py-3.5">
                      {/* 列 1：能力 & 上下文 */}
                      <div className="space-y-3.5 pr-1">
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold text-mg-text-2 uppercase tracking-wider block">
                            {isZh ? '能力' : 'Capabilities'}
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {model.modalities?.slice(0, 3).map(m => {
                              const labelMap: Record<string, string> = {
                                text: isZh ? '文本' : 'Text',
                                image: isZh ? '图像' : 'Image',
                                audio: isZh ? '音频' : 'Audio',
                                video: isZh ? '视频' : 'Video',
                                file: isZh ? '文件' : 'File'
                              }
                              const colorMap: Record<string, string> = {
                                text:  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
                                image: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
                                audio: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
                                video: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
                                file:  'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                              }
                              const cls = colorMap[m] || 'bg-mg-fill-0 text-mg-text-2 border-mg-border'
                              return (
                                <span key={m} className={cn("text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border", cls)}>
                                  {labelMap[m] || m}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[9px] font-bold text-mg-text-2 uppercase tracking-wider block">
                            {isZh ? '上下文' : 'Context'}
                          </span>
                          <span className="text-xs font-black text-mg-text-0 leading-none">
                            {formatContextLength(model.context_length)}
                          </span>
                        </div>
                      </div>

                      {/* 列 2：价格 (改版为左右对齐) */}
                      <div className="border-l border-mg-border pl-4 space-y-1">
                        <span className="text-[9px] font-bold text-mg-text-2 uppercase tracking-wider block">
                          {isZh ? '价格' : 'Price'}
                        </span>
                        <div className="space-y-2 pt-0.5">
                          <div className="flex items-center justify-between gap-1 text-[11px]">
                            <span className="text-mg-text-2 font-medium">{isZh ? '输入' : 'Input'}</span>
                            <span className="font-mono font-bold text-mg-text-0 tabular-nums">
                              {formatModelPrice(model.pricing?.input_per_1m, model.pricing?.currency)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-1 text-[11px]">
                            <span className="text-mg-text-2 font-medium">{isZh ? '输出' : 'Output'}</span>
                            <span className="font-mono font-bold text-mg-text-0 tabular-nums">
                              {formatModelPrice(model.pricing?.output_per_1m, model.pricing?.currency)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 推荐场景与进度条：无横线分割 */}
                    <div className="grid grid-cols-[1.4fr_1fr] gap-4">
                      {/* 推荐场景 */}
                      <div className="space-y-2">
                        <span className="text-[9px] font-bold text-mg-text-2 uppercase tracking-wider block">
                          {isZh ? '推荐场景' : 'Suggested Use Cases'}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {meta.tags.map(t => (
                            <span key={t} className="text-[9px] font-semibold px-2 py-1 bg-mg-fill-0 border border-mg-border text-mg-text-1 rounded-full transition-colors leading-none">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* 指标评分 */}
                      <div className="space-y-1.5">
                        {Object.entries(meta.scores).map(([key, score]) => {
                          const label = {
                            speed: isZh ? '速度' : 'Speed',
                            reasoning: isZh ? '推理' : 'Reasoning',
                            cost: isZh ? '成本' : 'Cost'
                          }[key as 'speed' | 'reasoning' | 'cost']
                          return (
                            <div key={key} className="flex items-center justify-between text-[10px] gap-2 leading-none">
                              <span className="text-mg-text-2 font-bold">{label}</span>
                              <div className="flex gap-0.5">
                                {[1, 2, 3, 4].map(idx => (
                                  <span
                                    key={idx}
                                    className={cn(
                                      "w-3.5 h-1.5 rounded-sm transition-all duration-300",
                                      idx <= score 
                                        ? "bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]"
                                        : "bg-mg-fill-1"
                                    )}
                                  />
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* 底部按钮栏：无横线分割 */}
                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={(e) => handleCopyApiId(model.model_id, e)}
                        className="flex-1 h-9 bg-transparent hover:bg-mg-fill-0 border border-mg-border text-mg-text-1 font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all text-xs cursor-pointer active:scale-98"
                      >
                        <LuCopy size={11} />
                        {isZh ? '复制 API ID' : 'Copy API ID'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleGoPlayground(model.model_id, e)}
                        className="flex-1 h-9 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all text-xs cursor-pointer active:scale-98 shadow-md shadow-emerald-500/10"
                      >
                        {isZh ? '查看详情' : 'View Details'}
                        <LuChevronRight size={12} />
                      </button>
                    </div>
                  </div>
                }
              >
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={() => handleToggleExpand(model.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleToggleExpand(model.id)
                  }
                }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{
                  transform: 'perspective(1000px) rotateX(var(--rotate-x, 0deg)) rotateY(var(--rotate-y, 0deg)) scale3d(var(--scale, 1), var(--scale, 1), var(--scale, 1))',
                  transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
                className={cn(
                  "group relative p-[1px] rounded-2xl bg-[rgba(15,23,42,0.09)] dark:bg-[rgba(255,255,255,0.14)] transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) hover:shadow-[0_20px_40px_-10px_var(--brand-glow)] shadow-[0_8px_30px_rgb(0,0,0,0.02)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] [--scale:1] hover:[--scale:1.015] flex flex-1 cursor-pointer w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2",
                  isExpanded && "shadow-[0_20px_40px_-10px_var(--brand-glow)]"
                )}
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

                  {/* 模型描述 */}
                  <p className="text-[12px] text-mg-text-2/90 line-clamp-2 leading-relaxed -mt-2 -mb-1 relative z-10">
                    {meta.description}
                  </p>

                  {/* 优化后的 API ID 复制栏 */}
                  <div className="space-y-1 relative z-10">
                    <div
                      onClick={(e) => handleCopyApiId(model.model_id, e)}
                      className={cn(
                        'group/id flex items-center justify-between gap-3 px-3 py-2.5 bg-mg-fill-0/75 dark:bg-neutral-900/50 hover:bg-brand-base/[0.03] border border-mg-border/30 dark:border-neutral-800/80 hover:border-brand-base/30 rounded-xl cursor-pointer transition-all duration-300 select-all shadow-inner',
                        copiedId === model.model_id && 'bg-emerald-500/[0.03] dark:bg-emerald-500/5 border-emerald-500/30'
                      )}
                      title={isZh ? '点击复制 API ID' : 'Click to copy API ID'}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="shrink-0 text-[9px] font-black tracking-wider uppercase px-1.5 py-0.5 bg-brand-base/10 dark:bg-brand-base/15 text-brand-base rounded border border-brand-base/20 select-none">
                          API ID
                        </span>
                        <code className="font-mono text-xs font-bold text-mg-text-1 group-hover/id:text-mg-text-0 truncate leading-none">
                          {model.model_id}
                        </code>
                      </div>
                      <div className={cn(
                        "shrink-0 flex items-center justify-center w-6 h-6 rounded-lg border shadow-sm transition-all duration-300",
                        copiedId === model.model_id 
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500" 
                          : "border-mg-border/60 bg-white dark:bg-neutral-800 text-mg-text-2 group-hover/id:text-brand-base group-hover/id:border-brand-base/30 group-hover/id:shadow"
                      )}>
                        {copiedId === model.model_id ? (
                          <LuCheck size={11} className="text-emerald-500 animate-in zoom-in-75 duration-200" />
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

                  {/* 参数指标行：展示上下文与发布日期 */}
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
                        {isZh ? '发布日期' : 'Released At'}
                      </span>
                      <span className="font-extrabold text-mg-text-0 text-[13px]">
                        {model.released_at || '—'}
                      </span>
                    </div>
                  </div>

                  {/* 计费单价与快速体验按钮：提供完整的输入/输出计费 */}
                  <div className="flex items-end justify-between pt-3 mt-auto border-t border-mg-border/20 relative z-10">
                    <div className="flex gap-4">
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-mg-text-2/70 uppercase tracking-wider block">
                          {isZh ? '输入单价' : 'Input Price'}
                        </span>
                        <span className="font-mono text-[12px] font-black text-mg-text-0 tabular-nums">
                          {formatModelPrice(model.pricing?.input_per_1m, model.pricing?.currency)}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-mg-text-2/70 uppercase tracking-wider block">
                          {isZh ? '输出单价' : 'Output Price'}
                        </span>
                        <span className="font-mono text-[12px] font-black text-mg-text-0 tabular-nums">
                          {formatModelPrice(model.pricing?.output_per_1m, model.pricing?.currency)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => handleGoPlayground(model.model_id, e)}
                        className="rounded-full h-8 px-4 text-xs font-bold text-brand-base hover:text-white border border-brand-base/20 hover:bg-brand-base flex items-center gap-1 cursor-pointer transition-all duration-300 active:scale-95 hover:shadow-sm hover:shadow-brand-glow/20 shrink-0"
                      >
                        {isZh ? '去体验' : 'Try'}
                        <LuChevronRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                      </button>
                      <div
                        aria-hidden="true"
                        className={cn(
                          "w-6 h-6 rounded-full border border-mg-border/40 bg-mg-fill-0/40 flex items-center justify-center text-mg-text-2 transition-transform duration-300",
                          isExpanded && "rotate-180 text-brand-base border-brand-base/30 bg-brand-base/10"
                        )}
                      >
                        <LuChevronDown size={12} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Tooltip>

            {/* 展开的规格面板 */}
            {isExpanded && (
              <div className="mt-2 rounded-2xl border border-mg-border/30 bg-mg-bg-0/80 dark:bg-mg-bg-0/90 backdrop-blur-md p-5 space-y-4 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                {/* 能力标签 */}
                {model.modalities && model.modalities.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-bold text-mg-text-2/70 uppercase tracking-wider block">
                      {isZh ? '能力' : 'Capabilities'}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {model.modalities.map(m => {
                        const labelMap: Record<string, string> = {
                          text: isZh ? '文本' : 'Text',
                          image: isZh ? '图像' : 'Image',
                          audio: isZh ? '音频' : 'Audio',
                          video: isZh ? '视频' : 'Video',
                          file: isZh ? '文件' : 'File'
                        }
                        const colorMap: Record<string, string> = {
                          text: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
                          image: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
                          audio: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
                          video: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
                          file: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                        }
                        const cls = colorMap[m] || 'bg-mg-fill-0/60 text-mg-text-2 border-mg-border/40'
                        return (
                          <span key={m} className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", cls)}>
                            {labelMap[m] || m}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 推荐场景 & 指标评分 */}
                <div className="grid grid-cols-[1.4fr_1fr] gap-4">
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-bold text-mg-text-2/70 uppercase tracking-wider block">
                      {isZh ? '推荐场景' : 'Suggested Use Cases'}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {meta.tags.map(t => (
                        <span key={t} className="text-[10px] font-semibold px-2 py-0.5 bg-mg-fill-0/60 border border-mg-border/30 text-mg-text-1 rounded-full leading-none">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-bold text-mg-text-2/70 uppercase tracking-wider block">
                      {isZh ? '能力评分' : 'Scores'}
                    </span>
                    <div className="space-y-1.5">
                      {Object.entries(meta.scores).map(([key, score]) => {
                        const label = {
                          speed: isZh ? '速度' : 'Speed',
                          reasoning: isZh ? '推理' : 'Reasoning',
                          cost: isZh ? '成本' : 'Cost'
                        }[key as 'speed' | 'reasoning' | 'cost']
                        return (
                          <div key={key} className="flex items-center justify-between text-[10px] gap-2 leading-none">
                            <span className="text-mg-text-2 font-bold">{label}</span>
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4].map(i => (
                                <span
                                  key={i}
                                  className={cn(
                                    "w-3.5 h-1.5 rounded-sm",
                                    i <= score ? "bg-brand-base" : "bg-mg-fill-0/60 border border-mg-border/30"
                                  )}
                                />
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* 底部操作按钮 */}
                <div className="flex items-center gap-3 pt-1 border-t border-mg-border/20">
                  <button
                    type="button"
                    onClick={(e) => handleCopyApiId(model.model_id, e)}
                    className="flex-1 h-8 bg-mg-fill-0/40 hover:bg-mg-fill-0/80 border border-mg-border/40 text-mg-text-1 font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all text-xs cursor-pointer"
                  >
                    <LuCopy size={11} />
                    {isZh ? '复制 API ID' : 'Copy API ID'}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleGoPlayground(model.model_id, e)}
                    className="flex-1 h-8 bg-brand-base hover:bg-brand-mid text-white font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all text-xs cursor-pointer"
                  >
                    {isZh ? '查看详情' : 'View Details'}
                    <LuChevronRight size={12} />
                  </button>
                </div>
              </div>
            )}
            </div>
          )})}
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
