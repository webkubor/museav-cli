import { describe, expect, it, vi } from 'vitest'
import { getExperienceAttachmentUrl } from '@/services/experience-sessions'
import { resolveExperienceMessageMedia } from './experience-message-attachments'

vi.mock('@/services/experience-sessions', () => ({
  getExperienceAttachmentUrl: vi.fn(),
}))

describe('resolveExperienceMessageMedia', () => {
  it('converts resource ids into renderable media URLs while preserving attachment kinds', async () => {
    vi.mocked(getExperienceAttachmentUrl)
      .mockResolvedValueOnce({ url: 'https://cdn.example.com/voice.mp3', expires_at: '2026-07-30T13:00:00Z' })
      .mockResolvedValueOnce({ url: 'https://cdn.example.com/reference.png', expires_at: '2026-07-30T13:00:00Z' })

    await expect(resolveExperienceMessageMedia([
      { resource_id: 'voice', kind: 'audio', mime: 'audio/mpeg', size: 12 },
      { resource_id: 'image', kind: 'image', mime: 'image/png', size: 34 },
    ])).resolves.toEqual({
      media: [
        { kind: 'audio', url: 'https://cdn.example.com/voice.mp3' },
        { kind: 'image', url: 'https://cdn.example.com/reference.png' },
      ],
      hasFailures: false,
    })
  })

  it('keeps the rest of a message visible when one attachment URL cannot be resolved', async () => {
    vi.mocked(getExperienceAttachmentUrl)
      .mockRejectedValueOnce(new Error('expired'))
      .mockResolvedValueOnce({ url: 'https://cdn.example.com/video.mp4', expires_at: '2026-07-30T13:00:00Z' })

    await expect(resolveExperienceMessageMedia([
      { resource_id: 'expired', kind: 'image', mime: 'image/png', size: 12 },
      { resource_id: 'video', kind: 'video', mime: 'video/mp4', size: 34 },
    ])).resolves.toEqual({
      media: [{ kind: 'video', url: 'https://cdn.example.com/video.mp4' }],
      hasFailures: true,
    })
  })
})
