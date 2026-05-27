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
    queryFn: () => listWorkspaces().then(res => res.items || [])
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
      Toast.success(`工作区 "${newWorkspace.name}" 创建成功`)
      setModalVisible(false)
      setName('')
      setSlug('')
      setDescription('')
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    },
    onError: (err: any) => {
      Toast.error(err?.message || '创建工作区失败')
    }
  })

  // 表格列定义 (完美契合截图中的字段与实体模型结构)
  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (text: string, record: WorkspaceItem) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600, color: 'var(--semi-color-text-0)', fontSize: '13.5px' }}>{text}</span>
          {record.is_default && (
            <Tag 
              style={{ 
                backgroundColor: '#eff6ff', 
                color: '#2563eb', 
                border: '1px solid #dbeafe',
                fontSize: '11px',
                fontWeight: 600,
                padding: '1px 8px',
                borderRadius: '12px'
              }}
            >
              当前
            </Tag>
          )}
          {record.is_default && (
            <Tag 
              style={{
                backgroundColor: 'var(--semi-color-fill-0)',
                color: 'var(--semi-color-text-1)',
                border: '1px solid var(--semi-color-border)',
                fontSize: '11px',
                fontWeight: 600,
                padding: '1px 8px',
                borderRadius: '12px'
              }}
            >
              默认
            </Tag>
          )}
        </div>
      )
    },
    {
      title: '工作区 ID',
      dataIndex: 'workspace_id',
      render: (text: string) => (
        <span style={{
          color: 'var(--semi-color-text-1)',
          fontFamily: 'monospace',
          fontSize: '12.5px',
          backgroundColor: 'var(--semi-color-bg-1)',
          padding: '2px 6px',
          borderRadius: '4px',
          border: '1px solid var(--semi-color-fill-0)'
        }}>{text}</span>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      render: (text: string) => (
        <span style={{ color: 'var(--semi-color-text-1)', fontSize: '13px' }}>
          {new Date(text).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-')}
        </span>
      )
    },
    {
      title: '操作',
      dataIndex: 'actions',
      render: () => (
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
        >
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
      Toast.error('工作区名称不能为空')
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
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
          工作区
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: 0, fontWeight: 400 }}>
          管理工作区信息、可用模型和使用限额。
        </p>
      </div>

      {/* 截图中的当前工作区 Select 栏：优化质感 */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '10px', 
        marginBottom: '28px',
        fontSize: '13px',
        color: 'var(--semi-color-text-1)',
        fontWeight: 500
      }}>
        <span>当前工作区</span>
        <Select 
          defaultValue="default" 
          style={{ width: '170px', borderRadius: '8px' }} 
          size="small"
        >
          <Select.Option value="default">默认工作区</Select.Option>
        </Select>
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
          placeholder="按名称或工作区 ID 搜索"
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

        {/* 黑色药丸主动作按钮 (触发弹出真实表单 modal，带微浮动阴影与过渡动效) */}
        <Button
          theme="solid"
          icon={<IconPlus />}
          onClick={() => setModalVisible(true)}
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
          创建工作区 ({(data || []).length}/20)
        </Button>
      </div>

      {/* 极简细线条无框 Table 视图 */}
      <Table
        columns={columns}
        dataSource={filteredData}
        loading={isLoading}
        pagination={false}
        bordered={false}
        style={{ 
          marginTop: '12px',
        }}
      />

      {/* 真实创建工作空间的表单对话框 */}
      <Modal
        title="创建新工作区"
        visible={modalVisible}
        onOk={handleCreateSubmit}
        onCancel={() => setModalVisible(false)}
        confirmLoading={createMutation.isPending}
        width={480}
        style={{ borderRadius: '12px' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '16px 0' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)', marginBottom: '8px' }}>空间名称</div>
            <Input 
              value={name} 
              onChange={val => setName(val)} 
              placeholder="如：生产环境应用区" 
              style={{ borderRadius: '8px' }}
            />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)', marginBottom: '8px' }}>唯一标识 (Slug)</div>
            <Input 
              value={slug} 
              onChange={val => setSlug(val)} 
              placeholder="如：prod-app" 
              style={{ borderRadius: '8px' }}
            />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)', marginBottom: '8px' }}>空间描述 (选填)</div>
            <Input 
              value={description} 
              onChange={val => setDescription(val)} 
              placeholder="简述该工作区的用途..." 
              style={{ borderRadius: '8px' }}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
