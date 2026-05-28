import { Tabs } from '@douyinfe/semi-ui'
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 头部面板 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', borderBottom: '1px solid var(--semi-color-fill-0)', paddingBottom: '20px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '10px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid var(--semi-color-fill-0)', background: 'var(--semi-color-bg-0)' }}>
          {detail.logo_url
            ? <img src={detail.logo_url} alt={detail.vendor} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : (VENDOR_ICON[detail.vendor?.toLowerCase() ?? ''] ?? (
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'var(--semi-color-fill-0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, color: 'var(--semi-color-text-2)' }}>
                {getFallbackAvatarText(detail.vendor ?? detail.display_name)}
              </div>
            ))
          }
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: '0 0 6px 0', lineHeight: 1.2 }}>
            {detail.display_name}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {detail.vendor && (
              <span style={{ fontSize: '12px', color: 'var(--semi-color-text-2)' }}>{detail.vendor}</span>
            )}
            <div style={{ display: 'flex', gap: '4px' }}>
              {detail.modalities.map((m) => <ModalityBadge key={m} modality={m} />)}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs 分栏 */}
      <Tabs defaultActiveKey="overview" style={{ marginTop: '0' }}>
        <Tabs.TabPane tab="基本参数" itemKey="overview">
          <div style={{ paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* 描述 */}
            {detail.description && (
              <div style={{ background: 'var(--semi-color-bg-1)', borderRadius: '12px', border: '1px solid var(--semi-color-fill-0)', padding: '16px' }}>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--semi-color-text-1)', lineHeight: 1.6 }}>
                  {detail.description}
                </p>
              </div>
            )}

            {/* 计费详情 */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--semi-color-text-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <LuCoins size={14} style={{ color: 'var(--semi-color-text-2)' }} />
                <span>计费规格</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                <div style={{ background: 'var(--semi-color-bg-0)', border: '1px solid var(--semi-color-fill-0)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--semi-color-text-2)', marginBottom: '4px' }}>输入计费</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--semi-color-text-0)' }}>
                    {formatModelPrice(detail.pricing?.input_per_1m, detail.pricing?.currency)}
                  </div>
                </div>
                <div style={{ background: 'var(--semi-color-bg-0)', border: '1px solid var(--semi-color-fill-0)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--semi-color-text-2)', marginBottom: '4px' }}>输出计费</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--semi-color-text-0)' }}>
                    {formatModelPrice(detail.pricing?.output_per_1m, detail.pricing?.currency)}
                  </div>
                </div>
                {detail.pricing?.cache_read_per_1m && parseFloat(detail.pricing.cache_read_per_1m) > 0 && (
                  <div style={{ background: 'var(--semi-color-bg-0)', border: '1px solid var(--semi-color-fill-0)', borderRadius: '10px', padding: '14px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--semi-color-text-2)', marginBottom: '4px' }}>缓存读取计费</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--semi-color-text-0)' }}>
                      {formatModelPrice(detail.pricing.cache_read_per_1m, detail.pricing.currency)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 技术规格网格 */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--semi-color-text-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <LuWorkflow size={14} style={{ color: 'var(--semi-color-text-2)' }} />
                <span>技术规格</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: 'var(--semi-color-bg-0)', border: '1px solid var(--semi-color-fill-0)', borderRadius: '12px', padding: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--semi-color-text-2)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <LuWorkflow size={12} /> 上下文窗口
                  </span>
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--semi-color-text-0)' }}>
                    {formatContextLength(detail.context_length)} tokens
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--semi-color-text-2)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <LuZap size={12} /> 最大输出 Token
                  </span>
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--semi-color-text-0)' }}>
                    {detail.max_output_tokens ? `${formatNumber(detail.max_output_tokens)} tokens` : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--semi-color-text-2)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <LuShieldCheck size={12} /> 零数据保留
                  </span>
                  <div>
                    {detail.zero_data_retention ? (
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '1px 8px', borderRadius: '10px', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>支持</span>
                    ) : (
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '1px 8px', borderRadius: '10px', background: 'var(--semi-color-fill-0)', color: 'var(--semi-color-text-2)', border: '1px solid var(--semi-color-fill-1)' }}>不支持</span>
                    )}
                  </div>
                </div>
                {detail.in_region_routing !== undefined && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--semi-color-text-2)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <LuActivity size={12} /> 区域内路由
                    </span>
                    <div>
                      {detail.in_region_routing ? (
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '1px 8px', borderRadius: '10px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>支持</span>
                      ) : (
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '1px 8px', borderRadius: '10px', background: 'var(--semi-color-fill-0)', color: 'var(--semi-color-text-2)', border: '1px solid var(--semi-color-fill-1)' }}>不支持</span>
                      )}
                    </div>
                  </div>
                )}
                {detail.released_at && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--semi-color-text-2)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <LuClock size={12} /> 发布时间
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--semi-color-text-1)' }}>{detail.released_at}</span>
                  </div>
                )}
                {detail.knowledge_cutoff && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--semi-color-text-2)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <LuClock size={12} /> 知识库截止
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--semi-color-text-1)' }}>{detail.knowledge_cutoff}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Tabs.TabPane>
        <Tabs.TabPane tab="提供商与可用性" itemKey="providers">
          <div style={{ paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {providers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--semi-color-text-2)', fontSize: '13px' }}>
                当前无可用提供商
              </div>
            ) : (
              providers.map((p) => {
                const isEnabled = p.status === 'enabled'
                return (
                  <div key={p.provider_id} style={{ background: 'var(--semi-color-bg-0)', border: '1px solid var(--semi-color-fill-0)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* 提供商头部：名称 + 状态点 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--semi-color-text-0)' }}>
                          {p.provider_name}
                        </span>
                        {p.region && (
                          <span style={{ fontSize: '11px', color: 'var(--semi-color-text-2)', backgroundColor: 'var(--semi-color-fill-0)', padding: '1px 6px', borderRadius: '4px' }}>
                            {p.region}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: isEnabled ? '#10b981' : '#ef4444',
                          boxShadow: isEnabled ? '0 0 8px #10b981' : '0 0 8px #ef4444'
                        }} />
                        <span style={{ fontSize: '12px', fontWeight: 500, color: isEnabled ? '#059669' : '#dc2626' }}>
                          {isEnabled ? '已启用' : '已停用'}
                        </span>
                      </div>
                    </div>

                    {/* 提供商性能指标 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', borderTop: '1px solid var(--semi-color-fill-0)', paddingTop: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--semi-color-text-2)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                          <LuGlobe size={11} /> 30天在线率
                        </span>
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--semi-color-text-1)' }}>
                          {p.uptime_30d_pct ? `${p.uptime_30d_pct}` : '—'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--semi-color-text-2)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                          <LuClock size={11} /> P50 延迟
                        </span>
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--semi-color-text-1)' }}>
                          {p.latency_p50_ms ? `${p.latency_p50_ms}ms` : '—'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--semi-color-text-2)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                          <LuZap size={11} /> 吞吐量
                        </span>
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--semi-color-text-1)' }}>
                          {p.throughput_tps ? `${p.throughput_tps} TPS` : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </Tabs.TabPane>
      </Tabs>
    </div>
  )
}

