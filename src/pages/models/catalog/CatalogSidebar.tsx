/**
 * 左侧筛选栏（对齐设计稿）：
 * 模型系列(family，竖向列表，单选) / 功能标签(tags，chip，多选) /
 * 上下文长度(单选) / 价格类型(单选)。分组标题可折叠，超长分组「展开更多」。
 * 选中态全部写在父级的 selected: string[]，key 形如 "dim:code"。
 */
import { useState } from 'react'
import { LuBoxes, LuTag, LuRuler, LuCircleDollarSign, LuChevronDown } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { resolveVendorBrand } from '@/features/models/components/vendor-icons'
import type { CatalogModelTag } from '@/types'
import type { CatalogModelFamily } from '@/interfaces/catalog'

const CTX_CHIPS = [
  { code: '8k', label: '>8K' }, { code: '32k', label: '>32K' }, { code: '128k', label: '>128K' },
  { code: '256k', label: '>256K' }, { code: '1m', label: '>1M' },
]
const PRICE_CHIPS = [
  { code: 'free', zh: '免费', en: 'Free' }, { code: 'paid', zh: '付费', en: 'Paid' },
]
const FAMILY_PREVIEW = 7
const TAG_PREVIEW = 8

interface Props {
  families: CatalogModelFamily[]
  tags: CatalogModelTag[]
  selected: string[]
  setSelected: React.Dispatch<React.SetStateAction<string[]>>
  isZh: boolean
}

export function CatalogSidebar({ families, tags, selected, setSelected, isZh }: Props) {
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

  const familyActive = selected.find((k) => k.startsWith('family:'))?.split(':')[1]
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
      <Group id="family" icon={LuBoxes} title={isZh ? '模型系列' : 'Model Family'} collapsed={collapsed} onToggle={toggleCollapse}>
        <div className="mg-side-list">
          <button type="button" className={`mg-side-row ${!familyActive ? 'is-active' : ''}`} onClick={() => pickOne('family', null)}>
            {isZh ? '全部系列' : 'All families'}
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
              {showAllFamilies ? (isZh ? '收起' : 'Less') : (isZh ? '展开更多' : 'More')}
              <LuChevronDown size={13} className={showAllFamilies ? 'rotate-180' : ''} />
            </button>
          )}
        </div>
      </Group>

      {tags.length > 0 && (
        <Group id="tags" icon={LuTag} title={isZh ? '功能标签' : 'Tags'} collapsed={collapsed} onToggle={toggleCollapse}>
          <div className="mg-side-chips">
            {shownTags.map((tg) => (
              <Chip key={tg.code} active={has(`tag:${tg.code}`)} onClick={() => toggle(`tag:${tg.code}`)}>
                {isZh ? tg.name_zh : tg.name_en}
              </Chip>
            ))}
            {tags.length > TAG_PREVIEW && (
              <button type="button" className="mg-side-more" onClick={() => setShowAllTags((v) => !v)}>
                {showAllTags ? (isZh ? '收起' : 'Less') : (isZh ? '展开更多' : 'More')}
                <LuChevronDown size={13} className={showAllTags ? 'rotate-180' : ''} />
              </button>
            )}
          </div>
        </Group>
      )}

      <Group id="ctx" icon={LuRuler} title={isZh ? '上下文长度' : 'Context'} collapsed={collapsed} onToggle={toggleCollapse}>
        <div className="mg-side-chips">
          <Chip active={!ctxActive} onClick={() => pickOne('ctx', null)}>{isZh ? '全部' : 'All'}</Chip>
          {CTX_CHIPS.map((c) => (
            <Chip key={c.code} active={ctxActive === c.code} onClick={() => pickOne('ctx', ctxActive === c.code ? null : c.code)}>
              {c.label}
            </Chip>
          ))}
        </div>
      </Group>

      <Group id="price" icon={LuCircleDollarSign} title={isZh ? '价格类型' : 'Pricing'} collapsed={collapsed} onToggle={toggleCollapse}>
        <div className="mg-side-chips">
          <Chip active={!priceActive} onClick={() => pickOne('price', null)}>{isZh ? '全部' : 'All'}</Chip>
          {PRICE_CHIPS.map((c) => (
            <Chip key={c.code} active={priceActive === c.code} onClick={() => pickOne('price', priceActive === c.code ? null : c.code)}>
              {isZh ? c.zh : c.en}
            </Chip>
          ))}
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
