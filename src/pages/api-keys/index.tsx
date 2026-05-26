import { useState } from 'react'
import { Table, Button, Input, Tag, Modal, Toast, Typography, Select } from '@douyinfe/semi-ui'
import { IconSearch, IconPlus } from '@douyinfe/semi-icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listApiKeys, createApiKey, revokeApiKey } from '@/services/api-keys'
import { useAuthStore } from '@/store/auth'
import type { ApiKeyItem } from '@/types'

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
    queryFn: () => listApiKeys(activeWorkspaceId).then(res => res.items),
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
      // 重置输入
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
        <span style={{ fontWeight: 500, color: '#1f2937' }}>{text}</span>
      )
    },
    {
      title: '环境',
      dataIndex: 'env',
      render: (envVal: string) => (
        <Tag color={envVal === 'live' ? 'cyan' : 'amber'} size="small">
          {envVal.toUpperCase()}
        </Tag>
      )
    },
    {
      title: 'API Key 凭证',
      dataIndex: 'masked',
      render: (text: string) => (
        <span style={{ color: '#4b5563', fontFamily: 'monospace', letterSpacing: '0.05em' }}>{text}</span>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status: string) => (
        <Tag color={status === 'active' ? 'green' : 'grey'} size="small" shape="circle">
          {status === 'active' ? '● 启用中' : '● 已禁用'}
        </Tag>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      render: (text: string) => (
        <span style={{ color: '#4b5563' }}>
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
            style={{ color: '#0066ff', cursor: 'pointer', fontWeight: 500 }}
            onClick={() => {
              navigator.clipboard.writeText(record.prefix + '••••••••')
              Toast.success('遮蔽凭证已复制到剪贴板')
            }}
          >
            复制
          </span>
          {record.status === 'active' ? (
            <span 
              style={{ color: '#ef4444', cursor: 'pointer', fontWeight: 500 }}
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
            <span style={{ color: '#9ca3af', cursor: 'not-allowed' }}>已禁用</span>
          )}
        </div>
      )
    }
  ]

  const filteredData = (data || []).filter(item => 
    item.name.includes(searchValue) || item.masked.includes(searchValue)
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
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#111827', margin: '0 0 8px 0' }}>
          API Keys
        </h1>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
          用于 OpenAI SDK 兼容接入的安全凭证，请妥善保管您的密钥凭证，切勿泄露给第三方。
        </p>
      </div>

      {/* 控制台操作区域（搜索框 + 药丸动作按钮） */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '20px' 
      }}>
        {/* 圆角搜索框 */}
        <Input
          placeholder="搜索密钥名称"
          prefix={<IconSearch style={{ color: '#9ca3af' }} />}
          style={{ width: '280px', borderRadius: '9999px' }}
          value={searchValue}
          onChange={(val) => setSearchValue(val)}
        />

        {/* 黑色药丸主动作按钮 */}
        <Button
          theme="solid"
          icon={<IconPlus />}
          onClick={() => setCreateVisible(true)}
          style={{ 
            backgroundColor: '#000000', 
            color: '#ffffff',
            borderRadius: '9999px',
            padding: '8px 20px',
            fontSize: '13px',
            fontWeight: 500,
            border: 'none',
            height: '36px'
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
        style={{ marginTop: '8px' }}
      />

      {/* 创建 API Key 的表单 Dialog */}
      <Modal
        title="创建 API Key"
        visible={createVisible}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateVisible(false)}
        confirmLoading={createMutation.isPending}
        width={440}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px 0' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>密钥名称</div>
            <Input 
              value={name} 
              onChange={val => setName(val)} 
              placeholder="如：生产测试 Key" 
            />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>调用环境</div>
            <Select 
              value={env} 
              onChange={val => setEnv(val as any)} 
              style={{ width: '100%' }}
            >
              <Select.Option value="live">LIVE (真实计费)</Select.Option>
              <Select.Option value="test">TEST (沙盒测试)</Select.Option>
            </Select>
          </div>
        </div>
      </Modal>

      {/* 绝密：创建成功后的密钥明文 Reveal 对话框 */}
      <Modal
        title="🔑 请复制您的 API Key"
        visible={revealVisible}
        hasFooter={false}
        onCancel={() => setRevealVisible(false)}
        closeOnEsc={false}
        maskClosable={false}
        width={500}
      >
        <div style={{ padding: '8px 0' }}>
          <div style={{ 
            backgroundColor: '#fef3c7', 
            border: '1px solid #fcd34d', 
            padding: '12px 16px', 
            borderRadius: '8px',
            color: '#78350f',
            fontSize: '12px',
            marginBottom: '20px',
            lineHeight: '1.5'
          }}>
            ⚠️ <strong>请立即复制并妥善保存此 API Key！</strong>为了您的安全，此凭证<strong>仅在创建时显示一次</strong>，离开此页面后将再也无法找回或查看明文。
          </div>

          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '8px' }}>
              您的 API Key 凭证明文：
            </span>
            <Paragraph 
              copyable
              style={{
                backgroundColor: '#1f2937',
                color: '#10b981',
                padding: '12px 16px',
                borderRadius: '8px',
                fontFamily: 'monospace',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontWeight: 600,
                letterSpacing: '0.02em',
                margin: 0
              }}
            >
              {createdKeyText}
            </Paragraph>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
            <Button 
              type="primary" 
              theme="solid" 
              onClick={() => setRevealVisible(false)}
              style={{ borderRadius: '8px', padding: '6px 24px' }}
            >
              我已复制并妥善保存
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
