import { describe, expect, it } from 'vitest'
import { resolveModelCategory, modelExperienceTasks, hasPlaygroundExperience } from './model-experience-data'
import type { CatalogModelItem } from '@/types'

function model(partial: Partial<CatalogModelItem>): CatalogModelItem {
  return { id: 'x', model_id: 'x', display_name: 'x', ...partial } as CatalogModelItem
}

// 口径变更（2026-07-31）：experience_types 后端将删除，类别与任务一律由
// input/output_modalities 推导；「暂未开放」= 推导任务集为空（PRD §AC-13）。

describe('resolveModelCategory（模态推导）', () => {
  it('omni 模型（多模态输入、纯文本输出）归对话类（#297）', () => {
    // seed-2-0-lite / mimo-v2-omni 实况
    expect(resolveModelCategory(model({
      input_modalities: ['text', 'image', 'video', 'audio'],
      output_modalities: ['text'],
    }))).toBe('dialogue')
  })

  it('输出含 image 的归图像类，即使兼具聊天能力（#297 回归）', () => {
    // gemini-3.1-flash-lite-image 实况
    expect(resolveModelCategory(model({
      input_modalities: ['text', 'image'],
      output_modalities: ['text', 'image'],
    }))).toBe('image')
  })

  it('输出含 video/audio 的按产物归类', () => {
    expect(resolveModelCategory(model({ input_modalities: ['text'], output_modalities: ['video'] }))).toBe('video')
    expect(resolveModelCategory(model({ input_modalities: ['text'], output_modalities: ['audio'] }))).toBe('audio')
  })

  it('纯音频输入 + 文本输出（ASR）归音频类，不是对话', () => {
    expect(resolveModelCategory(model({ input_modalities: ['audio'], output_modalities: ['text'] }))).toBe('audio')
  })

  it('输出 text+audio 的 omni 对话模型归对话类，不因兼具音频输出被列进 TTS（prd#821 回归）', () => {
    // qwen-omni-turbo 实况：audio 是 chat completions 的输出形态，不是 /v1/audio/speech 能力，
    // 归 audio 类会把它列进「文本转语音」入口，点了必失败（cn 该任务上线以来 0 成功）
    expect(resolveModelCategory(model({
      input_modalities: ['text', 'audio', 'image', 'video'],
      output_modalities: ['audio', 'text'],
    }))).toBe('dialogue')
  })
})

describe('modelExperienceTasks（任务推导）', () => {
  it('图像模型按输入模态推导 文生图/图生图', () => {
    expect(modelExperienceTasks(model({
      input_modalities: ['text', 'image'],
      output_modalities: ['image'],
    }))).toEqual(['text_to_image', 'image_to_image'])
  })

  it('视频模型输入含 image/video 时推导出图生视频与视频生视频（qa#584/shared#319 起 video_to_video 是第十类合法任务）', () => {
    expect(modelExperienceTasks(model({
      input_modalities: ['text', 'image', 'audio', 'video', 'file'],
      output_modalities: ['video'],
    }))).toEqual(['text_to_video', 'image_to_video', 'video_to_video'])
  })

  it('对话模型按输入模态推导 图生文/视频生文，音频输入不开对话子任务', () => {
    expect(modelExperienceTasks(model({
      input_modalities: ['text', 'image', 'video', 'audio'],
      output_modalities: ['text'],
    }))).toEqual(['text_to_text', 'image_to_text', 'video_to_text'])
  })

  it('ASR 模型推导出音频转文字', () => {
    expect(modelExperienceTasks(model({
      input_modalities: ['audio'],
      output_modalities: ['text'],
    }))).toEqual(['audio_to_text'])
  })

  it('专职 TTS（纯音频输出）推导出文本转语音', () => {
    expect(modelExperienceTasks(model({
      input_modalities: ['text'],
      output_modalities: ['audio'],
    }))).toEqual(['text_to_audio'])
  })

  it('omni 对话模型（out=text+audio）推导出对话类任务，无 text_to_audio（prd#821 回归）', () => {
    expect(modelExperienceTasks(model({
      input_modalities: ['text', 'audio', 'image', 'video'],
      output_modalities: ['audio', 'text'],
    }))).toEqual(['text_to_text', 'image_to_text', 'video_to_text'])
  })

  it('embedding 类（输出非文本非媒体）推导为空 = 暂未开放（§AC-13）', () => {
    const m = model({ input_modalities: ['text', 'image'], output_modalities: ['embedding'] })
    expect(modelExperienceTasks(m)).toEqual([])
    expect(hasPlaygroundExperience(m)).toBe(false)
  })

  it('老数据模态缺失时按文本对话兜底，不误伤存量 LLM', () => {
    const m = model({})
    expect(modelExperienceTasks(m)).toEqual(['text_to_text'])
    expect(hasPlaygroundExperience(m)).toBe(true)
  })
})
