import React from 'react'
import { Typography, Row, Col } from '@douyinfe/semi-ui'
import { 
  LuBox, 
  LuKey, 
  LuActivity, 
  LuCreditCard, 
  LuShieldCheck, 
  LuChevronRight,
  LuLayoutDashboard
} from 'react-icons/lu'
import { useNavigate, useParams } from 'react-router-dom'

const { Title, Text } = Typography

interface QuickLink {
  title: string
  desc: string
  icon: React.ReactNode
  path: string
  color: string
  bgColor: string
}

export const QuickAccessSection: React.FC = () => {
  const navigate = useNavigate()
  const { workspaceId } = useParams()

  const links: QuickLink[] = [
    {
      title: '模型仓库',
      desc: '探索与管理可用模型',
      icon: <LuBox size={20} />,
      path: '/models',
      color: 'var(--semi-color-primary)',
      bgColor: 'var(--semi-color-primary-light-default)'
    },
    {
      title: 'API 密钥',
      desc: '创建并管理访问令牌',
      path: workspaceId ? `/workspace/${workspaceId}/api-keys` : '/api-keys',
      icon: <LuKey size={20} />,
      color: '#f59e0b',
      bgColor: 'rgba(245, 158, 11, 0.15)'
    },
    {
      title: '用量统计',
      desc: '监控 API 调用与消耗',
      path: '/usage',
      icon: <LuActivity size={20} />,
      color: '#10b981',
      bgColor: 'rgba(16, 185, 129, 0.15)'
    },
    {
      title: '财务账单',
      desc: '充值余额与下载发票',
      path: '/billing',
      icon: <LuCreditCard size={20} />,
      color: '#8b5cf6',
      bgColor: 'rgba(139, 92, 246, 0.15)'
    },
    {
      title: '内容安全',
      desc: '配置模型过滤护栏',
      path: workspaceId ? `/workspace/${workspaceId}/guardrails` : '/guardrails',
      icon: <LuShieldCheck size={20} />,
      color: '#ef4444',
      bgColor: 'rgba(239, 68, 68, 0.15)'
    },
    {
      title: '可观测性',
      desc: '查看实时调用审计日志',
      path: workspaceId ? `/workspace/${workspaceId}/observability` : '/observability',
      icon: <LuLayoutDashboard size={20} />,
      color: '#06b6d4',
      bgColor: 'rgba(6, 182, 212, 0.15)'
    }
  ]

  return (
    <div style={{ marginBottom: '36px' }}>
      <Title heading={5} style={{ marginBottom: '16px', fontWeight: 700 }}>
        快捷功能入口
      </Title>
      <Row gutter={[16, 16]}>
        {links.map((link, idx) => (
          <Col xs={24} sm={12} md={8} lg={4} key={idx}>
            <div
              onClick={() => navigate(link.path)}
              style={{
                background: 'var(--semi-color-bg-1)',
                border: '1px solid var(--semi-color-border)',
                borderRadius: '12px',
                padding: '16px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--semi-color-bg-2)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--semi-color-primary)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'var(--semi-shadow-elevated)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'none';
                (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--semi-color-bg-1)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--semi-color-border)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}
            >
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: link.bgColor,
                color: link.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {link.icon}
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--semi-color-text-0)' }}>
                  {link.title}
                </div>
                <Text style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', marginTop: '4px' }}>
                  {link.desc}
                </Text>
              </div>
              <LuChevronRight 
                size={14} 
                style={{ 
                  position: 'absolute', 
                  right: '12px', 
                  top: '12px', 
                  color: 'var(--semi-color-text-3)' 
                }} 
              />
            </div>
          </Col>
        ))}
      </Row>
    </div>
  )
}
