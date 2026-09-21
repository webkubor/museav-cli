import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Input } from '@/components/ui/Input'
import { DateTimePicker } from '@/components/ui/DateTimePicker'
import { Select, SelectItem } from '@/components/ui/Select'
import { trackEvent } from '@/lib/track'

/**
 * `<input type="datetime-local">` 要的本地时间串：YYYY-MM-DDTHH:mm。
 * 不能用 toISOString() —— 那是 UTC，会把用户填的时间平移时区。
 * 口径照 PRD 原型 customerSupportDomain.ts 的 formatLocalDateTime。
 */
function localDateTimeValue(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`
}

/** 问题类型枚举值：后端字段名 category，取值按 issue 契约的五类问题类型语义命名 */
const CATEGORIES = ['bug', 'api_issue', 'billing', 'suggestion', 'other'] as const
export type FeedbackCategory = typeof CATEGORIES[number]

export interface FeedbackFormProps {
  submitting: boolean
  onCancel: () => void
  onSubmit: (fields: { category: string; description: string; occurred_at?: string; request_id?: string }) => Promise<boolean>
}

export function FeedbackForm({ submitting, onCancel, onSubmit }: FeedbackFormProps) {
  const { t } = useTranslation()
  const [category, setCategory] = useState<string>('')
  const [description, setDescription] = useState('')
  // PRD §8.5「发生时间 | 否 | **默认当前本地时间**，可修改」，原型
  // createEmptyFeedbackDraft() 也是拿 new Date() 填的（customerSupportDomain.ts）。
  // 原先初值是空串 —— 用户不点就不带发生时间，排查时少一个关键锚点。
  // 格式对齐 <input type="datetime-local"> 要的 YYYY-MM-DDTHH:mm（本地时区，不是 ISO/UTC）。
  const [occurredAt, setOccurredAt] = useState(() => localDateTimeValue(new Date()))
  const [requestId, setRequestId] = useState('')
  const [fileName, setFileName] = useState('')
  const [errors, setErrors] = useState<{ category?: string; description?: string }>({})

  async function handleSubmit() {
    const trimmedDescription = description.trim()
    const nextErrors: typeof errors = {}
    if (!category) nextErrors.category = t('common.customerService.feedback.categoryRequired')
    if (!trimmedDescription) nextErrors.description = t('common.customerService.feedback.descriptionRequired')
    setErrors(nextErrors)
    if (nextErrors.category || nextErrors.description) return

    trackEvent('support_feedback_submit')
    const ok = await onSubmit({
      category,
      description: trimmedDescription,
      occurred_at: occurredAt || undefined,
      request_id: requestId.trim() || undefined,
    })
    if (ok) {
      setCategory('')
      setDescription('')
      setOccurredAt('')
      setRequestId('')
      setFileName('')
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 overflow-y-auto flex-1">
      <p className="mg-text-caption text-mg-text-3">{t('common.customerService.feedback.hint')}</p>

      {/* 每个控件都带 aria-label（照 PRD 原型 CustomerSupportFeedback.tsx）：
          这里的 <label> 是游离的视觉标签、没有 htmlFor 关联，读屏靠 aria-label 才能
          念出字段名。用 aria-label 而非 htmlFor+id，是因为 Select/Textarea/Input
          都是封装组件、内部 id 不由本页控制。 */}
      <div className="flex flex-col gap-1">
        <label className="mg-text-caption font-medium text-mg-text-2">{t('common.customerService.feedback.category')}</label>
        <Select
          value={category}
          onChange={setCategory}
          placeholder={t('common.customerService.feedback.categoryPlaceholder')}
          aria-label={t('common.customerService.feedback.category')}
        >
          {CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>{t(`common.customerService.feedback.categoryOptions.${c}`)}</SelectItem>
          ))}
        </Select>
        {errors.category && <span className="mg-text-caption text-mg-danger">{errors.category}</span>}
      </div>

      <div className="flex flex-col gap-1">
        <label className="mg-text-caption font-medium text-mg-text-2">{t('common.customerService.feedback.description')}</label>
        <Textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('common.customerService.feedback.descriptionPlaceholder')}
          aria-label={t('common.customerService.feedback.description')}
        />
        {errors.description && <span className="mg-text-caption text-mg-danger">{errors.description}</span>}
      </div>

      <div className="flex flex-col gap-1">
        <label className="mg-text-caption font-medium text-mg-text-2">{t('common.customerService.feedback.occurredAt')}</label>
        <DateTimePicker
          value={occurredAt}
          onChange={setOccurredAt}
          aria-label={t('common.customerService.feedback.occurredAt')}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="mg-text-caption font-medium text-mg-text-2">{t('common.customerService.feedback.requestId')}</label>
        <Input
          value={requestId}
          onChange={(e) => setRequestId(e.target.value)}
          placeholder={t('common.customerService.feedback.requestIdPlaceholder')}
          aria-label={t('common.customerService.feedback.requestId')}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="mg-text-caption font-medium text-mg-text-2">{t('common.customerService.feedback.attachment')}</label>
        {/* ponytail: 仅展示文件名，OSS 直传较重，先留 TODO；不阻断反馈提交主链路 */}
        <label className="mg-tile flex items-center justify-between px-3 py-2 mg-text-caption text-mg-text-3 cursor-pointer hover:border-brand-mid/50">
          <span className="truncate">{fileName || t('common.customerService.feedback.attachmentPlaceholder')}</span>
          <input
            type="file"
            className="hidden"
            aria-label={t('common.customerService.feedback.attachment')}
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
          />
        </label>
      </div>

      <div className="mt-auto flex justify-end gap-2 pt-2">
        <Button variant="secondary" size="small" onClick={onCancel} disabled={submitting}>
          {t('common.customerService.feedback.cancel')}
        </Button>
        <Button variant="brand" size="small" onClick={handleSubmit} loading={submitting}>
          {t('common.customerService.feedback.submit')}
        </Button>
      </div>
    </div>
  )
}
