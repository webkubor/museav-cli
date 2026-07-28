import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { LuCoins, LuWorkflow, LuZap, LuShieldCheck, LuActivity, LuClock } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import type { CatalogModelDetail } from '@/types'
import { ModalityBadge } from './ModalityBadge'
import { ModelIcon } from './ModelIcon'
import { formatContextLength, formatModelPrice, formatNumber, prettyModelName } from '@/lib/utils'

interface ModelDetailPanelProps {
  detail: CatalogModelDetail
  vendorHint?: string
}

const MOD_LABEL: Record<string, string> = { text: '文本', image: '图像', audio: '音频', video: '视频' }
const MOD_LABEL_EN: Record<string, string> = { text: 'text', image: 'image', audio: 'audio', video: 'video' }

/** description 为空时，用真实字段拼一句事实性简介（不杜撰能力） */
function autoSummary(detail: CatalogModelDetail, isZh: boolean): string {
  const v = detail.vendor || ''
  const mods = (detail.modalities ?? []).filter((m) => m in MOD_LABEL)
  const modText = mods.length ? mods.map((m) => (isZh ? MOD_LABEL[m] : MOD_LABEL_EN[m])).join(isZh ? '/' : ', ') : (isZh ? '通用' : 'general')
  const ctx = detail.context_length ? formatContextLength(detail.context_length) : ''
  // 限免只认服务端的显式标记；「价格为 0」也会命中尚未配价的模型。
  const free = Boolean(detail.promotion?.free)
  if (isZh) {
    return `${v ? v + ' 出品的' : ''}${modText}模型${ctx ? `，${ctx} 上下文窗口` : ''}${free ? '，当前免费可用' : ''}。详细简介待补充。`
  }
  return `${v ? v + ' ' : ''}${modText} model${ctx ? `, ${ctx} context window` : ''}${free ? ', currently free' : ''}. Full description coming soon.`
}

