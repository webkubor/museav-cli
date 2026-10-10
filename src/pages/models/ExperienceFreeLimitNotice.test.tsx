/**
 * 免费模型日限额提示条（需求方 #833 场景三）：文案逐字钉住单内定稿表格，
 * 「查看用量」必须落到用量统计页 /usage。
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeAll, describe, expect, it } from 'vitest'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import { ExperienceFreeLimitNotice } from './ExperienceFreeLimitNotice'

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="path">{location.pathname}</output>
}

beforeAll(async () => {
  await loadLocaleNamespaces(['modelsExperience'], 'zh')
  await i18n.changeLanguage('zh')
})

describe('免费模型日限额提示条 · 场景三（#833）', () => {
  it('标题与说明逐字对齐单内表格，按钮是「查看用量」', () => {
    render(
      <MemoryRouter initialEntries={['/models']}>
        <ExperienceFreeLimitNotice />
      </MemoryRouter>,
    )
    expect(screen.getByText('今日免费调用已达上限')).toBeTruthy()
    expect(
      // #1215/#1231：日限额次数由后端配置（海外改为 50），文案不再写死次数
      screen.getByText('额度将于明日 00:00 恢复。你也可以切换至其他模型继续使用。', { exact: false }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: '查看用量' })).toBeTruthy()
  })

  it('点「查看用量」跳到用量统计页 /usage', () => {
    render(
      <MemoryRouter initialEntries={['/models']}>
        <Routes>
          <Route path="*" element={<><ExperienceFreeLimitNotice /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: '查看用量' }))
    expect(screen.getByTestId('path').textContent).toBe('/usage')
  })
})
