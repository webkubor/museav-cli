import { useState } from 'react'
import { Table, Button, Input, Select, Tag, Modal, Toast } from '@douyinfe/semi-ui'
import { IconSearch, IconPlus } from '@douyinfe/semi-icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listWorkspaces, createWorkspace } from '@/services/workspaces'
import type { WorkspaceItem } from '@/types'

export default function WorkspacesPage() {
  const queryClient = useQueryClient()
  const [searchValue, setSearchValue] = useState('')
  const [modalVisible, setModalVisible] = useState(false)

  // 受控表单状态
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')

  // ─── 1. TanStack Query 真实获取工作空间接口数据 ─────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => listWorkspaces().then(res => res.items)
  })

  // ─── 2. Mutation 真实绑定新建工作空间接口 ─────────────────────
  const createMutation = useMutation({
    mutationFn: (vals: { name: string; slug: string; description?: string }) => {
      return createWorkspace({
        name: vals.name,
        slug: vals.slug,
        description: vals.description,
        kind: 'team'
      })
    },
    onSuccess: (newWorkspace) => {
      Toast.success(`业务空间 "${newWorkspace.name}" 创建成功`)
      setModalVisible(false)
      // 重置表单
      setName('')
      setSlug('')
      setDescription('')
      // 自动刷新工作区列表缓存，UI 实时渲染新节点！
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    },
    onError: (err: any) => {
      Toast.error(err?.message || '创建业务空间失败')
    }
  })

  // 表格列定义 (完美契合截图中的字段与实体模型结构)
  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (text: string, record: WorkspaceItem) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 500, color: '#1f2937' }}>{text}</span>
          {record.is_default && (
            <Tag color="blue" size="small" shape="circle" style={{ padding: '0 8px' }}>
              ● 当前
            </Tag>
          )}
          {record.is_default && (
            <Tag color="grey" size="small" shape="circle" style={{ padding: '0 8px' }}>
              ● 默认
            </Tag>
          )}
        </div>
      )
    },
    {
      title: '业务空间 ID',
      dataIndex: 'workspace_id',
      render: (text: string) => (
        <span style={{ color: '#4b5563', fontFamily: 'monospace' }}>{text}</span>
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
      render: () => (
        <span style={{ color: '#0066ff', cursor: 'pointer', fontWeight: 500 }}>
          编辑
        </span>
      )
    }
  ]

  // 支持模糊搜索
  const filteredData = (data || []).filter(item => 
    item.name.includes(searchValue) || item.workspace_id.includes(searchValue)
  )

  const handleCreateSubmit = () => {
    if (!name.trim()) {
      Toast.error('业务空间名称不能为空')
      return
    }
    if (!slug.trim()) {
      Toast.error('唯一标识不能为空')
      return
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      Toast.error('唯一标识仅支持小写字母、数字和连字符')
      return
    }
    createMutation.mutate({ name, slug, description })
  }

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

        {/* 黑色药丸主动作按钮 (触发弹出真实表单 modal) */}
        <Button
          theme="solid"
          icon={<IconPlus />}
          onClick={() => setModalVisible(true)}
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
          创建业务空间 ({(data || []).length}/20)
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

      {/* 真实创建工作空间的表单对话框 */}
      <Modal
        title="创建新业务空间"
        visible={modalVisible}
        onOk={handleCreateSubmit}
        onCancel={() => setModalVisible(false)}
        confirmLoading={createMutation.isPending}
        width={480}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px 0' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>空间名称</div>
            <Input 
              value={name} 
              onChange={val => setName(val)} 
              placeholder="如：生产环境应用区" 
            />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>唯一标识 (Slug)</div>
            <Input 
              value={slug} 
              onChange={val => setSlug(val)} 
              placeholder="如：prod-app" 
            />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>空间描述 (选填)</div>
            <Input 
              value={description} 
              onChange={val => setDescription(val)} 
              placeholder="简述该业务空间的用途..." 
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
