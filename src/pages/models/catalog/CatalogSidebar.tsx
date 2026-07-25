/**
 * 左侧筛选栏（对齐 PRD 原型 marketplaceFilterGroups）。
 *
 * 分组顺序与命名严格照原型：折扣开关(顶部) → 模型厂商 → 模型类型 → API 协议 →
 * 能力标签 → 上下文长度 → 价格。
 *
 * ⚠️ 第一组是**模型厂商(vendor)**，不是模型系列(family) —— 两者是不同维度：
 * vendor 是原厂商（openai / anthropic / deepseek），family 是模型族代号
 * （glm / seed / claude）。原型筛的是厂商，所以这里改用 facets.vendors 驱动，
 * 不再用 model-families 字典。
 *
 * 所有筛选由服务端执行；每项计数来自 facets，且每个维度的计数已排除该维度自身的
 * 条件 —— 否则选中一个选项会让同组其它选项全变 0、侧栏成为死路。
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuChevronDown } from 'react-icons/lu'
import type { CatalogModelTag, CatalogFacets, CatalogFacetBucket } from '@/types'

const VENDOR_PREVIEW = 6
const TAG_PREVIEW = 8

/** 厂商展示名。后端下发小写标识，原型展示品牌写法。 */
const VENDOR_LABEL: Record<string, string> = {
  openai: 'OpenAI', anthropic: 'Anthropic', deepseek: 'DeepSeek', moonshot: 'Moonshot',
  zhipu: 'Z.ai', minimax: 'MiniMax', qwen: 'Qwen', volcengine: '火山方舟',
  mistralai: 'Mistral AI', google: 'Google', meta: 'Meta', bytedance: 'ByteDance',
  xai: 'xAI', baidu: '百度', tencent: '腾讯', hunyuan: '混元',
}
function vendorLabel(code: string): string {
  return VENDOR_LABEL[code.toLowerCase()] || code.charAt(0).toUpperCase() + code.slice(1)
}

const MODALITY_LABEL_ZH: Record<string, string> = { text: '对话', image: '图像', audio: '音频', video: '视频' }
const MODALITY_LABEL_EN: Record<string, string> = { text: 'Chat', image: 'Image', audio: 'Audio', video: 'Video' }
const PROTOCOL_LABEL: Record<string, string> = { openai: 'OpenAI', anthropic: 'Anthropic' }

/** token 数 → 展示标签（1048576 → >1M）。阈值由服务端 facets 下发。 */
function contextBucketLabel(tokens: string): string {
  const n = Number(tokens)
  if (!Number.isFinite(n) || n <= 0) return tokens
  if (n >= 1_000_000) return `>${Math.round(n / 1_048_576)}M`
  return `>${Math.round(n / 1000)}K`
}

interface Props {
  tags: CatalogModelTag[]
  selected: string[]
  setSelected: React.Dispatch<React.SetStateAction<string[]>>
  isZh: boolean
  facets?: CatalogFacets
}

