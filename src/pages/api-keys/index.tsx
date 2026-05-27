import { useState } from 'react'
import { Table, Button, Input, Tag, Modal, Toast, Typography, Select } from '@douyinfe/semi-ui'
import { IconSearch, IconPlus, IconCopy } from '@douyinfe/semi-icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { listApiKeys, createApiKey, revokeApiKey } from '@/services/api-keys'
import { useAuthStore } from '@/store/auth'
import type { ApiKeyItem } from '@/types'
import { pageItems } from '@/lib/utils'
import { formatDateTime } from '@/lib/format-date'

const { Paragraph } = Typography

export default function ApiKeysPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchValue, setSearchValue] = useState('')
  const [createVisible, setCreateVisible] = useState(false)
  const [revealVisible, setRevealVisible] = useState(false)
  const [createdKeyText, setCreatedKeyText] = useState('')

  // 受控表单状态
  const [name, setName] = useState('')
  const [env, setEnv] = useState<'live' | 'test'>('live')

  // 获取全局活跃的当前 workspace_id
  const activeWorkspaceId = useAuthStore((state) => state.activeWorkspaceId) || '01HV3KWS000000000000001'

  // ─── 1. TanStack Query 真实加载当前工作空间的 API Keys 列表 ──────
  const { data, isLoading } = useQuery({
    queryKey: ['api-keys', activeWorkspaceId],
    queryFn: () => listApiKeys(activeWorkspaceId).then(pageItems),
    enabled: !!activeWorkspaceId
  })

  // ─── 2. Mutation 真实绑定新建 API Key 接口 ───────────────────────
  const createMutation = useMutation({
    mutationFn: (vals: { name: string; env?: 'live' | 'test' }) => {
      return createApiKey(activeWorkspaceId, {
        name: vals.name,
        env: vals.env || 'live'
      })
    },
    onSuccess: (newKey) => {
      Toast.success(t('apiKeys.toast.createSuccess', { name: newKey.name }))
      setCreateVisible(false)
      // 捕获仅返回一次的明文 key 字符串以供用户复制
      setCreatedKeyText(newKey.key)
      setRevealVisible(true)
      setName('')
      setEnv('live')
      queryClient.invalidateQueries({ queryKey: ['api-keys', activeWorkspaceId] })
    },
    onError: (err: any) => {
      Toast.error(err?.message || t('apiKeys.toast.createError'))
    }
  })

  // ─── 3. Mutation 真实绑定撤销 (Revoke) API Key 接口 ─────────────
  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokeApiKey(activeWorkspaceId, keyId),
    onSuccess: () => {
      Toast.success(t('apiKeys.toast.revokeSuccess'))
      queryClient.invalidateQueries({ queryKey: ['api-keys', activeWorkspaceId] })
    },
    onError: (err: any) => {
      Toast.error(err?.message || t('apiKeys.toast.revokeError'))
    }
  })

  const columns = [
    {
      title: t('apiKeys.table.name'),
      dataIndex: 'name',
      render: (text: string) => (
        <span style={{ fontWeight: 600, color: 'var(--semi-color-text-0)', fontSize: '13.5px' }}>{text}</span>
      )
    },
    {
      title: t('apiKeys.table.env'),
      dataIndex: 'env',
      render: (envVal: string) => (
        <Tag 
          style={{ 
            backgroundColor: envVal === 'live' ? '#ecfdf5' : '#fffbeb', 
            color: envVal === 'live' ? '#059669' : '#d97706', 
            border: envVal === 'live' ? '1px solid #a7f3d0' : '1px solid #fde68a',
            fontSize: '11px',
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: '4px'
          }}
        >
          {envVal.toUpperCase()}
        </Tag>
      )
    },
    {
      title: t('apiKeys.table.credentials'),
      dataIndex: 'masked',
      render: (text: string) => (
        <span style={{ 
          color: 'var(--semi-color-text-1)',
          fontFamily: 'monospace',
          letterSpacing: '0.04em',
          fontSize: '13px',
          backgroundColor: 'var(--semi-color-bg-1)',
          padding: '2px 8px',
          borderRadius: '4px',
          border: '1px solid var(--semi-color-fill-0)'
        }}>{text}</span>
      )
    },
    {
      title: t('apiKeys.table.status'),
      dataIndex: 'status',
      render: (status: string) => (
        <Tag 
          style={{ 
            backgroundColor: status === 'active' ? '#f0fdf4' : 'var(--semi-color-fill-0)',
            color: status === 'active' ? '#16a34a' : 'var(--semi-color-text-1)',
            border: status === 'active' ? '1px solid #bbf7d0' : '1px solid var(--semi-color-border)',
            fontSize: '11.5px',
            fontWeight: 600,
            borderRadius: '12px'
          }}
        >
          {status === 'active' ? `● ${t('apiKeys.table.active')}` : `● ${t('apiKeys.table.disabled')}`}
        </Tag>
      )
    },
    {
      title: '近30天消费',
      dataIndex: 'usage_30d',
      render: (usage: ApiKeyItem['usage_30d']) => (
        <span style={{ fontSize: '13px', color: 'var(--semi-color-text-0)', fontVariantNumeric: 'tabular-nums' }}>
          {usage?.amount
            ? `${usage.currency} ${parseFloat(usage.amount).toFixed(4)}`
            : <span style={{ color: 'var(--semi-color-text-3)' }}>—</span>
          }
        </span>
      )
    },
    {
      title: t('apiKeys.table.createdAt'),
      dataIndex: 'created_at',
      render: (text: string) => (
        <span style={{ color: 'var(--semi-color-text-1)', fontSize: '13px' }}>
          {formatDateTime(text)}
        </span>
      )
    },
    {
      title: t('apiKeys.table.actions'),
      dataIndex: 'actions',
      render: (_text: any, record: ApiKeyItem) => (
        <div style={{ display: 'flex', gap: '16px' }}>
          <span 
            style={{ 
              color: '#0066ff', 
              cursor: 'pointer', 
              fontWeight: 600, 
              fontSize: '13px',
              transition: 'color 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#004ecb'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#0066ff'}
            onClick={() => {
              navigator.clipboard.writeText(record.prefix + '••••••••')
              Toast.success(t('apiKeys.table.copyMaskedSuccess'))
            }}
          >
            {t('apiKeys.table.copy')}
          </span>
          {record.status === 'active' ? (
            <span 
              style={{ 
                color: '#ef4444', 
                cursor: 'pointer', 
                fontWeight: 600, 
                fontSize: '13px',
                transition: 'color 0.2s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#dc2626'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#ef4444'}
              onClick={() => {
                Modal.confirm({
                  title: t('apiKeys.revokeConfirm.title'),
                  content: t('apiKeys.revokeConfirm.content'),
                  onOk: () => revokeMutation.mutate(record.api_key_id)
                })
              }}
            >
              {t('apiKeys.table.revoke')}
            </span>
          ) : (
            <span style={{ color: 'var(--semi-color-text-2)', cursor: 'not-allowed', fontSize: '13px' }}>{t('apiKeys.table.disabled')}</span>
          )}
        </div>
      )
    }
  ]

  const filteredData = pageItems(data).filter(item =>
    item.name.includes(searchValue) || (item.masked ?? '').includes(searchValue)
  )

  const handleCreateSubmit = () => {
    if (!name.trim()) {
      Toast.error(t('apiKeys.createModal.nameRequired'))
      return
    }
    createMutation.mutate({ name, env })
  }

  return (
    <div>
      {/* 头部标题与描述 */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
          {t('apiKeys.title')}
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: 0, fontWeight: 400 }}>
          {t('apiKeys.desc')}
        </p>
      </div>

      {/* 控制台操作区域（搜索框 + 药丸动作按钮） */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '24px' 
      }}>
        {/* 圆角微阴影输入框 */}
        <Input
          placeholder={t('apiKeys.search')}
          prefix={<IconSearch style={{ color: 'var(--semi-color-text-2)' }} />}
          style={{
            width: '290px',
            borderRadius: '9999px',
            border: '1px solid var(--semi-color-border)',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
            transition: 'all 0.2s ease'
          }}
          value={searchValue}
          onChange={(val) => setSearchValue(val)}
        />

        {/* 黑色药丸主动作按钮 (带微浮动阴影与过渡动效) */}
        <Button
          theme="solid"
          icon={<IconPlus />}
          onClick={() => setCreateVisible(true)}
          style={{ 
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            color: 'var(--semi-color-bg-0)',
            borderRadius: '24px',
            padding: '8px 24px',
            fontSize: '13px',
            fontWeight: 600,
            border: 'none',
            height: '38px',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15), inset 0 1px 1px rgba(255,255,255,0.1)',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(15, 23, 42, 0.22)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.15)';
          }}
        >
          {t('apiKeys.create')}
        </Button>
      </div>

      {/* 极简细线条无框 Table 视图 */}
      <Table
        columns={columns}
        dataSource={filteredData}
        loading={isLoading}
        pagination={false}
        bordered={false}
        style={{ marginTop: '12px' }}
      />

      {/* 创建 API Key 的表单 Dialog */}
      <Modal
        title={t('apiKeys.createModal.title')}
        visible={createVisible}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateVisible(false)}
        confirmLoading={createMutation.isPending}
        width={440}
        style={{ borderRadius: '12px' }}
        okText={t('apiKeys.createModal.confirm')}
        cancelText={t('apiKeys.createModal.cancel')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '16px 0' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)', marginBottom: '8px' }}>{t('apiKeys.createModal.nameLabel')}</div>
            <Input 
              value={name} 
              onChange={val => setName(val)} 
              placeholder={t('apiKeys.createModal.namePlaceholder')} 
              style={{ borderRadius: '8px' }}
            />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)', marginBottom: '8px' }}>{t('apiKeys.createModal.envLabel')}</div>
            <Select 
              value={env} 
              onChange={val => setEnv(val as any)} 
              style={{ width: '100%', borderRadius: '8px' }}
            >
              <Select.Option value="live">{t('apiKeys.createModal.live')}</Select.Option>
              <Select.Option value="test">{t('apiKeys.createModal.test')}</Select.Option>
            </Select>
          </div>
        </div>
      </Modal>

      {/* 绝密：创建成功后的密钥明文 Reveal 对话框 (大厂轻拟物极客暗黑风) */}
      <Modal
        title={t('apiKeys.revealModal.title')}
        visible={revealVisible}
        hasFooter={false}
        onCancel={() => setRevealVisible(false)}
        closeOnEsc={false}
        maskClosable={false}
        width={500}
        style={{ borderRadius: '16px' }}
      >
        <div style={{ padding: '8px 0' }}>
          <div style={{ 
            backgroundColor: '#fffbeb', 
            border: '1px solid #fde68a', 
            padding: '14px 18px', 
            borderRadius: '10px',
            color: '#b45309',
            fontSize: '12.5px',
            marginBottom: '24px',
            lineHeight: '1.6',
            fontWeight: 500
          }}>
            {t('apiKeys.revealModal.warning')}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)', display: 'block', marginBottom: '10px' }}>
              {t('apiKeys.revealModal.label')}
            </span>
            <Paragraph 
              copyable={{
                icon: <IconCopy style={{ color: '#10b981', fontSize: '16px', cursor: 'pointer' }} />
              }}
              style={{
                backgroundColor: 'var(--semi-color-text-0)',
                color: '#10b981',
                padding: '16px 20px',
                borderRadius: '10px',
                fontFamily: 'monospace',
                fontSize: '14.5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontWeight: 700,
                letterSpacing: '0.02em',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
                margin: 0,
                border: '1px solid var(--semi-color-text-0)'
              }}
            >
              {createdKeyText}
            </Paragraph>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '28px' }}>
            <Button 
              type="primary" 
              theme="solid" 
              onClick={() => setRevealVisible(false)}
              style={{ 
                borderRadius: '20px', 
                padding: '8px 28px',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)',
                border: 'none',
                boxShadow: '0 4px 12px rgba(29,78,216,0.2)'
              }}
            >
              {t('apiKeys.revealModal.done')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
