/** 全站 Markdown 渲染行为回归：裸文本不误链，显式链接安全地新窗口打开。 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MarkdownContent } from './MarkdownContent'

describe('MarkdownContent', () => {
  it('keeps bare URLs and email addresses as plain text', () => {
    render(<MarkdownContent>{'版本 v1.0.7，网址 https://example.com 和邮箱 dev@example.com'}</MarkdownContent>)

    expect(screen.getByText(/版本 v1\.0\.7，网址 https:\/\/example\.com 和邮箱 dev@example\.com/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('opens explicit Markdown links in a new tab with safe rel attributes', () => {
    render(<MarkdownContent>{'[帮助文档](https://example.com/help) 和 <https://example.org>'}</MarkdownContent>)

    expect(screen.getByRole('link', { name: '帮助文档' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: '帮助文档' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: 'https://example.org' })).toHaveAttribute('target', '_blank')
  })

  it('keeps a bare documentation URL clickable without swallowing adjacent Chinese text', () => {
    render(
      <MarkdownContent linkifyBareUrls>
        {'参考文档：https://docs.example.com/quickstart/authentication、首次调用：查看指南'}
      </MarkdownContent>,
    )

    const link = screen.getByRole('link', { name: 'https://docs.example.com/quickstart/authentication' })
    expect(link).toHaveAttribute('href', 'https://docs.example.com/quickstart/authentication')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(document.querySelector('.cs-markdown p')?.textContent).toContain('、首次调用：查看指南')
  })

  it('keeps GFM tables while disabling bare-URL autolinking', () => {
    render(<MarkdownContent>{'| 名称 | 地址 |\n| --- | --- |\n| 文档 | https://example.com |'}</MarkdownContent>)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