export function CatalogSidebar({ tags, selected, setSelected, isZh, facets }: Props) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [showAllVendors, setShowAllVendors] = useState(false)
  const [showAllTags, setShowAllTags] = useState(false)

  const has = (k: string) => selected.includes(k)
  const pickOne = (dim: string, code: string | null) =>
    setSelected((prev) => [...prev.filter((k) => !k.startsWith(`${dim}:`)), ...(code ? [`${dim}:${code}`] : [])])
  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

  const vendorActive = selected.find((k) => k.startsWith('vendor:'))?.split(':')[1]
  const modalityActive = selected.find((k) => k.startsWith('modality:'))?.split(':')[1]
  const protocolActive = selected.find((k) => k.startsWith('protocol:'))?.split(':')[1]
  const ctxActive = selected.find((k) => k.startsWith('ctx:'))?.split(':')[1]
  const priceActive = selected.find((k) => k.startsWith('price:'))?.split(':')[1]
  const promoActive = selected.includes('promo:1')

  const countOf = (buckets: CatalogFacetBucket[] | undefined, value: string) =>
    buckets?.find((b) => b.value === value)?.count

  const vendors = facets?.vendors ?? []
  const shownVendors = showAllVendors ? vendors : vendors.slice(0, VENDOR_PREVIEW)
  const shownTags = showAllTags ? tags : tags.slice(0, TAG_PREVIEW)
  const total = facets?.total

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
          {isZh ? '折扣' : 'Offers'} <i>({facets?.promo_count ?? 0})</i>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={promoActive}
          aria-label={isZh ? '只看折扣模型' : 'Only discounted models'}
          className={`mg-side-switch${promoActive ? ' is-on' : ''}`}
          onClick={() => toggle('promo:1')}
        >
          <span aria-hidden />
        </button>
      </div>

      <Group id="vendor" title={isZh ? '模型厂商' : 'Provider'} collapsed={collapsed} onToggle={toggleCollapse}>
        <div className="mg-side-list">
          <Row active={!vendorActive} label={t('modelsCatalog.sidebar.all')} count={total} onClick={() => pickOne('vendor', null)} />
          {/* 原型的厂商行是纯文本，不带品牌图标 */}
          {shownVendors.map((v) => (
            <Row
              key={v.value}
              active={vendorActive === v.value}
              label={vendorLabel(v.value)}
              count={v.count}
              onClick={() => pickOne('vendor', vendorActive === v.value ? null : v.value)}
            />
          ))}
          {vendors.length > VENDOR_PREVIEW && (
            <button type="button" className="mg-side-more" onClick={() => setShowAllVendors((x) => !x)}>
              {showAllVendors ? t('modelsCatalog.sidebar.less') : t('modelsCatalog.sidebar.more')}
              <LuChevronDown size={13} className={showAllVendors ? 'rotate-180' : ''} />
            </button>
          )}
        </div>
      </Group>

      <Group id="modality" title={isZh ? '模型类型' : 'Modality'} collapsed={collapsed} onToggle={toggleCollapse}>
        <div className="mg-side-list">
          <Row active={!modalityActive} label={t('modelsCatalog.sidebar.all')} count={total} onClick={() => pickOne('modality', null)} />
          {(facets?.modalities ?? []).map((m) => (
            <Row
              key={m.value}
              active={modalityActive === m.value}
              label={(isZh ? MODALITY_LABEL_ZH : MODALITY_LABEL_EN)[m.value] || m.value}
              count={m.count}
              onClick={() => pickOne('modality', modalityActive === m.value ? null : m.value)}
            />
          ))}
        </div>
      </Group>

      <Group id="protocol" title={isZh ? 'API 协议' : 'API protocol'} collapsed={collapsed} onToggle={toggleCollapse}>
        <div className="mg-side-list">
          <Row active={!protocolActive} label={t('modelsCatalog.sidebar.all')} count={total} onClick={() => pickOne('protocol', null)} />
          {(['openai', 'anthropic', 'other'] as const).map((p) => (
            <Row
              key={p}
              active={protocolActive === p}
              label={p === 'other' ? (isZh ? '其他协议' : 'Other') : PROTOCOL_LABEL[p]}
              count={countOf(facets?.protocols, p)}
              onClick={() => pickOne('protocol', protocolActive === p ? null : p)}
            />
          ))}
        </div>
      </Group>

      {tags.length > 0 && (
        <Group id="capability" title={isZh ? '能力标签' : 'Capabilities'} collapsed={collapsed} onToggle={toggleCollapse}>
          <div className="mg-side-chips">
            {shownTags.map((tg) => (
              <Chip key={tg.code} active={has(`tag:${tg.code}`)} onClick={() => toggle(`tag:${tg.code}`)}>
                {isZh ? tg.name_zh : tg.name_en}
                <Count n={countOf(facets?.capabilities, tg.code)} />
              </Chip>
            ))}
            {tags.length > TAG_PREVIEW && (
              <button type="button" className="mg-side-more" onClick={() => setShowAllTags((x) => !x)}>
                {showAllTags ? t('modelsCatalog.sidebar.less') : t('modelsCatalog.sidebar.more')}
                <LuChevronDown size={13} className={showAllTags ? 'rotate-180' : ''} />
              </button>
            )}
          </div>
        </Group>
      )}

      <Group id="ctx" title={isZh ? '上下文长度' : 'Context'} collapsed={collapsed} onToggle={toggleCollapse}>
        <div className="mg-side-chips">
          <Chip active={!ctxActive} onClick={() => pickOne('ctx', null)}>{t('modelsCatalog.sidebar.all')}</Chip>
          {(facets?.contexts ?? []).map((b) => (
            <Chip key={b.value} active={ctxActive === b.value} onClick={() => pickOne('ctx', ctxActive === b.value ? null : b.value)}>
              {contextBucketLabel(b.value)}
              <Count n={b.count} />
            </Chip>
          ))}
        </div>
      </Group>

      <Group id="price" title={isZh ? '价格' : 'Pricing'} collapsed={collapsed} onToggle={toggleCollapse}>
        <div className="mg-side-chips">
          <Chip active={!priceActive} onClick={() => pickOne('price', null)}>{t('modelsCatalog.sidebar.all')}</Chip>
          {(['free', 'paid'] as const).map((c) => (
            <Chip key={c} active={priceActive === c} onClick={() => pickOne('price', priceActive === c ? null : c)}>
              {t(`modelsCatalog.sidebar.${c}`)}
              <Count n={countOf(facets?.prices, c)} />
            </Chip>
          ))}
        </div>
      </Group>
    </aside>
  )
}

/** 竖向列表行：名称在左、计数右对齐（原型口径）。 */
function Row({
  active, label, count, onClick,
}: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button type="button" className={`mg-side-row ${active ? 'is-active' : ''}`} onClick={onClick}>
      <span className="truncate">{label}</span>
      {count !== undefined && <i className="mg-side-row-count">{count}</i>}
    </button>
  )
}

function Group({
  id, title, collapsed, onToggle, children,
}: { id: string; title: string; collapsed: Set<string>; onToggle: (k: string) => void; children: React.ReactNode }) {
  const isCollapsed = collapsed.has(id)
  return (
    <div className="mg-side-group">
      <button type="button" className="mg-side-head" onClick={() => onToggle(id)} aria-expanded={!isCollapsed}>
        <span>{title}</span>
        <LuChevronDown size={15} className={`mg-side-head-chevron ${isCollapsed ? '-rotate-90' : ''}`} />
      </button>
      {!isCollapsed && children}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`mg-side-chip ${active ? 'is-active' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}

/** 选项计数。undefined（facets 未加载）时不渲染 —— 显示 0 会让用户以为该选项无结果。 */
function Count({ n }: { n?: number }) {
  if (n === undefined) return null
  return <i className="mg-side-count">{n}</i>
}
