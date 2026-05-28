import { Spin, Input, Typography, SideSheet } from '@douyinfe/semi-ui'
import { LuSearch } from 'react-icons/lu'
import { useModels } from '@/features/models/hooks/useModels'
import { ModelCard } from '@/features/models/components/ModelCard'
import { ModelDetailPanel } from '@/features/models/components/ModelDetailPanel'

const { Text } = Typography

export default function ModelsPage() {
  const {
    search,
    setSearch,
    activeTag,
    setActiveTag,
    selectedId,
    setSelectedId,
    modelsQuery,
    detailQuery,
    providersQuery,
    filteredModels,
    tags,
  } = useModels()

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
          模型目录
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: 0 }}>
          浏览 ModelGo 支持的全部模型，查看上下文长度、价格与可用模态。
        </p>
      </div>

      {/* 搜索栏 */}
      <Input
        placeholder="搜索模型名称、供应商或 ID"
        prefix={<LuSearch style={{ color: 'var(--semi-color-text-2)' }} />}
        value={search}
        onChange={(v) => setSearch(v)}
        style={{ width: '320px', borderRadius: '9999px', border: '1px solid var(--semi-color-border)', marginBottom: '20px' }}
      />

      {/* 标签筛选 */}
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '28px' }}>
          <button
            onClick={() => setActiveTag(null)}
            style={{
              padding: '4px 14px',
              borderRadius: '9999px',
              border: `1px solid ${!activeTag ? 'var(--semi-color-text-0)' : 'var(--semi-color-border)'}`,
              background: !activeTag ? 'var(--semi-color-text-0)' : 'transparent',
              color: !activeTag ? 'var(--semi-color-bg-0)' : 'var(--semi-color-text-1)',
              fontSize: '12.5px',
              fontWeight: !activeTag ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            全部
          </button>
          {tags.filter((t) => t.enabled).sort((a, b) => a.sort_order - b.sort_order).map((tag) => (
            <button
              key={tag.code}
              onClick={() => setActiveTag(activeTag === tag.code ? null : tag.code)}
              style={{
                padding: '4px 14px',
                borderRadius: '9999px',
                border: `1px solid ${activeTag === tag.code ? 'var(--semi-color-text-0)' : 'var(--semi-color-border)'}`,
                background: activeTag === tag.code ? 'var(--semi-color-text-0)' : 'transparent',
                color: activeTag === tag.code ? 'var(--semi-color-bg-0)' : 'var(--semi-color-text-1)',
                fontSize: '12.5px',
                fontWeight: activeTag === tag.code ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {tag.name_zh || tag.name_en}
            </button>
          ))}
        </div>
      )}

      {/* 模型网格 */}
      {modelsQuery.isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
          <Spin size="large" />
        </div>
      ) : modelsQuery.isError ? (
        <div style={{ color: '#ef4444', fontSize: '13px', padding: '24px 0' }}>加载模型目录失败，请稍后重试。</div>
      ) : filteredModels.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Text style={{ color: 'var(--semi-color-text-2)', fontSize: '13px' }}>未找到匹配的模型</Text>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '16px',
        }}>
          {filteredModels.map((model) => (
            <ModelCard key={model.model_id} model={model} onSelect={setSelectedId} />
          ))}
        </div>
      )}

      {/* 模型详情右侧抽屉 */}
      <SideSheet
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--semi-color-text-0)' }}>模型详情</span>
            {detailQuery.data && (
              <span style={{
                fontSize: '11px',
                color: 'var(--semi-color-text-2)',
                backgroundColor: 'var(--semi-color-fill-0)',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontWeight: 500,
              }}>
                {detailQuery.data.model_id}
              </span>
            )}
          </div>
        }
        visible={!!selectedId}
        onCancel={() => setSelectedId(null)}
        width={560}
        placement="right"
        closable
        style={{ borderRadius: '0' }}
        bodyStyle={{ padding: '24px', overflowY: 'auto' }}
      >
        {detailQuery.isLoading || providersQuery.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
            <Spin size="large" />
          </div>
        ) : detailQuery.isError ? (
          <div style={{ color: '#ef4444', fontSize: '13px', padding: '24px 0', textAlign: 'center' }}>
            加载模型详情失败，请稍后重试。
          </div>
        ) : detailQuery.data ? (
          <ModelDetailPanel detail={detailQuery.data} providers={providersQuery.data?.items ?? []} />
        ) : null}
      </SideSheet>
    </div>
  )
}
