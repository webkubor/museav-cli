import { useState } from 'react'

import { Table, Button, Input, Select, Tag } from '@douyinfe/semi-ui'
import { IconSearch, IconPlus } from '@douyinfe/semi-icons'

interface WorkspaceRecord {
  name: string
  id: string
  createTime: string
  isCurrent: boolean
  isDefault: boolean
}

export default function WorkspacesPage() {
  const [searchValue, setSearchValue] = useState('')

  // 1:1 还原截图中的表格数据
  const initialData: WorkspaceRecord[] = [
    {
      name: '默认业务空间',
      id: 'llm-v2kmio35vgls7ilr',
      createTime: '2026-01-21 11:49:59',
      isCurrent: true,
      isDefault: true
    },
    {
      name: '开发测试空间',
      id: 'llm-x88vjio35vgkw8ppr',
      createTime: '2026-05-12 14:32:10',
      isCurrent: false,
      isDefault: false
    },
    {
      name: '生产应用空间',
      id: 'llm-y77pjio35vgrr9llv',
      createTime: '2026-05-20 09:15:43',
      isCurrent: false,
      isDefault: false
    }
  ]

  // 表格列定义 (完美契合截图中的字段与样式)
  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (text: string, record: WorkspaceRecord) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 500, color: '#1f2937' }}>{text}</span>
          {record.isCurrent && (
            <Tag color="blue" size="small" shape="circle" style={{ padding: '0 8px' }}>
              ● 当前
            </Tag>
          )}
          {record.isDefault && (
            <Tag color="grey" size="small" shape="circle" style={{ padding: '0 8px' }}>
              ● 默认
            </Tag>
          )}
        </div>
      )
    },
    {
      title: '业务空间 ID',
      dataIndex: 'id',
      render: (text: string) => (
        <span style={{ color: '#4b5563', fontFamily: 'monospace' }}>{text}</span>
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
        <span style={{ color: '#0066ff', cursor: 'pointer', fontWeight: 500 }}>
          编辑
        </span>
      )
    }
  ]

  // 模糊检索
  const filteredData = initialData.filter(item => 
    item.name.includes(searchValue) || item.id.includes(searchValue)
  )

  return (
    <div>
      {/* 头部标题与描述 */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#111827', margin: '0 0 8px 0' }}>
          业务空间
        </h1>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
          管理业务空间信息、可用模型和使用限额。
        </p>
      </div>

      {/* 截图中的当前业务空间 Select 栏 */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        marginBottom: '24px',
        fontSize: '13px',
        color: '#4b5563'
      }}>
        <span>当前业务空间</span>
        <Select 
          defaultValue="default" 
          style={{ width: '160px' }} 
          size="small"
        >
          <Select.Option value="default">默认业务空间</Select.Option>
          <Select.Option value="test">开发测试空间</Select.Option>
          <Select.Option value="prod">生产应用空间</Select.Option>
        </Select>
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
          placeholder="按名称或业务空间 ID 搜索"
          prefix={<IconSearch style={{ color: '#9ca3af' }} />}
          style={{ width: '280px', borderRadius: '9999px' }}
          value={searchValue}
          onChange={(val) => setSearchValue(val)}
        />

        {/* 黑色药丸主动作按钮 (完美1:1还原截图) */}
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
          创建业务空间 (1/20)
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
