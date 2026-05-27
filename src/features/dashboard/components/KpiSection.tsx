import React from 'react'
import { Row, Col, Typography } from '@douyinfe/semi-ui'
import { Sparkline } from '@/components/ui/Sparkline'

const { Text } = Typography

interface KpiItem {
  title: string
  value: string
  change: string
  color: string
  gradientId: string
  pathData: string
  fillPathData: string
}

const KPIS: KpiItem[] = [
  { 
    title: '总请求量 (次)', 
    value: '1,284', 
    change: '+12.4%', 
    color: '#10b981',
    gradientId: 'gradient-green',
    pathData: 'M0 32C15 28 25 15 40 18C55 22 65 32 80 12C95 -8 105 5 120 2',
    fillPathData: 'M0 32C15 28 25 15 40 18C55 22 65 32 80 12C95 -8 105 5 120 2V40H0V32Z'
  },
  { 
    title: '消耗 Token (k)', 
    value: '18,495', 
    change: '+8.3%', 
    color: '#3b82f6',
    gradientId: 'gradient-blue',
    pathData: 'M0 35C15 32 25 36 40 24C55 12 65 18 80 8C95 -2 105 6 120 4',
    fillPathData: 'M0 35C15 32 25 36 40 24C55 12 65 18 80 8C95 -2 105 6 120 4V40H0V35Z'
  },
  { 
    title: '消费金额 ($)', 
    value: '23.84', 
    change: '+15.2%', 
    color: '#f59e0b',
    gradientId: 'gradient-yellow',
    pathData: 'M0 38C15 36 25 24 40 26C55 28 65 10 80 14C95 18 105 -2 120 1',
    fillPathData: 'M0 38C15 36 25 24 40 26C55 28 65 10 80 14C95 18 105 -2 120 1V40H0V38Z'
  }
]

interface KpiCardProps {
  item: KpiItem
}

const KpiCard: React.FC<KpiCardProps> = ({ item }) => {
  return (
    <div
      style={{
        borderRadius: '14px',
        border: '1px solid rgba(226, 232, 240, 0.7)',
        background: 'linear-gradient(135deg, rgba(248, 250, 252, 0.4) 0%, rgba(255, 255, 255, 0.9) 100%)',
        padding: '22px 24px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.01)',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59, 130, 246, 0.25)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 24px -10px rgba(15, 23, 42, 0.08), 0 4px 12px -5px rgba(59, 130, 246, 0.05)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'none';
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(226, 232, 240, 0.7)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 2px rgba(0,0,0,0.01)';
      }}
    >
      <Text style={{ color: '#64748b', fontSize: '12.5px', fontWeight: 500, letterSpacing: '0.01em' }}>
        {item.title}
      </Text>
      
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginTop: '10px',
        position: 'relative',
        zIndex: 2
      }}>
        <span style={{ fontSize: '30px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>
          {item.value}
        </span>
        
        <span style={{ 
          fontSize: '11px', 
          fontWeight: 700, 
          color: item.color,
          backgroundColor: item.color + '15',
          padding: '3px 8px',
          borderRadius: '12px',
          border: '1px solid ' + item.color + '30',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px'
        }}>
          <span style={{ fontSize: '10px' }}>↑</span>
          {item.change}
        </span>
      </div>

      <div style={{ 
        position: 'absolute', 
        bottom: '-2px', 
        left: 0, 
        right: 0, 
        height: '42px',
        opacity: 0.85,
        zIndex: 1
      }}>
        <Sparkline 
          color={item.color}
          gradientId={item.gradientId}
          pathData={item.pathData}
          fillPathData={item.fillPathData}
        />
      </div>
    </div>
  )
}

export const KpiSection: React.FC = () => {
  return (
    <Row gutter={20} style={{ marginBottom: '36px' }}>
      {KPIS.map((item, idx) => (
        <Col span={8} key={idx}>
          <KpiCard item={item} />
        </Col>
      ))}
    </Row>
  )
}
