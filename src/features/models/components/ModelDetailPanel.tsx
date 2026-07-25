import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { LuCoins, LuWorkflow, LuZap, LuShieldCheck, LuActivity, LuClock, LuGlobe } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import type { CatalogModelDetail, ProviderForModel } from '@/types'
import { ModalityBadge } from './ModalityBadge'
import { ModelIcon } from './ModelIcon'
import { formatContextLength, formatModelPrice, formatNumber, prettyModelName } from '@/lib/utils'

interface ModelDetailPanelProps {
  detail: CatalogModelDetail
  /**
   * 推理供应商列表。**公开模型广场不再传** —— 公开目录不得暴露内部实例/区域/
   * 在线率，对应的 API 已从公开面下线（web-api 的 /catalog/*providers）。
   * 留空或不传时整个「供应商」Tab 不渲染。若将来把该接口挂到登录后的 authed
   * 组，把数据传进来即可恢复。
   */
  providers?: ProviderForModel[]
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
  const free = Number(detail.pricing?.input_per_1m ?? 0) === 0 && Number(detail.pricing?.output_per_1m ?? 0) === 0
  if (isZh) {
    return `${v ? v + ' 出品的' : ''}${modText}模型${ctx ? `，${ctx} 上下文窗口` : ''}${free ? '，当前免费可用' : ''}。详细简介待补充。`
  }
  return `${v ? v + ' ' : ''}${modText} model${ctx ? `, ${ctx} context window` : ''}${free ? ', currently free' : ''}. Full description coming soon.`
}

export function ModelDetailPanel({ detail, providers, vendorHint }: ModelDetailPanelProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language.startsWith('zh')
  const vendor = detail.vendor || vendorHint || ''
  const providerList = providers ?? []
  const showProviders = providerList.length > 0
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

      {/* Tabs 分栏 */}
      <Tabs defaultValue="overview" className="mt-0">
        <TabsList>
          <TabsTrigger value="overview">{t('models.detail.tabOverview')}</TabsTrigger>
          {showProviders && (
            <TabsTrigger value="providers">{t('models.detail.tabProviders')}</TabsTrigger>
          )}
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

        <TabsContent value="providers">
          <div className="pt-5 flex flex-col gap-3.5">
            {providerList.length === 0 ? (
              <div className="text-center min-h-[var(--mg-empty-min-h)] flex items-center justify-center text-[var(--mg-text-3)] mg-text-body">
                {t('models.detail.noProviders')}
              </div>
            ) : (
              providerList.map((p) => {
                const isEnabled = p.status === 'enabled'
                return (
                  <div key={p.provider_id} className="bg-card-bg border border-[var(--mg-border)] rounded-md mg-panel flex flex-col gap-3.5">
                    {/* 提供商头部：名称 + 状态点 */}
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="mg-text-body font-bold text-[var(--mg-text-1)]">
                          {p.provider_name}
                        </span>
                        {p.region && (
                          <span className="mg-text-caption text-[var(--mg-text-3)] bg-[var(--mg-fill-0)] px-1.5 py-0.5 rounded-sm">
                            {p.region}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full bg-mg-success shadow-[0_0_8px_var(--mg-success)]" style={{ width: '6px', height: '6px' }} />
                        <span className={`mg-compact-badge ${isEnabled ? 'text-mg-success' : 'text-mg-danger'}`}>
                          {isEnabled ? t('models.detail.providerEnabled') : t('models.detail.providerDisabled')}
                        </span>
                      </div>
                    </div>

                    {/* 提供商性能指标 */}
                    <div className="grid grid-cols-3 gap-3 border-t border-[var(--mg-border)] pt-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="mg-text-caption text-[var(--mg-text-3)] flex items-center gap-0.5">
                          <LuGlobe size={11} /> {t('models.detail.uptime30d')}
                        </span>
                        <span className="mg-text-body font-semibold text-[var(--mg-text-2)]">
                          {p.uptime_30d_pct ? `${p.uptime_30d_pct}` : '—'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="mg-text-caption text-[var(--mg-text-3)] flex items-center gap-0.5">
                          <LuClock size={11} /> {t('models.detail.latencyP50')}
                        </span>
                        <span className="mg-text-body font-semibold text-[var(--mg-text-2)]">
                          {p.latency_p50_ms ? `${p.latency_p50_ms}ms` : '—'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="mg-text-caption text-[var(--mg-text-3)] flex items-center gap-0.5">
                          <LuZap size={11} /> {t('models.detail.throughput')}
                        </span>
                        <span className="mg-text-body font-semibold text-[var(--mg-text-2)]">
                          {p.throughput_tps ? `${p.throughput_tps} TPS` : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
