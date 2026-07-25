/**
 * 左侧筛选栏：
 * 模型系列(family，单选) / 能力标签(多选) / 上下文长度(单选) / 价格(单选) /
 * API 协议(单选) / 折扣开关。分组标题可折叠，超长分组「展开更多」。
 * 选中态全部写在父级的 selected: string[]，key 形如 "dim:code"。
 *
 * 所有筛选都由服务端执行，选项计数来自 facets 接口；每个维度的计数已排除该维度
 * 自身的条件，所以选中一个选项不会让同组其它选项归零。
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuBoxes, LuTag, LuRuler, LuCircleDollarSign, LuChevronDown, LuPlug, LuBadgePercent } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { resolveVendorBrand } from '@/features/models/components/vendor-icons'
import type { CatalogModelTag, CatalogFacets, CatalogFacetBucket } from '@/types'
import type { CatalogModelFamily } from '@/interfaces/catalog'

// 上下文阈值桶不再硬编码：由 facets 接口下发（服务端定义），否则 console 与官网
// 会对「≥128K」的口径产生分歧。
const PRICE_CHIPS = [{ code: 'free' }, { code: 'paid' }] as const
const PROTOCOL_CHIPS = [{ code: 'openai' }, { code: 'anthropic' }, { code: 'other' }] as const

/** token 数 → 展示标签（1048576 → >1M） */
function contextBucketLabel(tokens: string): string {
  const n = Number(tokens)
  if (!Number.isFinite(n) || n <= 0) return tokens
  if (n >= 1_000_000) return `>${Math.round(n / 1_048_576)}M`
  return `>${Math.round(n / 1000)}K`
}
const FAMILY_PREVIEW = 7
const TAG_PREVIEW = 8

interface Props {
  families: CatalogModelFamily[]
  tags: CatalogModelTag[]
  selected: string[]
  setSelected: React.Dispatch<React.SetStateAction<string[]>>
  isZh: boolean
  /**
   * 服务端筛选计数。每个维度的计数已排除该维度自身的条件，所以选中一个选项不会
   * 让同组其它选项归零。undefined = 尚在加载，此时不显示计数（而不是显示 0）。
   */
  facets?: CatalogFacets
}

