/**
 * 模型广场顶部：三张数据卡（玻璃质感背景图）+ 热门模型横排。
 * 数字：已接入模型取真实数量，官方供应商取去重厂商数，可用率为品牌静态文案。
 * 热门：按 providers_count + 标签数的热度启发式取前 8，点击写入搜索框。
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { LuFlame, LuShieldCheck, LuRefreshCw, LuGlobe } from 'react-icons/lu'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { resolveVendorBrand } from '@/features/models/components/vendor-icons'
import { prettyModelName } from '@/lib/utils'
import type { CatalogModelItem } from '@/types'

interface Props {
  models: CatalogModelItem[]
  onPickHot: (name: string) => void
}

export function CatalogHero({ models, onPickHot }: Props) {
  const { t } = useTranslation()
  // 去重厂商（能解析到品牌图标的）——既给「官方供应商」数，也给图标排
  const vendors = useMemo(() => {
    const seen = new Map<string, string>()
    for (const m of models) {
      const v = [m.vendor, m.provider].find((x) => x && resolveVendorBrand(x))
      if (v) {
        const key = String(resolveVendorBrand(v))
        if (!seen.has(key)) seen.set(key, v)
      }
    }
    return [...seen.values()]
  }, [models])

  const hot = useMemo(
    () =>
      models
        // 只取能识别到厂商品牌的真实模型，过滤 Web Fetch/Web Search 这类工具条目
        .filter((m) => resolveVendorBrand(m.vendor) || resolveVendorBrand(m.provider))
        .sort((a, b) => (b.providers_count ?? 0) + (b.tags?.length ?? 0) - ((a.providers_count ?? 0) + (a.tags?.length ?? 0)))
        .slice(0, 8),
    [models],
  )

  return (
    <div className="catalog-hero">
      <div className="catalog-hero-grid">
        <StatCard
          variant="models"
          value={String(models.length)}
          label={t('modelsCatalog.heroStats.models')}
          sub={t('modelsCatalog.heroStats.modelsSub')}
        >
          <div className="catalog-hero-pills">
            {vendors.slice(0, 3).map((v) => (
              <span key={v} className="catalog-hero-pill">
                <ModelIcon model={{ display_name: v, vendor: v }} size={16} rounded="rounded-sm" />
                {v}
              </span>
            ))}
            {vendors.length > 3 && <span className="catalog-hero-pill catalog-hero-pill--more">···</span>}
          </div>
        </StatCard>

        <StatCard
          variant="providers"
          value={`${vendors.length}+`}
          label={t('modelsCatalog.heroStats.providers')}
          sub={t('modelsCatalog.heroStats.providersSub')}
        >
          <div className="catalog-hero-icons">
            {vendors.slice(0, 5).map((v) => (
              <span key={v} className="catalog-hero-icon">
                <ModelIcon model={{ display_name: v, vendor: v }} size={20} rounded="rounded-md" />
              </span>
            ))}
          </div>
        </StatCard>

        <StatCard
          variant="uptime"
          value="99.95%"
          label={t('modelsCatalog.heroStats.uptime')}
          sub={t('modelsCatalog.heroStats.uptimeSub')}
        >
          <div className="catalog-hero-tags">
            <span className="catalog-hero-tag"><LuShieldCheck size={12} />{t('modelsCatalog.heroStats.sla')}</span>
            <span className="catalog-hero-tag"><LuRefreshCw size={12} />{t('modelsCatalog.heroStats.failover')}</span>
            <span className="catalog-hero-tag"><LuGlobe size={12} />{t('modelsCatalog.heroStats.multiRegion')}</span>
          </div>
        </StatCard>
      </div>

      {hot.length > 0 && (
        <div className="catalog-hot-row">
          <span className="catalog-hot-label"><LuFlame size={14} />{t('modelsCatalog.heroStats.trending')}</span>
          <div className="catalog-hot-chips">
            {hot.map((m) => {
              const name = prettyModelName(m.display_name, m.model_id)
              return (
                <button key={m.id} type="button" className="catalog-hot-chip" onClick={() => onPickHot(name)}>
                  {name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  variant, value, label, sub, children,
}: { variant: string; value: string; label: string; sub: string; children: React.ReactNode }) {
  return (
    <div className={`catalog-hero-stat catalog-hero-stat--${variant}`}>
      <div className="catalog-hero-stat-mask" aria-hidden />
      <div className="catalog-hero-stat-body">
        <span className="catalog-hero-value">{value}</span>
        <span className="catalog-hero-stat-label">{label}</span>
        <span className="catalog-hero-stat-sub">{sub}</span>
        <div className="catalog-hero-stat-foot">{children}</div>
      </div>
    </div>
  )
}