export function ModelDetailPanel({ detail, vendorHint }: ModelDetailPanelProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language.startsWith('zh')
  const vendor = detail.vendor || vendorHint || ''
  return (
    <div className="flex flex-col gap-5">
      {/* 头部面板 */}
      <div className="flex items-start gap-4 border-b border-[var(--mg-border)] pb-5">
        <ModelIcon
          model={{ logo_url: detail.logo_url, vendor, display_name: detail.display_name }}
          size={48}
          rounded="rounded-sm"
          className="border border-[var(--mg-border)] bg-card-bg"
        />
        <div className="min-w-0 flex-1">
          <h2 className="mg-text-title-sm font-bold text-[var(--mg-text-1)] mb-1.5">
            {prettyModelName(detail.display_name, detail.model_id)}
          </h2>
          {detail.model_id && (
            <code className="mg-text-code text-[var(--mg-text-3)] bg-[var(--mg-fill-0)] px-1.5 py-0.5 rounded-sm mb-1 inline-block">
              {detail.model_id}
            </code>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {vendor && (
              <span className="mg-text-caption text-[var(--mg-text-3)]">{vendor}</span>
            )}
            <div className="flex gap-1">
              {detail.modalities.map((m) => <ModalityBadge key={m} modality={m} />)}
            </div>
            {detail.tags?.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {detail.tags.map((tag) => (
                  <span key={tag} className="mg-compact-badge px-1.5 py-0.5 rounded-sm bg-[var(--mg-fill-0)] text-[var(--mg-text-3)] border border-[var(--mg-border)]">{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs 分栏（公开模型广场不下发供应商信息，见 PRD §9.2，故只有一个 Tab） */}
      <Tabs defaultValue="overview" className="mt-0">
        <TabsList>
          <TabsTrigger value="overview">{t('models.detail.tabOverview')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="pt-5 flex flex-col gap-5">
            {/* 描述（无则用真实字段拼事实性简介兜底，避免空白） */}
            <div className="bg-[var(--mg-fill-0)] rounded-md border border-[var(--mg-border)] mg-panel">
              <p className="m-0 mg-text-body text-[var(--mg-text-2)]">
                {detail.description?.trim() || autoSummary(detail, isZh)}
              </p>
            </div>

            {/* 计费详情 */}
            <div>
              <div className="mg-text-label text-[var(--mg-text-3)] mb-2.5 flex items-center gap-1.5">
                <LuCoins size={14} className="text-[var(--mg-text-3)]" />
                <span>{t('models.detail.pricing')}</span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
                <div className="bg-card-bg border border-[var(--mg-border)] rounded-sm mg-panel-tight">
                  <div className="mg-text-caption text-[var(--mg-text-3)] mb-1">{t('models.detail.pricingInput')}</div>
                  <div className="mg-text-value font-bold text-[var(--mg-text-1)]">
                    {formatModelPrice(detail.pricing?.input_per_1m, detail.pricing?.currency)}
                  </div>
                </div>
                <div className="bg-card-bg border border-[var(--mg-border)] rounded-sm mg-panel-tight">
                  <div className="mg-text-caption text-[var(--mg-text-3)] mb-1">{t('models.detail.pricingOutput')}</div>
                  <div className="mg-text-value font-bold text-[var(--mg-text-1)]">
                    {formatModelPrice(detail.pricing?.output_per_1m, detail.pricing?.currency)}
                  </div>
                </div>
                {detail.pricing?.cache_read_per_1m && parseFloat(detail.pricing.cache_read_per_1m) > 0 && (
                  <div className="bg-card-bg border border-[var(--mg-border)] rounded-sm mg-panel-tight">
                    <div className="mg-text-caption text-[var(--mg-text-3)] mb-1">{t('models.detail.pricingCacheRead')}</div>
                    <div className="mg-text-value font-bold text-[var(--mg-text-1)]">
                      {formatModelPrice(detail.pricing.cache_read_per_1m, detail.pricing.currency)}
                    </div>
                  </div>
                )}
                {/* 缓存写入（5min / 1h）。此前 catalog 读侧根本没取这两个字段，详情页
                    只能渲染破折号；现在后端下发了就补上。为 0/缺省时不渲染该格，
                    而不是显示 0 —— 未配置与真的免费是两件事。 */}
                {detail.cache_write_5m_per_1m && parseFloat(detail.cache_write_5m_per_1m) > 0 && (
                  <div className="bg-card-bg border border-[var(--mg-border)] rounded-sm mg-panel-tight">
                    <div className="mg-text-caption text-[var(--mg-text-3)] mb-1">
                      {isZh ? '缓存写入 5min' : 'Cache write 5min'}
                    </div>
                    <div className="mg-text-value font-bold text-[var(--mg-text-1)]">
                      {formatModelPrice(detail.cache_write_5m_per_1m, detail.pricing?.currency)}
                    </div>
                  </div>
                )}
                {detail.cache_write_1h_per_1m && parseFloat(detail.cache_write_1h_per_1m) > 0 && (
                  <div className="bg-card-bg border border-[var(--mg-border)] rounded-sm mg-panel-tight">
                    <div className="mg-text-caption text-[var(--mg-text-3)] mb-1">
                      {isZh ? '缓存写入 1h' : 'Cache write 1h'}
                    </div>
                    <div className="mg-text-value font-bold text-[var(--mg-text-1)]">
                      {formatModelPrice(detail.cache_write_1h_per_1m, detail.pricing?.currency)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 技术规格网格 */}
            <div>
              <div className="mg-text-label text-[var(--mg-text-3)] mb-2.5 flex items-center gap-1.5">
                <LuWorkflow size={14} className="text-[var(--mg-text-3)]" />
                <span>{t('models.detail.specs')}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 bg-card-bg border border-[var(--mg-border)] rounded-md mg-panel-relaxed">
                <div className="flex flex-col gap-1">
                  <span className="mg-text-caption text-[var(--mg-text-3)] flex items-center gap-1">
                    <LuWorkflow size={12} /> {t('models.detail.contextLength')}
                  </span>
                  <span className="mg-text-body font-semibold text-[var(--mg-text-1)]">
                    {formatContextLength(detail.context_length)} tokens
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="mg-text-caption text-[var(--mg-text-3)] flex items-center gap-1">
                    <LuZap size={12} /> {t('models.detail.maxOutputTokens')}
                  </span>
                  <span className="mg-text-body font-semibold text-[var(--mg-text-1)]">
                    {detail.max_output_tokens ? `${formatNumber(detail.max_output_tokens)} tokens` : '—'}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="mg-text-caption text-[var(--mg-text-3)] flex items-center gap-1">
                    <LuShieldCheck size={12} /> {t('models.detail.zeroDataRetention')}
                  </span>
                  <div>
                    {detail.zero_data_retention ? (
                      <span className="mg-compact-badge px-2 py-0.5 rounded-sm bg-mg-success/10 text-mg-success border border-mg-success/20">{t('models.detail.supported')}</span>
                    ) : (
                      <span className="mg-compact-badge px-2 py-0.5 rounded-sm bg-[var(--mg-fill-0)] text-[var(--mg-text-3)] border border-[var(--mg-border)]">{t('models.detail.notSupported')}</span>
                    )}
                  </div>
                </div>
                {detail.in_region_routing !== undefined && (
                  <div className="flex flex-col gap-1">
                    <span className="mg-text-caption text-[var(--mg-text-3)] flex items-center gap-1">
                      <LuActivity size={12} /> {t('models.detail.inRegionRouting')}
                    </span>
                    <div>
                      {detail.in_region_routing ? (
                        <span className="mg-compact-badge px-2 py-0.5 rounded-sm bg-blue-500/10 text-blue-600 border border-blue-500/20">{t('models.detail.supported')}</span>
                      ) : (
                        <span className="mg-compact-badge px-2 py-0.5 rounded-sm bg-[var(--mg-fill-0)] text-[var(--mg-text-3)] border border-[var(--mg-border)]">{t('models.detail.notSupported')}</span>
                      )}
                    </div>
                  </div>
                )}
                {detail.released_at && (
                  <div className="flex flex-col gap-1">
                    <span className="mg-text-caption text-[var(--mg-text-3)] flex items-center gap-1">
                      <LuClock size={12} /> {t('models.detail.releasedAt')}
                    </span>
                    <span className="mg-text-body text-[var(--mg-text-2)]">{detail.released_at}</span>
                  </div>
                )}
                {detail.knowledge_cutoff && (
                  <div className="flex flex-col gap-1">
                    <span className="mg-text-caption text-[var(--mg-text-3)] flex items-center gap-1">
                      <LuClock size={12} /> {t('models.detail.knowledgeCutoff')}
                    </span>
                    <span className="mg-text-body text-[var(--mg-text-2)]">{detail.knowledge_cutoff}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  )
}
