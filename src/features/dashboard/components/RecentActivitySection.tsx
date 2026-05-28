import React from 'react'
import { Typography, Table, Badge, Empty, Skeleton } from '@douyinfe/semi-ui'
import { useQuery } from '@tanstack/react-query'
import { listCallLogs } from '@/services/logs'
import { useAuthStore } from '@/store/auth'
import { format } from 'date-fns'
import { useNavigate, useParams } from 'react-router-dom'
import { LuArrowUpRight } from 'react-icons/lu'

const { Text, Title } = Typography

export const RecentActivitySection: React.FC = () => {
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const { workspaceId } = useParams()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['logs', 'recent', activeTenantId, workspaceId],
    queryFn: () => listCallLogs({ limit: 10, workspace_id: workspaceId }),
    enabled: !!activeTenantId,
    staleTime: 30_000,
  })

  const columns = [
    {
      title: '请求 ID',
      dataIndex: 'request_id',
      render: (text: string) => (
        <Text copyable strong style={{ fontSize: '12px', fontFamily: 'monospace' }}>
          {text.slice(0, 8)}...
        </Text>
      ),
    },
    {
      title: '模型',
      dataIndex: 'model',
      render: (model: { display_name: string }) => (
        <Text strong style={{ fontSize: '13px' }}>{model.display_name}</Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status: string) => {
        let type: any = 'success'
        if (status === 'failed') type = 'danger'
        if (status === 'rejected') type = 'warning'
        return (
          <Badge type={type}>
            {status.toUpperCase()}
          </Badge>
        )
      },
    },
    {
      title: '耗时',
      dataIndex: 'duration_ms',
      render: (ms: number) => <Text style={{ fontSize: '12px' }}>{ms}ms</Text>,
    },
    {
      title: 'Token',
      dataIndex: 'usage',
      render: (usage: { total_tokens: number }) => (
        <Text style={{ fontSize: '12px' }}>{usage.total_tokens}</Text>
      ),
    },
    {
      title: '时间',
      dataIndex: 'started_at',
      render: (date: string) => (
        <Text style={{ fontSize: '12px', color: 'var(--semi-color-text-2)' }}>
          {format(new Date(date), 'MM-dd HH:mm:ss')}
        </Text>
      ),
    },
  ]

  return (
    <div style={{
      background: 'var(--semi-color-bg-1)',
      borderRadius: '16px',
      border: '1px solid var(--semi-color-border)',
      padding: '24px',
      boxShadow: 'var(--semi-shadow-elevated)',
      height: '100%'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <Title heading={5} style={{ fontWeight: 700 }}>最近调用日志</Title>
        <Text 
          link 
          onClick={() => navigate('/logs')}
          style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          查看全部 <LuArrowUpRight size={14} />
        </Text>
      </div>

      {isLoading ? (
        <Skeleton active placeholder={<Skeleton.Paragraph rows={6} />} loading={true} />
      ) : data?.items && data.items.length > 0 ? (
        <Table
          columns={columns}
          dataSource={data.items}
          pagination={false}
          size="small"
          style={{ marginTop: '-8px' }}
          rowKey="call_log_id"
        />
      ) : (
        <Empty description="暂无调用记录" />
      )}
    </div>
  )
}
