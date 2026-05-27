interface Props { password: string }

type Level = 0 | 1 | 2 | 3

function getLevel(password: string): Level {
  if (!password) return 0
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password) || /[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  if (score <= 1) return 1
  if (score === 2) return 2
  return 3
}

const LEVELS = {
  1: { label: '弱',   bars: 1, color: '#f43f5e', gradient: 'linear-gradient(90deg, #e11d48, #fb7185)' },
  2: { label: '中',   bars: 2, color: '#f59e0b', gradient: 'linear-gradient(90deg, #d97706, #fbbf24)' },
  3: { label: '强',   bars: 3, color: '#10b981', gradient: 'linear-gradient(90deg, #059669, #34d399)' },
} as const

export function PasswordStrength({ password }: Props) {
  const level = getLevel(password)
  if (!password || level === 0) return null
  const config = LEVELS[level]

  return (
    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
        {[1, 2, 3].map((bar) => (
          <div
            key={bar}
            style={{
              height: '3px',
              flex: 1,
              borderRadius: '99px',
              transition: 'all 0.4s ease',
              background: bar <= config.bars ? config.gradient : '#e2e8f0',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: '11px', fontWeight: 600, color: config.color, flexShrink: 0 }}>
        {config.label}
      </span>
    </div>
  )
}
