/**
 * 侧边抽屉无障碍语义测试
 * 路由：全局复用
 * API：无
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SideSheet } from '@/components/ui/SideSheet'

describe('SideSheet', () => {
  it('无可见标题时使用 ariaTitle 提供对话框名称', () => {
    render(
      <SideSheet open onClose={() => {}} title={null} ariaTitle="调用日志详情">
        日志内容
      </SideSheet>,
    )

    expect(screen.getByRole('dialog', { name: '调用日志详情' })).toBeInTheDocument()
  })
})
