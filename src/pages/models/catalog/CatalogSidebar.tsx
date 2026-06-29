/**
 * 左侧筛选栏（chip 风格，参考国外官网 SharedModelFilterSidebar）
 * 维度：模态 / 模型系列(family) / 功能标签(tags) / 上下文长度。
 * 选中 key 形如 "dim:code"，由父级 index.tsx 统一过滤。
 */
import { LuBoxes, LuLayers, LuTag, LuRuler } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { resolveVendorBrand } from '@/features/models/components/vendor-icons'
import type { CatalogModelTag } from '@/types'
import type { CatalogModelFamily } from '@/interfaces/catalog'

const CTX_CHIPS = [
  { code: '8k', label: '≥8k' }, { code: '32k', label: '≥32k' }, { code: '128k', label: '≥128k' },
  { code: '256k', label: '≥256k' }, { code: '1m', label: '≥1M' },
]
const MODALITY_CHIPS = [
  { code: 'text', zh: '文本', en: 'Text' }, { code: 'image', zh: '图像', en: 'Image' },
  { code: 'audio', zh: '音频', en: 'Audio' }, { code: 'video', zh: '视频', en: 'Video' },
]

interface Props {
  families: CatalogModelFamily[]
  tags: CatalogModelTag[]
  selected: string[]
  onToggle: (key: string) => void
  isZh: boolean
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors duration-200"
      style={
        active
          ? { background: 'color-mix(in oklab, var(--brand-base) 14%, transparent)', borderColor: 'color-mix(in oklab, var(--brand-base) 50%, transparent)', color: 'var(--brand-base)' }
          : { background: 'var(--mg-bg-0)', borderColor: 'var(--mg-border)', color: 'var(--mg-text-1)' }
      }
    >
      {children}
    </button>
  )
}

function Group({ icon: Icon, title, children }: { icon: IconType; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-[13px] font-medium" style={{ color: 'var(--mg-text-1)' }}>
        <Icon size={15} />
        <span>{title}</span>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

export function CatalogSidebar({ families, tags, selected, onToggle, isZh }: Props) {
  const has = (k: string) => selected.includes(k)
  return (
    <aside className="flex flex-col gap-7">
      <Group icon={LuLayers} title={isZh ? '模态' : 'Modality'}>
        {MODALITY_CHIPS.map((c) => (
          <Chip key={c.code} active={has(`mod:${c.code}`)} onClick={() => onToggle(`mod:${c.code}`)}>
            {isZh ? c.zh : c.en}
          </Chip>
        ))}
      </Group>

      {families.length > 0 && (
        <Group icon={LuBoxes} title={isZh ? '模型系列' : 'Model Family'}>
          {families.map((f) => {
            const label = isZh ? f.name_zh || f.code : f.name_en || f.code
            // 从 code / 名称解析厂商品牌，能解析到就加小图标
            const iconVendor = [f.code, f.name_en, f.name_zh].find((v) => resolveVendorBrand(v))
            return (
              <Chip key={f.code} active={has(`family:${f.code}`)} onClick={() => onToggle(`family:${f.code}`)}>
                {iconVendor && (
                  <ModelIcon model={{ display_name: label, vendor: iconVendor }} size={14} rounded="rounded-sm" className="shrink-0" />
                )}
                {label}
              </Chip>
            )
          })}
        </Group>
      )}

      {tags.length > 0 && (
        <Group icon={LuTag} title={isZh ? '功能标签' : 'Tags'}>
          {tags.map((tg) => (
            <Chip key={tg.code} active={has(`tag:${tg.code}`)} onClick={() => onToggle(`tag:${tg.code}`)}>
              {isZh ? tg.name_zh : tg.name_en}
            </Chip>
          ))}
        </Group>
      )}

      <Group icon={LuRuler} title={isZh ? '上下文' : 'Context'}>
        {CTX_CHIPS.map((c) => (
          <Chip key={c.code} active={has(`ctx:${c.code}`)} onClick={() => onToggle(`ctx:${c.code}`)}>
            {c.label}
          </Chip>
        ))}
      </Group>
    </aside>
  )
}
