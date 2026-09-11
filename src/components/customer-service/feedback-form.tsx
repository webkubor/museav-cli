import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Input } from '@/components/ui/Input'
import { Select, SelectItem } from '@/components/ui/Select'
import { trackEvent } from '@/lib/track'

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
  const [occurredAt, setOccurredAt] = useState('')
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

      <div className="flex flex-col gap-1">
        <label className="mg-text-caption font-medium text-mg-text-2">{t('common.customerService.feedback.category')}</label>
        <Select value={category} onChange={setCategory} placeholder={t('common.customerService.feedback.categoryPlaceholder')}>
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
        />
        {errors.description && <span className="mg-text-caption text-mg-danger">{errors.description}</span>}
      </div>

      <div className="flex flex-col gap-1">
        <label className="mg-text-caption font-medium text-mg-text-2">{t('common.customerService.feedback.occurredAt')}</label>
        <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1">
        <label className="mg-text-caption font-medium text-mg-text-2">{t('common.customerService.feedback.requestId')}</label>
        <Input value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder={t('common.customerService.feedback.requestIdPlaceholder')} />
      </div>

      <div className="flex flex-col gap-1">
        <label className="mg-text-caption font-medium text-mg-text-2">{t('common.customerService.feedback.attachment')}</label>
        {/* ponytail: 仅展示文件名，OSS 直传较重，先留 TODO；不阻断反馈提交主链路 */}
        <label className="mg-tile flex items-center justify-between px-3 py-2 mg-text-caption text-mg-text-3 cursor-pointer hover:border-brand-mid/50">
          <span className="truncate">{fileName || t('common.customerService.feedback.attachmentPlaceholder')}</span>
          <input
            type="file"
            className="hidden"
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
