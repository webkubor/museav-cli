/**
 * 指标切换 Tab（消费/请求/Token）。
 * 路由：/usage
 */

interface MetricTabProps {
  label: string
  active: boolean
  onClick: () => void
}

export function MetricTab({ label, active, onClick }: MetricTabProps) {
  return (
    <button
      onClick={onClick}
      className={active ? 'bg-mg-bg-1 text-mg-text-1' : 'bg-transparent text-mg-text-2'}
      style={{
        padding: '7px 20px',
        borderRadius: 'var(--radius-sm)',
        border: 'none',
        fontSize: '13.5px',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        boxShadow: active ? '0 1px 4px rgba(15,23,42,0.06)' : 'none', // allow-raw-color 激活 tab 微投影，无等值 shadow token（--shadow-sm 为多层结构）
      }}
    >
      {label}
    </button>
  )
}
