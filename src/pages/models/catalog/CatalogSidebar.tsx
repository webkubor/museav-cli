/**
 * 左侧筛选栏（对齐 PRD 原型 marketplaceFilterGroups，2026-08 改版 shared/modelgo_prd#872）。
 *
 * 分组顺序照原型：折扣开关(顶部) → 输入类型 → 模型厂商 → API 协议 →
 * 上下文长度(滑杆) → 能力标签 → 价格。
 *
 * 与旧版的差异（#872 需求点 1/2/5/6/7/8）：
 * - 各组不再有「全部」行，默认不选即不限；
 * - 选项行右侧是勾选标记，不再显示计数（facets 计数链路已下线，见
 *   modelCatalogFilterLogic.ts 头注）；
 * - 输入类型/厂商/协议多选（组内 OR）；
 * - 每组标题右侧有独立清空按钮，只清本组；
 * - 上下文长度改 8 档滑杆（任意→1M）；
 * - 厂商行带品牌字标（@model-go/icons，经 <ModelIcon> 渲染，DESIGN.md 铁律）。
 *
 * ⚠️ 厂商维度是**厂商(vendor)**不是模型系列(family)；选项从当前列表数据聚合
 * （小写归一去重 —— 后端同一品牌会混发 `minimax`/`MiniMax` 两种大小写）。
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LuChevronDown, LuX, LuCheck, LuRotateCcw,
  LuType, LuImage, LuAudioLines, LuVideo, LuFileText,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import type { CatalogModelItem, CatalogModelTag } from '@/types'
import {
  INPUT_TYPE_CODES,
  CONTEXT_SLIDER_STOPS,
  modelVendorCode,
} from './modelCatalogFilterLogic'
import { usePublicProtocolsStore } from '@/store/use-public-protocols-store'
import { mergeProtocolLabels } from '@/features/models/model-format'

const VENDOR_PREVIEW = 6

/** 厂商展示名。后端下发标识大小写不一，原型展示品牌写法。 */
const VENDOR_LABEL_ZH: Record<string, string> = {
  openai: 'OpenAI', anthropic: 'Anthropic', deepseek: 'DeepSeek', moonshot: 'Moonshot',
  moonshotai: 'MoonshotAI', zhipu: 'Z.ai', minimax: 'MiniMax', qwen: 'Qwen',
  volcengine: '火山方舟', mistralai: 'Mistral AI', google: 'Google', meta: 'Meta',
  bytedance: 'ByteDance', xai: 'xAI', baidu: '百度', tencent: '腾讯', hunyuan: '混元',
}
const VENDOR_LABEL_EN: Record<string, string> = {
  openai: 'OpenAI', anthropic: 'Anthropic', deepseek: 'DeepSeek', moonshot: 'Moonshot',
  moonshotai: 'MoonshotAI', zhipu: 'Z.ai', minimax: 'MiniMax', qwen: 'Qwen',
  volcengine: 'Volcengine', mistralai: 'Mistral AI', google: 'Google', meta: 'Meta',
  bytedance: 'ByteDance', xai: 'xAI', baidu: 'Baidu', tencent: 'Tencent', hunyuan: 'Hunyuan',
}
function vendorLabel(code: string, fallback: string, isZh: boolean): string {
  const labels = isZh ? VENDOR_LABEL_ZH : VENDOR_LABEL_EN
  const raw = fallback || code
  // 未收录品牌写法时兜底首字母大写（后端有 `kling` 这类全小写标识）
  return labels[code] || raw.charAt(0).toUpperCase() + raw.slice(1)
}

/**
 * API 协议筛选项：固定顺序展示端点粒度 7 值（2026-08 由 openai/anthropic/other
 * 3 值升级而来，见 gateway_models.public_protocols）。静态列表而非从 facets 动态
 * 派生——理由同 vendor/modality 之外的固定分组：筛选项本身是产品口径而非数据驱动，
 * 顺序固定成 Chat 优先、Anthropic Messages / 其他兜底在后，跟卡片/详情标签排序
 * （model-format.ts PROTOCOL_ORDER）保持一致体感。
 *
 * 下面两张表是**本地兜底**，不是真源——真源是 modelgo-model-gateway
 * `pkg/publicprotocols` 注册表，经 /catalog/public-protocols 运行时拉取
 * （usePublicProtocolsStore），拿到数据后用 mergeProtocolLabels 覆盖同名 code；
 * 接口未上线/未返回时保留这份兜底文案，与 model-format.ts 的 PROTOCOL_LABEL_ZH/EN
 * 用同一套措辞（2026-08-26 对齐口径），只有 other 这条本页有专属兜底文案，维持不变。
 */
