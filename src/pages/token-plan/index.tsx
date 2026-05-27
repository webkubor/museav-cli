import { IconStar } from '@douyinfe/semi-icons'

export default function TokenPlanPage() {
  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 700,
            color: '#0f172a',
            margin: '0 0 6px 0',
            letterSpacing: '-0.02em',
          }}
        >
          Token 套餐
        </h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0, fontWeight: 400 }}>
          按套餐购买 Token，享受更优惠的折扣价格。
        </p>
      </div>

      {/* Placeholder Card */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #f1f5f9',
          boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '96px 32px',
          gap: '20px',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            backgroundColor: '#f8fafc',
            border: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IconStar style={{ fontSize: '28px', color: '#94a3b8' }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: '17px',
              fontWeight: 700,
              color: '#0f172a',
              marginBottom: '8px',
              letterSpacing: '-0.01em',
            }}
          >
            Token 套餐
          </div>
          <div
            style={{
              fontSize: '13px',
              color: '#94a3b8',
              fontWeight: 400,
              lineHeight: '1.6',
            }}
          >
            套餐功能即将上线，敬请期待
          </div>
        </div>
      </div>
    </div>
  )
}
