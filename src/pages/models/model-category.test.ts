import { describe, expect, it } from 'vitest'
import { resolveModelCategory } from './model-experience-data'
import type { CatalogModelItem } from '@/types'

function model(partial: Partial<CatalogModelItem>): CatalogModelItem {
  return { id: 'x', model_id: 'x', display_name: 'x', ...partial } as CatalogModelItem
}

describe('resolveModelCategory', () => {
  it('omni 模型（文本输出）不受 experience_types 字母序影响，归对话类（#297）', () => {
    // seed-2-0-lite / mimo-v2-omni 实况：audio_to_text 按字母序排最前
    expect(resolveModelCategory(model({
      experience_types: ['audio_to_text', 'image_to_text', 'text_to_text', 'video_to_text'],
      input_modalities: ['text', 'image', 'video', 'audio'],
      output_modalities: ['text'],
    }))).toBe('dialogue')
  })

  it('跨类别时按输出模态挑主类别：输出含 image 的归图像类', () => {
    // gemini-3.1-flash-lite-image 实况
    expect(resolveModelCategory(model({
      experience_types: ['image_to_image', 'image_to_text', 'text_to_image', 'text_to_text'],
      input_modalities: ['text', 'image'],
      output_modalities: ['text', 'image'],
    }))).toBe('image')
  })

  it('单类别声明直接归该类别', () => {
    expect(resolveModelCategory(model({
      experience_types: ['text_to_video'],
      output_modalities: ['video'],
    }))).toBe('video')
  })

  it('experience_types 缺失时按输出模态兜底', () => {
    expect(resolveModelCategory(model({ output_modalities: ['audio'] }))).toBe('audio')
    expect(resolveModelCategory(model({ output_modalities: ['text'] }))).toBe('dialogue')
  })
})