const PROTOCOL_FILTER_ORDER = [
  'openai_chat', 'openai_responses', 'openai_images', 'openai_embeddings', 'openai_audio',
  'anthropic_messages', 'other',
] as const
const PROTOCOL_LABEL_ZH: Record<string, string> = {
  openai_chat: 'OpenAI 兼容',
  openai_responses: 'OpenAI Response',
  openai_images: 'OpenAI 图片',
  openai_embeddings: 'OpenAI 向量',
  openai_audio: 'OpenAI 语音',
  anthropic_messages: 'Anthropic 兼容',
  other: '其他（异步任务类，如图像/音视频）',
}
const PROTOCOL_LABEL_EN: Record<string, string> = {
  openai_chat: 'OpenAI Compatible',
  openai_responses: 'OpenAI Responses',
  openai_images: 'OpenAI Images',
  openai_embeddings: 'OpenAI Embeddings',
  openai_audio: 'OpenAI Audio',
  anthropic_messages: 'Anthropic Compatible',
  other: 'Other',
}

/** 输入类型小图标（原型 catalogModalityIcons + 文件 FileText） */
const INPUT_TYPE_ICON: Record<string, IconType> = {
  text: LuType, image: LuImage, audio: LuAudioLines, video: LuVideo, file: LuFileText,
}

interface Props {
  tags: CatalogModelTag[]
  /** 当前列表数据（q/sort 之后、维度筛选之前），用于聚合厂商选项与折扣计数 */
  models: CatalogModelItem[]
  selected: string[]
  setSelected: React.Dispatch<React.SetStateAction<string[]>>
  isZh: boolean
}

