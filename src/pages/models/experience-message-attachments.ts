/**
 * 模型体验消息附件的展示地址解析。
 *
 * 会话消息接口只返回 OSS resource_id，不能直接作为 img/audio/video 的 src；这里统一换成
 * 可访问的短期 URL，单模型页和对比页恢复历史时共用，避免任一入口遗漏附件。
 */
import {
  getExperienceAttachmentUrl,
  type ExperienceMessageAttachment,
} from '@/services/experience-sessions'
import type { ExperienceMediaResult } from './model-experience-data'

export interface ResolvedExperienceMessageMedia {
  media: ExperienceMediaResult[]
  hasFailures: boolean
}

/** 逐个解析，单个附件取 URL 失败不阻断同一条消息中其余附件的展示。 */
export async function resolveExperienceMessageMedia(
  attachments: ExperienceMessageAttachment[],
): Promise<ResolvedExperienceMessageMedia> {
  const results = await Promise.all(attachments.map(async (attachment) => {
    try {
      const { url } = await getExperienceAttachmentUrl(attachment.resource_id)
      return url ? { kind: attachment.kind, url } : null
    } catch {
      return null
    }
  }))
  const media = results.filter((item): item is ExperienceMediaResult => item !== null)
  return { media, hasFailures: media.length !== attachments.length }
}
