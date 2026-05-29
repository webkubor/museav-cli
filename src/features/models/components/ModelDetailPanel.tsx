import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { LuCoins, LuWorkflow, LuZap, LuShieldCheck, LuActivity, LuClock, LuGlobe } from 'react-icons/lu'
import type { CatalogModelDetail, ProviderForModel } from '@/types'
import { ModalityBadge } from './ModalityBadge'
import { VENDOR_ICON } from './vendor-icons'
import { formatContextLength, formatModelPrice, getFallbackAvatarText, formatNumber } from '@/lib/utils'

interface ModelDetailPanelProps {
  detail: CatalogModelDetail
  providers: ProviderForModel[]
}

export function ModelDetailPanel({ detail, providers }: ModelDetailPanelProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* 头部面板 */}
      <div className="flex items-start gap-4 border-b border-[var(--semi-color-border)] pb-5">
        <div className="w-12 h-12 rounded-[10px] shrink-0 flex items-center justify-center overflow-hidden border border-[var(--semi-color-border)] bg-card-bg">
          {detail.logo_url
            ? <img src={detail.logo_url} alt={detail.vendor} className="w-full h-full object-contain" />
            : (VENDOR_ICON[detail.vendor?.toLowerCase() ?? ''] ?? (
              <div className="w-12 h-12 rounded-[10px] bg-[var(--semi-color-fill-0)] flex items-center justify-center text-lg font-bold text-[var(--semi-color-text-2)]">
                {getFallbackAvatarText(detail.vendor ?? detail.display_name)}
              </div>
            ))
          }
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-bold text-[var(--semi-color-text-0)] mb-1.5 leading-tight">
            {detail.display_name}
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            {detail.vendor && (
              <span className="text-xs text-[var(--semi-color-text-2)]">{detail.vendor}</span>
            )}
            <div className="flex gap-1">
              {detail.modalities.map((m) => <ModalityBadge key={m} modality={m} />)}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs 分栏 */}
      <Tabs defaultValue="overview" className="mt-0">
        <TabsList>
          <TabsTrigger value="overview">基本参数</TabsTrigger>
          <TabsTrigger value="providers">提供商与可用性</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="pt-5 flex flex-col gap-5">
            {/* 描述 */}
            {detail.description && (
              <div className="bg-[var(--semi-color-fill-0)] rounded-xl border border-[var(--semi-color-border)] p-4">
                <p className="m-0 text-[13px] text-[var(--semi-color-text-1)] leading-relaxed">
                  {detail.description}
                </p>
              </div>
            )}

            {/* 计费详情 */}
            <div>
              <div className="text-xs font-bold text-[var(--semi-color-text-2)] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <LuCoins size={14} className="text-[var(--semi-color-text-2)]" />
                <span>计费规格</span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
                <div className="bg-card-bg border border-[var(--semi-color-border)] rounded-[10px] p-3.5">
                  <div className="text-[11px] text-[var(--semi-color-text-2)] mb-1">输入计费</div>
                  <div className="text-[15px] font-bold text-[var(--semi-color-text-0)]">
                    {formatModelPrice(detail.pricing?.input_per_1m, detail.pricing?.currency)}
                  </div>
                </div>
                <div className="bg-card-bg border border-[var(--semi-color-border)] rounded-[10px] p-3.5">
                  <div className="text-[11px] text-[var(--semi-color-text-2)] mb-1">输出计费</div>
                  <div className="text-[15px] font-bold text-[var(--semi-color-text-0)]">
                    {formatModelPrice(detail.pricing?.output_per_1m, detail.pricing?.currency)}
                  </div>
                </div>
                {detail.pricing?.cache_read_per_1m && parseFloat(detail.pricing.cache_read_per_1m) > 0 && (
                  <div className="bg-card-bg border border-[var(--semi-color-border)] rounded-[10px] p-3.5">
                    <div className="text-[11px] text-[var(--semi-color-text-2)] mb-1">缓存读取计费</div>
                    <div className="text-[15px] font-bold text-[var(--semi-color-text-0)]">
                      {formatModelPrice(detail.pricing.cache_read_per_1m, detail.pricing.currency)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 技术规格网格 */}
            <div>
              <div className="text-xs font-bold text-[var(--semi-color-text-2)] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <LuWorkflow size={14} className="text-[var(--semi-color-text-2)]" />
                <span>技术规格</span>
              </div>
              <div className="grid grid-cols-2 gap-4 bg-card-bg border border-[var(--semi-color-border)] rounded-xl p-5">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--semi-color-text-2)] flex items-center gap-1">
                    <LuWorkflow size={12} /> 上下文窗口
                  </span>
                  <span className="text-[13.5px] font-semibold text-[var(--semi-color-text-0)]">
                    {formatContextLength(detail.context_length)} tokens
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--semi-color-text-2)] flex items-center gap-1">
                    <LuZap size={12} /> 最大输出 Token
                  </span>
                  <span className="text-[13.5px] font-semibold text-[var(--semi-color-text-0)]">
                    {detail.max_output_tokens ? `${formatNumber(detail.max_output_tokens)} tokens` : '—'}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--semi-color-text-2)] flex items-center gap-1">
                    <LuShieldCheck size={12} /> 零数据保留
                  </span>
                  <div>
                    {detail.zero_data_retention ? (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-[10px] bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">支持</span>
                    ) : (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-[10px] bg-[var(--semi-color-fill-0)] text-[var(--semi-color-text-2)] border border-[var(--semi-color-border)]">不支持</span>
                    )}
                  </div>
                </div>
                {detail.in_region_routing !== undefined && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-[var(--semi-color-text-2)] flex items-center gap-1">
                      <LuActivity size={12} /> 区域内路由
                    </span>
                    <div>
                      {detail.in_region_routing ? (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-[10px] bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">支持</span>
                      ) : (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-[10px] bg-[var(--semi-color-fill-0)] text-[var(--semi-color-text-2)] border border-[var(--semi-color-border)]">不支持</span>
                      )}
                    </div>
                  </div>
                )}
                {detail.released_at && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-[var(--semi-color-text-2)] flex items-center gap-1">
                      <LuClock size={12} /> 发布时间
                    </span>
                    <span className="text-[13px] text-[var(--semi-color-text-1)]">{detail.released_at}</span>
                  </div>
                )}
                {detail.knowledge_cutoff && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-[var(--semi-color-text-2)] flex items-center gap-1">
                      <LuClock size={12} /> 知识库截止
                    </span>
                    <span className="text-[13px] text-[var(--semi-color-text-1)]">{detail.knowledge_cutoff}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="providers">
          <div className="pt-5 flex flex-col gap-3.5">
            {providers.length === 0 ? (
              <div className="text-center py-10 text-[var(--semi-color-text-2)] text-[13px]">
                当前无可用提供商
              </div>
            ) : (
              providers.map((p) => {
                const isEnabled = p.status === 'enabled'
                return (
                  <div key={p.provider_id} className="bg-card-bg border border-[var(--semi-color-border)] rounded-xl p-4 flex flex-col gap-3.5">
                    {/* 提供商头部：名称 + 状态点 */}
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-bold text-[var(--semi-color-text-0)]">
                          {p.provider_name}
                        </span>
                        {p.region && (
                          <span className="text-[11px] text-[var(--semi-color-text-2)] bg-[var(--semi-color-fill-0)] px-1.5 py-0.5 rounded">
                            {p.region}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" style={{ width: '6px', height: '6px' }} />
                        <span className={`text-xs font-semibold ${isEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {isEnabled ? '已启用' : '已停用'}
                        </span>
                      </div>
                    </div>

                    {/* 提供商性能指标 */}
                    <div className="grid grid-cols-3 gap-3 border-t border-[var(--semi-color-border)] pt-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-[var(--semi-color-text-2)] flex items-center gap-0.5">
                          <LuGlobe size={11} /> 30天在线率
                        </span>
                        <span className="text-[12.5px] font-semibold text-[var(--semi-color-text-1)]">
                          {p.uptime_30d_pct ? `${p.uptime_30d_pct}` : '—'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-[var(--semi-color-text-2)] flex items-center gap-0.5">
                          <LuClock size={11} /> P50 延迟
                        </span>
                        <span className="text-[12.5px] font-semibold text-[var(--semi-color-text-1)]">
                          {p.latency_p50_ms ? `${p.latency_p50_ms}ms` : '—'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-[var(--semi-color-text-2)] flex items-center gap-0.5">
                          <LuZap size={11} /> 吞量
                        </span>
                        <span className="text-[12.5px] font-semibold text-[var(--semi-color-text-1)]">
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