export function CatalogSidebar({ tags, models, selected, setSelected, isZh }: Props) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [showAllVendors, setShowAllVendors] = useState(false)

  // 协议筛选项文案：/catalog/public-protocols 拿到数据前后都直接渲染，不为它加
  // loading 态——items 为 null 时 mergeProtocolLabels 原样返回下面这份本地兜底表。
  const publicProtocolItems = usePublicProtocolsStore((s) => s.items)
  const protocolLabelMap = useMemo(
    () => mergeProtocolLabels(
      isZh ? PROTOCOL_LABEL_ZH : PROTOCOL_LABEL_EN,
      publicProtocolItems,
      isZh ? 'label' : 'label_en',
    ),
    [isZh, publicProtocolItems],
  )

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  /** 单选维度：点已选项取消，点新项替换 */
  const pickOne = (dim: string, code: string | null) =>
    setSelected((prev) => [...prev.filter((k) => !k.startsWith(`${dim}:`)), ...(code ? [`${dim}:${code}`] : [])])
  /** 清空某维度全部选中项（#872 需求点 7：只清当前类别） */
  const clearDim = (dim: string) =>
    setSelected((prev) => prev.filter((k) => !k.startsWith(`${dim}:`)))

  const activeOf = (dim: string) =>
    selected.filter((k) => k.startsWith(`${dim}:`)).map((k) => k.slice(dim.length + 1))

  const inputActive = activeOf('input')
  const vendorActive = activeOf('vendor')
  const protocolActive = activeOf('protocol')
  const ctxActive = activeOf('ctx')[0]
  const priceActive = activeOf('price')[0]
  const promoActive = selected.includes('promo:1')

  /** 厂商选项：小写归一去重，保留一条原始 provider 文案做展示兜底与图标解析 */
  const vendors = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of models) {
      const code = modelVendorCode(m)
      if (code && !map.has(code)) map.set(code, m.provider || m.vendor || code)
    }
    return Array.from(map.entries())
      .map(([code, raw]) => ({ code, raw, label: vendorLabel(code, raw, isZh) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [models, isZh])

  /** 收起态下已选厂商藏在折叠区时保持展开（原型 selectedHidden 口径） */
  const selectedHiddenVendor = vendors
    .slice(VENDOR_PREVIEW)
    .some((v) => vendorActive.includes(v.code))
  const vendorsExpanded = showAllVendors || selectedHiddenVendor
  const shownVendors = vendorsExpanded ? vendors : vendors.slice(0, VENDOR_PREVIEW)

  const promoCount = useMemo(() => models.filter((m) => Boolean(m.promotion)).length, [models])

  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <aside className="mg-side">
      {/* 折扣开关置顶（原型口径），用 switch 而非 chip */}
      <div className="mg-side-discount">
        <span>
          {t('modelsCatalog.sidebar.offers')} <i>({promoCount})</i>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={promoActive}
          aria-label={t('modelsCatalog.sidebar.onlyDiscounted')}
          className={`mg-side-switch${promoActive ? ' is-on' : ''}`}
          onClick={() => toggle('promo:1')}
        >
          <span aria-hidden />
        </button>
      </div>

      <Group
        id="input"
        title={t('modelsCatalog.sidebar.inputType')}
        collapsed={collapsed}
        onToggle={toggleCollapse}
        hasSelection={inputActive.length > 0}
        onClear={() => clearDim('input')}
      >
        <div className="mg-side-list">
          {INPUT_TYPE_CODES.map((code) => {
            const Icon = INPUT_TYPE_ICON[code]
            return (
              <Row
                key={code}
                active={inputActive.includes(code)}
                label={t(`modelsCatalog.modality.${code}`)}
                icon={<Icon size={14} aria-hidden />}
                onClick={() => toggle(`input:${code}`)}
              />
            )
          })}
        </div>
      </Group>

      <Group
        id="vendor"
        title={t('modelsCatalog.sidebar.provider')}
        collapsed={collapsed}
        onToggle={toggleCollapse}
        hasSelection={vendorActive.length > 0}
        onClear={() => clearDim('vendor')}
      >
        <div className="mg-side-list">
          {shownVendors.map((v) => (
            <Row
              key={v.code}
              active={vendorActive.includes(v.code)}
              label={v.label}
              icon={(
                <ModelIcon
                  model={{ vendor: v.raw, provider: v.raw, display_name: v.label }}
                  variant="dense"
                  rounded="rounded-full"
                  className="mg-side-vendor-icon"
                />
              )}
              onClick={() => toggle(`vendor:${v.code}`)}
            />
          ))}
          {vendors.length > VENDOR_PREVIEW && !selectedHiddenVendor && (
            <button type="button" className="mg-side-more" onClick={() => setShowAllVendors((x) => !x)}>
              {vendorsExpanded ? t('modelsCatalog.sidebar.less') : t('modelsCatalog.sidebar.more')}
              <LuChevronDown size={13} className={vendorsExpanded ? 'rotate-180' : ''} />
            </button>
          )}
        </div>
      </Group>

      <Group
        id="protocol"
        title={t('modelsCatalog.sidebar.apiProtocol')}
        collapsed={collapsed}
        onToggle={toggleCollapse}
        hasSelection={protocolActive.length > 0}
        onClear={() => clearDim('protocol')}
      >
        <div className="mg-side-list">
          {PROTOCOL_FILTER_ORDER.map((p) => (
            <Row
              key={p}
              active={protocolActive.includes(p)}
              label={protocolLabelMap[p]}
              onClick={() => toggle(`protocol:${p}`)}
            />
          ))}
        </div>
      </Group>

      <Group
        id="ctx"
        title={t('modelsCatalog.sidebar.context')}
        collapsed={collapsed}
        onToggle={toggleCollapse}
        hasSelection={Boolean(ctxActive) && ctxActive !== 'all'}
        onClear={() => clearDim('ctx')}
      >
        <ContextRange
          value={ctxActive}
          anyLabel={t('modelsCatalog.sidebar.any')}
          ariaLabel={t('modelsCatalog.sidebar.contextMinAria')}
          onChange={(code) => pickOne('ctx', code === 'all' ? null : code)}
        />
      </Group>

      {tags.length > 0 && (
        <Group
          id="tag"
          title={t('modelsCatalog.sidebar.capabilities')}
          collapsed={collapsed}
          onToggle={toggleCollapse}
          hasSelection={selected.some((k) => k.startsWith('tag:'))}
          onClear={() => clearDim('tag')}
        >
          <TagDropdown
            tags={tags}
            selected={selected}
            isZh={isZh}
            onToggle={(code) => toggle(`tag:${code}`)}
            placeholder={t('modelsCatalog.sidebar.selectTags')}
            emptyLabel={t('modelsCatalog.sidebar.allTagsSelected')}
          />
        </Group>
      )}

      <Group
        id="price"
        title={t('modelsCatalog.sidebar.pricing')}
        collapsed={collapsed}
        onToggle={toggleCollapse}
        hasSelection={Boolean(priceActive)}
        onClear={() => clearDim('price')}
      >
        <div className="mg-side-list">
          {(['free', 'paid'] as const).map((c) => (
            <Row
              key={c}
              active={priceActive === c}
              label={t(`modelsCatalog.sidebar.${c}`)}
              onClick={() => pickOne('price', priceActive === c ? null : c)}
            />
          ))}
        </div>
      </Group>
    </aside>
  )
}

/** 竖向列表行：图标 + 名称在左，选中勾在右（#872 需求点 2，原型 marketplace-filter-item-check）。 */
function Row({
  active, label, icon, onClick,
}: { active: boolean; label: string; icon?: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className={`mg-side-row ${active ? 'is-active' : ''}`} onClick={onClick}>
      {icon && <span className="mg-side-row-icon" aria-hidden>{icon}</span>}
      <span className="truncate">{label}</span>
      {active && <LuCheck size={14} strokeWidth={2.25} className="mg-side-row-check" aria-hidden />}
    </button>
  )
}

