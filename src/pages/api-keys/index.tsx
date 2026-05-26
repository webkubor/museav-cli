import { useState } from 'react'
import { Table, Button, Input, Tag } from '@douyinfe/semi-ui'

import { IconSearch, IconPlus } from '@douyinfe/semi-icons'

interface ApiKeyRecord {
  name: string
  key: string
  status: boolean
  createTime: string
}

export default function ApiKeysPage() {
  const [searchValue, setSearchValue] = useState('')

  const initialData: ApiKeyRecord[] = [
    {
      name: '生产应用 API Key',
      key: 'sk-modelgo-••••••••••••abcd',
      status: true,
      createTime: '2026-05-18 10:22:45'
    },
    {
      name: '本地测试 Key',
      key: 'sk-modelgo-••••••••••••xyz9',
      status: true,
      createTime: '2026-05-24 16:44:12'
    },
    {
      name: '测试环境临时 Key',
      key: 'sk-modelgo-••••••••••••1234',
      status: false,
      createTime: '2026-05-26 11:05:00'
    }
  ]

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (text: string) => (
        <span style={{ fontWeight: 500, color: '#1f2937' }}>{text}</span>
      )
    },
    {
      title: 'API Key 凭证',
      dataIndex: 'key',
      render: (text: string) => (
        <span style={{ color: '#4b5563', fontFamily: 'monospace', letterSpacing: '0.05em' }}>{text}</span>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status: boolean) => (
        <Tag color={status ? 'green' : 'grey'} size="small" shape="circle">
          {status ? '● 启用中' : '● 已禁用'}
        </Tag>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      render: (text: string) => (
        <span style={{ color: '#4b5563' }}>{text}</span>
      )
    },
    {
      title: '操作',
      dataIndex: 'actions',
      render: () => (
        <div style={{ display: 'flex', gap: '16px' }}>
          <span style={{ color: '#0066ff', cursor: 'pointer', fontWeight: 500 }}>复制</span>
          <span style={{ color: '#0066ff', cursor: 'pointer', fontWeight: 500 }}>编辑</span>
          <span style={{ color: '#ef4444', cursor: 'pointer', fontWeight: 500 }}>删除</span>
        </div>
      )
    }
  ]

  const filteredData = initialData.filter(item => 
    item.name.includes(searchValue) || item.key.includes(searchValue)
  )

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
        pagination={false}
        bordered={false}
        style={{ marginTop: '8px' }}
      />
    </div>
  )
}
