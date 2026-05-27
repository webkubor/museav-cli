import { useState } from 'react'
import { Button, Input, Switch, Toast, Typography } from '@douyinfe/semi-ui'

const { Title, Text } = Typography

// ─── Card shell ─────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '12px',
  border: '1px solid #f1f5f9',
  padding: '28px',
  boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
  marginBottom: '24px',
}

const cardTitleStyle: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 600,
  color: '#0f172a',
  marginBottom: '4px',
}

const cardDescStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#64748b',
  marginBottom: '20px',
}

// ─── Low-balance alarm card ──────────────────────────────────────────────────

function LowBalanceCard() {
  const [enabled, setEnabled] = useState(true)
  const [threshold, setThreshold] = useState('10')

  function handleSave() {
    // Intentionally no-op — API not yet available
    Toast.info('该功能即将上线')
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={cardTitleStyle}>低余额告警</div>
          <div style={cardDescStyle}>当账户余额低于设定值时，发送告警通知。</div>
        </div>
        <Switch
          checked={enabled}
          onChange={(val) => setEnabled(val)}
          style={{ marginTop: '2px' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '360px' }}>
        <Text style={{ fontSize: '13px', color: '#64748b', whiteSpace: 'nowrap' }}>
          告警阈值
        </Text>
        <Input
          value={threshold}
          onChange={(val) => setThreshold(val)}
          disabled={!enabled}
          prefix="$"
          suffix="USD"
          style={{ flex: 1 }}
          placeholder="10"
        />
        <Button disabled onClick={handleSave} style={{ whiteSpace: 'nowrap' }}>
          即将上线
        </Button>
      </div>
    </div>
  )
}

// ─── Error-rate alarm card ───────────────────────────────────────────────────

function ErrorRateCard() {
  const [enabled, setEnabled] = useState(false)
  const [threshold, setThreshold] = useState('5')

  function handleSave() {
    Toast.info('该功能即将上线')
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={cardTitleStyle}>错误率告警</div>
          <div style={cardDescStyle}>
            当 API 调用错误率（5xx）超过设定阈值时，发送告警通知。
          </div>
        </div>
        <Switch
          checked={enabled}
          onChange={(val) => setEnabled(val)}
          style={{ marginTop: '2px' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '360px' }}>
        <Text style={{ fontSize: '13px', color: '#64748b', whiteSpace: 'nowrap' }}>
          错误率阈值
        </Text>
        <Input
          value={threshold}
          onChange={(val) => setThreshold(val)}
          disabled={!enabled}
          suffix="%"
          style={{ flex: 1 }}
          placeholder="5"
        />
        <Button disabled onClick={handleSave} style={{ whiteSpace: 'nowrap' }}>
          即将上线
        </Button>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AlarmsSettingsPage() {
  return (
    <div style={{ maxWidth: '720px' }}>
      <div style={{ marginBottom: '32px' }}>
        <Title
          heading={2}
          style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}
        >
          告警配置
        </Title>
        <Text style={{ color: '#64748b', fontSize: '14px', marginTop: '6px', display: 'block' }}>
          告警通知将发送至账号绑定邮箱。
        </Text>
      </div>

      <LowBalanceCard />
      <ErrorRateCard />
    </div>
  )
}