function Group({
  id, title, collapsed, onToggle, hasSelection, onClear, children,
}: {
  id: string
  title: string
  collapsed: Set<string>
  onToggle: (k: string) => void
  hasSelection?: boolean
  onClear?: () => void
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const isCollapsed = collapsed.has(id)
  return (
    <div className="mg-side-group">
      <div className="mg-side-head-row">
        <button type="button" className="mg-side-head" onClick={() => onToggle(id)} aria-expanded={!isCollapsed}>
          <span>{title}</span>
          <LuChevronDown size={15} className={`mg-side-head-chevron ${isCollapsed ? '-rotate-90' : ''}`} />
        </button>
        {hasSelection && onClear && (
          <button
            type="button"
            className="mg-side-clear"
            title={t('modelsCatalog.sidebar.clearGroup', { group: title })}
            aria-label={t('modelsCatalog.sidebar.clearGroup', { group: title })}
            onClick={onClear}
          >
            <LuRotateCcw size={12} strokeWidth={1.9} aria-hidden />
          </button>
        )}
      </div>
      {!isCollapsed && children}
    </div>
  )
}

/**
 * 上下文长度分档滑杆（#872 需求点 8，原型 marketplace-context-range）。
 * 原生 range 按档位下标取值，档位见 CONTEXT_SLIDER_STOPS；语义是「不低于该档」。
 */
function ContextRange({
  value, anyLabel, ariaLabel, onChange,
}: { value?: string; anyLabel: string; ariaLabel: string; onChange: (code: string) => void }) {
  const stops = CONTEXT_SLIDER_STOPS
  const selectedIndex = Math.max(0, stops.findIndex((s) => s.code === (value ?? 'all')))
  const labelOf = (index: number) => (index === 0 ? anyLabel : stops[index].label)
  return (
    <div className="mg-side-ctx-range">
      <div className="mg-side-ctx-track" aria-hidden>
        {stops.map((s, i) => <span key={s.code} className={i <= selectedIndex ? 'is-passed' : ''} />)}
      </div>
      <input
        type="range"
        min={0}
        max={stops.length - 1}
        step={1}
        value={selectedIndex}
        aria-label={ariaLabel}
        aria-valuetext={labelOf(selectedIndex)}
        onChange={(e) => onChange(stops[Number(e.target.value)].code)}
      />
      <div className="mg-side-ctx-labels" aria-hidden>
        {stops.map((s, i) => (
          <span key={s.code} className={i === selectedIndex ? 'is-active' : ''}>{labelOf(i)}</span>
        ))}
      </div>
    </div>
  )
}

/**
 * 能力标签筛选（对齐原型 marketplace-tag-select）：下拉多选组合框，非常驻展开的
 * chip 网格——已选标签以可移除 chip 显示在收起态的 summary 里，点开菜单选剩余项。
 * 用原生 <details>/<summary>，天然有点外自动收起，不用另写 outside-click 监听。
 */
function TagDropdown({
  tags, selected, isZh, onToggle, placeholder, emptyLabel,
}: {
  tags: CatalogModelTag[]
  selected: string[]
  isZh: boolean
  onToggle: (code: string) => void
  placeholder: string
  emptyLabel: string
}) {
  const selectedTags = tags.filter((tg) => selected.includes(`tag:${tg.code}`))
  const remainingTags = tags.filter((tg) => !selected.includes(`tag:${tg.code}`))
  const label = (tg: CatalogModelTag) => (isZh ? tg.name_zh : tg.name_en)
  const { t } = useTranslation()

  return (
    <details className="mg-side-tag-select">
      <summary>
        <span className="mg-side-tag-chips">
          {selectedTags.length === 0 ? (
            <em className="mg-side-tag-placeholder">{placeholder}</em>
          ) : (
            selectedTags.map((tg) => (
              <span className="mg-side-tag-chip" key={tg.code}>
                {label(tg)}
                <button
                  type="button"
                  aria-label={t('modelsCatalog.sidebar.removeTag', { tag: label(tg) })}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(tg.code) }}
                >
                  <LuX size={11} />
                </button>
              </span>
            ))
          )}
        </span>
        <LuChevronDown size={13} />
      </summary>
      <div className="mg-side-tag-menu" aria-label={t('modelsCatalog.sidebar.capabilities')}>
        {remainingTags.length === 0 ? (
          <span className="mg-side-tag-menu-empty">{emptyLabel}</span>
        ) : (
          remainingTags.map((tg) => (
            <button type="button" key={tg.code} className="mg-side-tag-option" onClick={() => onToggle(tg.code)}>
              <span>{label(tg)}</span>
            </button>
          ))
        )}
      </div>
    </details>
  )
}