export function CatalogSidebar({ families, tags, selected, setSelected, isZh, facets }: Props) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [showAllFamilies, setShowAllFamilies] = useState(false)
  const [showAllTags, setShowAllTags] = useState(false)

  const has = (k: string) => selected.includes(k)
  // 单选维度：替换同维度的 key（null = 清空该维度，回到「全部」）
  const pickOne = (dim: string, code: string | null) =>
    setSelected((prev) => [...prev.filter((k) => !k.startsWith(`${dim}:`)), ...(code ? [`${dim}:${code}`] : [])])
  // 多选维度：toggle
  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

  const countOf = (buckets: CatalogFacetBucket[] | undefined, value: string): number | undefined =>
    buckets?.find((b) => b.value === value)?.count

  const familyActive = selected.find((k) => k.startsWith('family:'))?.split(':')[1]
  const protocolActive = selected.find((k) => k.startsWith('protocol:'))?.split(':')[1]
  const promoActive = selected.includes('promo:1')
  const ctxActive = selected.find((k) => k.startsWith('ctx:'))?.split(':')[1]
  const priceActive = selected.find((k) => k.startsWith('price:'))?.split(':')[1]

  const shownFamilies = showAllFamilies ? families : families.slice(0, FAMILY_PREVIEW)
  const shownTags = showAllTags ? tags : tags.slice(0, TAG_PREVIEW)

  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <aside className="mg-side">
      <Group id="family" icon={LuBoxes} title={t('modelsCatalog.sidebar.family')} collapsed={collapsed} onToggle={toggleCollapse}>
        <div className="mg-side-list">
          <button type="button" className={`mg-side-row ${!familyActive ? 'is-active' : ''}`} onClick={() => pickOne('family', null)}>
            {t('modelsCatalog.sidebar.allFamilies')}
          </button>
          {shownFamilies.map((f) => {
            const label = isZh ? f.name_zh || f.code : f.name_en || f.code
            const iconVendor = [f.code, f.name_en, f.name_zh].find((v) => resolveVendorBrand(v))
            const active = familyActive === f.code
            return (
              <button key={f.code} type="button" className={`mg-side-row ${active ? 'is-active' : ''}`} onClick={() => pickOne('family', active ? null : f.code)}>
                {iconVendor && <ModelIcon model={{ display_name: label, vendor: iconVendor }} size={16} rounded="rounded-sm" />}
                <span className="truncate">{label}</span>
              </button>
            )
          })}
          {families.length > FAMILY_PREVIEW && (
            <button type="button" className="mg-side-more" onClick={() => setShowAllFamilies((v) => !v)}>
              {showAllFamilies ? t('modelsCatalog.sidebar.less') : t('modelsCatalog.sidebar.more')}
              <LuChevronDown size={13} className={showAllFamilies ? 'rotate-180' : ''} />
            </button>
          )}
        </div>
      </Group>

      {tags.length > 0 && (
        <Group id="tags" icon={LuTag} title={t('modelsCatalog.sidebar.tags')} collapsed={collapsed} onToggle={toggleCollapse}>
          <div className="mg-side-chips">
            {shownTags.map((tg) => (
              <Chip key={tg.code} active={has(`tag:${tg.code}`)} onClick={() => toggle(`tag:${tg.code}`)}>
                {isZh ? tg.name_zh : tg.name_en}
                <Count n={countOf(facets?.capabilities, tg.code)} />
              </Chip>
            ))}
            {tags.length > TAG_PREVIEW && (
              <button type="button" className="mg-side-more" onClick={() => setShowAllTags((v) => !v)}>
                {showAllTags ? t('modelsCatalog.sidebar.less') : t('modelsCatalog.sidebar.more')}
                <LuChevronDown size={13} className={showAllTags ? 'rotate-180' : ''} />
              </button>
            )}
          </div>
        </Group>
      )}

      <Group id="ctx" icon={LuRuler} title={t('modelsCatalog.sidebar.context')} collapsed={collapsed} onToggle={toggleCollapse}>
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

      <Group id="price" icon={LuCircleDollarSign} title={t('modelsCatalog.sidebar.pricing')} collapsed={collapsed} onToggle={toggleCollapse}>
        <div className="mg-side-chips">
          <Chip active={!priceActive} onClick={() => pickOne('price', null)}>{t('modelsCatalog.sidebar.all')}</Chip>
          {PRICE_CHIPS.map((c) => (
            <Chip key={c.code} active={priceActive === c.code} onClick={() => pickOne('price', priceActive === c.code ? null : c.code)}>
              {t(`modelsCatalog.sidebar.${c.code}`)}
              <Count n={countOf(facets?.prices, c.code)} />
            </Chip>
          ))}
        </div>
      </Group>

      {/* API 协议：新增维度。双协议模型在任一值下都命中。 */}
      <Group id="protocol" icon={LuPlug} title={isZh ? 'API 协议' : 'API protocol'} collapsed={collapsed} onToggle={toggleCollapse}>
        <div className="mg-side-chips">
          <Chip active={!protocolActive} onClick={() => pickOne('protocol', null)}>{t('modelsCatalog.sidebar.all')}</Chip>
          {PROTOCOL_CHIPS.map((c) => (
            <Chip key={c.code} active={protocolActive === c.code} onClick={() => pickOne('protocol', protocolActive === c.code ? null : c.code)}>
              {c.code === 'other' ? (isZh ? '其他协议' : 'Other') : c.code === 'openai' ? 'OpenAI' : 'Anthropic'}
              <Count n={countOf(facets?.protocols, c.code)} />
            </Chip>
          ))}
        </div>
      </Group>

      {/* 折扣开关：只看有生效促销的模型 */}
      <Group id="promo" icon={LuBadgePercent} title={isZh ? '优惠' : 'Offers'} collapsed={collapsed} onToggle={toggleCollapse}>
        <div className="mg-side-chips">
          <Chip active={promoActive} onClick={() => toggle('promo:1')}>
            {isZh ? '限时优惠' : 'On offer'}
            <Count n={facets?.promo_count} />
          </Chip>
        </div>
      </Group>
    </aside>
  )
}

function Group({
  id, icon: Icon, title, collapsed, onToggle, children,
}: { id: string; icon: IconType; title: string; collapsed: Set<string>; onToggle: (k: string) => void; children: React.ReactNode }) {
  const isCollapsed = collapsed.has(id)
  return (
    <div className="mg-side-group">
      <button type="button" className="mg-side-head" onClick={() => onToggle(id)} aria-expanded={!isCollapsed}>
        <Icon size={15} />
        <span>{title}</span>
        <LuChevronDown size={15} className={`mg-side-head-chevron ${isCollapsed ? '-rotate-90' : ''}`} />
      </button>
      {!isCollapsed && children}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`mg-side-chip ${active ? 'is-active' : ''}`}>
      {children}
    </button>
  )
}

/**
 * 选项计数。undefined（facets 未加载）时不渲染 —— 显示 0 会让用户以为该选项
 * 无结果。
 */
function Count({ n }: { n?: number }) {
  if (n === undefined) return null
  return <i className="mg-side-count">{n}</i>
}
