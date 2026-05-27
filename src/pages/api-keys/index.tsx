import { useState } from 'react'
import { Table, Button, Input, Tag, Modal, Toast, Typography, Select } from '@douyinfe/semi-ui'
import { IconSearch, IconPlus, IconCopy } from '@douyinfe/semi-icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listApiKeys, createApiKey, revokeApiKey } from '@/services/api-keys'
import { useAuthStore } from '@/store/auth'
import type { ApiKeyItem } from '@/types'
import { pageItems } from '@/lib/utils'

const { Paragraph } = Typography

export default function ApiKeysPage() {
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
      Toast.success(`密钥 "${newKey.name}" 创建成功`)
      setCreateVisible(false)
      // 捕获仅返回一次的明文 key 字符串以供用户复制
      setCreatedKeyText(newKey.key)
      setRevealVisible(true)
      setName('')
      setEnv('live')
      queryClient.invalidateQueries({ queryKey: ['api-keys', activeWorkspaceId] })
    },
    onError: (err: any) => {
      Toast.error(err?.message || '创建密钥失败')
    }
  })

  // ─── 3. Mutation 真实绑定撤销 (Revoke) API Key 接口 ─────────────
  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokeApiKey(activeWorkspaceId, keyId),
    onSuccess: () => {
      Toast.success('密钥已成功撤销废弃')
      queryClient.invalidateQueries({ queryKey: ['api-keys', activeWorkspaceId] })
    },
    onError: (err: any) => {
      Toast.error(err?.message || '撤销密钥失败')
    }
  })

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (text: string) => (
        <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '13.5px' }}>{text}</span>
      )
    },
    {
      title: '环境',
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
      title: 'API Key 凭证',
      dataIndex: 'masked',
      render: (text: string) => (
        <span style={{ 
          color: '#475569', 
          fontFamily: 'monospace', 
          letterSpacing: '0.04em',
          fontSize: '13px',
          backgroundColor: '#f8fafc',
          padding: '2px 8px',
          borderRadius: '4px',
          border: '1px solid #f1f5f9'
        }}>{text}</span>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status: string) => (
        <Tag 
          style={{ 
            backgroundColor: status === 'active' ? '#f0fdf4' : '#f1f5f9', 
            color: status === 'active' ? '#16a34a' : '#64748b', 
            border: status === 'active' ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
            fontSize: '11.5px',
            fontWeight: 600,
            borderRadius: '12px'
          }}
        >
          {status === 'active' ? '● 启用中' : '● 已禁用'}
        </Tag>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      render: (text: string) => (
        <span style={{ color: '#64748b', fontSize: '13px' }}>
          {new Date(text).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-')}
        </span>
      )
    },
    {
      title: '操作',
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
              Toast.success('遮蔽凭证已复制到剪贴板')
            }}
          >
            复制
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
                  title: '确定要废弃该密钥吗？',
                  content: '密钥废弃后立即失效，且不可恢复，所有的网关请求将直接被阻断！',
                  onOk: () => revokeMutation.mutate(record.api_key_id)
                })
              }}
            >
              禁用
            </span>
          ) : (
            <span style={{ color: '#94a3b8', cursor: 'not-allowed', fontSize: '13px' }}>已禁用</span>
          )}
        </div>
      )
    }
  ]

  const filteredData = (data ?? []).filter(item =>
    item.name.includes(searchValue) || (item.masked ?? '').includes(searchValue)
  )

  const handleCreateSubmit = () => {
    if (!name.trim()) {
      Toast.error('密钥名称不能为空')
      return
    }
    createMutation.mutate({ name, env })
  }

  return (
    <div>
      {/* 头部标题与描述 */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
          API Keys
        </h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0, fontWeight: 400 }}>
          用于 OpenAI SDK 兼容接入的安全凭证，请妥善保管您的密钥凭证，切勿泄露给第三方。
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
          placeholder="搜索密钥名称"
          prefix={<IconSearch style={{ color: '#94a3b8' }} />}
          style={{ 
            width: '290px', 
            borderRadius: '9999px',
            border: '1px solid #e2e8f0',
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
            color: '#ffffff',
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
          创建 API Key
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
        title="创建 API Key"
        visible={createVisible}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateVisible(false)}
        confirmLoading={createMutation.isPending}
        width={440}
        style={{ borderRadius: '12px' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '16px 0' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>密钥名称</div>
            <Input 
              value={name} 
              onChange={val => setName(val)} 
              placeholder="如：生产测试 Key" 
              style={{ borderRadius: '8px' }}
            />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>调用环境</div>
            <Select 
              value={env} 
              onChange={val => setEnv(val as any)} 
              style={{ width: '100%', borderRadius: '8px' }}
            >
              <Select.Option value="live">LIVE (真实计费)</Select.Option>
              <Select.Option value="test">TEST (沙盒测试)</Select.Option>
            </Select>
          </div>
        </div>
      </Modal>

      {/* 绝密：创建成功后的密钥明文 Reveal 对话框 (大厂轻拟物极客暗黑风) */}
      <Modal
        title="🔑 您的新 API Key 已就绪"
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
            ⚠️ <strong>请立即妥善保存该凭证！</strong>出于安全性设计，明文 API Key <strong>仅在创建时短暂显示一次</strong>，若不慎关闭该弹窗，您将再也无法寻回明文。
          </div>

          <div style={{ marginBottom: '20px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '10px' }}>
              API Key 凭证明文：
            </span>
            <Paragraph 
              copyable={{
                icon: <IconCopy style={{ color: '#10b981', fontSize: '16px', cursor: 'pointer' }} />
              }}
              style={{
                backgroundColor: '#0f172a',
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
                border: '1px solid #1e293b'
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
              我已复制并妥善保存
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
