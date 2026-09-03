/**
 * 问题反馈表单与提交回执卡片（智能客服 PRD v0.1 §7.5）。
 *
 * 形态真源：PRD §7.1 —— 反馈表单是助手悬浮面板的一种「模式」，中部内容区整块换成表单，
 * 不跳转、不开二层弹窗，底部不显示聊天输入。
 * 交互与文案真源：原型 `modelgo_prd/src/CustomerSupportFeedback.tsx`。
 * 视觉/排版对标控制台现状（参照 `src/pages/workspaces/workspace-create-modal.tsx` 的
 * 字段块结构：label 用 text-xs/font-bold/text-mg-text-2，控件走 ui/*，间距 gap-1.5 / gap-4），
 * 不照搬原型的手写控件。
 */

import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCircleCheckBig, LuPaperclip, LuX } from 'react-icons/lu'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { getRequestErrorMessage } from '@/lib/request-error-message'
import { supportGateway } from './gateway'
import {
  feedbackIssueTypes,
  type FeedbackDraft,
  type FeedbackErrors,
  type FeedbackIssueType,
  type FeedbackReceipt,
} from './feedback'

/** 表单 <form> 的 id：提交按钮渲染在面板底部栏，靠 form 属性跨 DOM 关联（同 Modal footer 的做法） */
export const FEEDBACK_FORM_ID = 'cs-feedback-form'

/** 问题类型 code → i18n key。写成静态映射而不是拼模板，改 key 时 TS 会指到这里 */
const ISSUE_TYPE_LABEL_KEY: Record<FeedbackIssueType, string> = {
  functionality: 'common.customerService.feedback.issueTypes.functionality',
  apiCall: 'common.customerService.feedback.issueTypes.apiCall',
  billing: 'common.customerService.feedback.issueTypes.billing',
  suggestion: 'common.customerService.feedback.issueTypes.suggestion',
  other: 'common.customerService.feedback.issueTypes.other',
}

/** 校验错误 code → i18n key */
const ERROR_LABEL_KEY = {
  issueTypeRequired: 'common.customerService.feedback.errors.issueTypeRequired',
  descriptionRequired: 'common.customerService.feedback.errors.descriptionRequired',
} as const

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-1 text-xs font-bold text-mg-text-2">
      <span>{children}</span>
      <span className="font-normal mg-text-micro text-mg-text-3">
        {required ? t('common.customerService.feedback.required') : t('common.customerService.feedback.optional')}
      </span>
    </div>
  )
}

function FieldError({ id, code }: { id: string; code?: keyof typeof ERROR_LABEL_KEY }) {
  const { t } = useTranslation()
  if (!code) return null
  return (
    <p className="m-0 mg-text-meta text-mg-danger" id={id} role="alert">
      {t(ERROR_LABEL_KEY[code])}
    </p>
  )
}

export interface FeedbackFormProps {
  draft: FeedbackDraft
  errors: FeedbackErrors
  onChange: (patch: Partial<FeedbackDraft>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function FeedbackForm({ draft, errors, onChange, onSubmit }: FeedbackFormProps) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  /**
   * 选中文件即上传换 ID（技术方案 §6.6：附件先经 web-api 上传到 OSS 换回引用，再带 ID 建单）。
   * 类型 / 大小 / 数量与病毒扫描由服务端校验，失败把服务端消息如实展示，不静默吞掉。
   */
  async function handlePickFile(file: File | undefined) {
    if (!file) return
    setUploadError(null)
    setUploading(true)
    try {
      const attachment = await supportGateway.uploadAttachment(file)
      onChange({ attachmentId: attachment.id, attachmentName: attachment.file_name || file.name })
    } catch (error) {
      if (fileRef.current) fileRef.current.value = ''
      onChange({ attachmentId: '', attachmentName: '' })
      setUploadError(getRequestErrorMessage(error, t('common.customerService.feedback.attachmentFailed')))
    } finally {
      setUploading(false)
    }
  }

  return (
    <section aria-labelledby="cs-feedback-title" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="m-0 mg-text-body font-bold text-mg-text-1" id="cs-feedback-title">
          {t('common.customerService.feedback.title')}
        </h2>
        <p className="m-0 mg-text-meta leading-relaxed text-mg-text-3">
          {t('common.customerService.feedback.subtitle')}
        </p>
      </header>

      <form className="flex flex-col gap-4" id={FEEDBACK_FORM_ID} onSubmit={onSubmit}>
        <div className="flex flex-col gap-1.5">
          <FieldLabel required>{t('common.customerService.feedback.issueTypeLabel')}</FieldLabel>
          <Select
            value={draft.issueType || undefined}
            onChange={(value) => onChange({ issueType: value as FeedbackIssueType })}
            placeholder={t('common.customerService.feedback.issueTypePlaceholder')}
          >
            {feedbackIssueTypes.map((issueType) => (
              <Select.Option key={issueType} value={issueType}>
                {t(ISSUE_TYPE_LABEL_KEY[issueType])}
              </Select.Option>
            ))}
          </Select>
          <FieldError code={errors.issueType} id="cs-feedback-issue-type-error" />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel required>{t('common.customerService.feedback.descriptionLabel')}</FieldLabel>
          <Textarea
            aria-describedby={errors.description ? 'cs-feedback-description-error' : undefined}
            aria-invalid={Boolean(errors.description)}
            aria-label={t('common.customerService.feedback.descriptionLabel')}
            className="min-h-[76px]"
            onChange={(event) => onChange({ description: event.target.value })}
            placeholder={t('common.customerService.feedback.descriptionPlaceholder')}
            rows={3}
            value={draft.description}
          />
          <FieldError code={errors.description} id="cs-feedback-description-error" />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel>{t('common.customerService.feedback.occurredAtLabel')}</FieldLabel>
          <Input
            aria-label={t('common.customerService.feedback.occurredAtLabel')}
            onChange={(event) => onChange({ occurredAt: event.target.value })}
            type="datetime-local"
            value={draft.occurredAt}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel>{t('common.customerService.feedback.requestIdLabel')}</FieldLabel>
          <Input
            aria-label={t('common.customerService.feedback.requestIdLabel')}
            onChange={(event) => onChange({ requestId: event.target.value })}
            placeholder={t('common.customerService.feedback.requestIdPlaceholder')}
            value={draft.requestId}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel>{t('common.customerService.feedback.attachmentLabel')}</FieldLabel>
          <input
            aria-label={t('common.customerService.feedback.attachmentLabel')}
            className="hidden"
            onChange={(event) => { void handlePickFile(event.target.files?.[0]) }}
            ref={fileRef}
            type="file"
          />
          <div className="flex items-center gap-2">
            <Button
              icon={<LuPaperclip size={13} />}
              loading={uploading}
              onClick={() => fileRef.current?.click()}
              size="small"
              variant="outline"
            >
              {uploading
                ? t('common.customerService.feedback.attachmentUploading')
                : t('common.customerService.feedback.attachmentPick')}
            </Button>
            {draft.attachmentName && (
              <span className="flex min-w-0 items-center gap-1 mg-text-meta text-mg-text-2">
                <span className="truncate">{draft.attachmentName}</span>
                <button
                  aria-label={t('common.customerService.feedback.attachmentClear')}
                  className="shrink-0 text-mg-text-3 transition-colors hover:text-mg-text-1"
                  onClick={() => {
                    if (fileRef.current) fileRef.current.value = ''
                    setUploadError(null)
                    onChange({ attachmentId: '', attachmentName: '' })
                  }}
                  type="button"
                >
                  <LuX size={12} />
                </button>
              </span>
            )}
          </div>
          {uploadError && (
            <p className="m-0 mg-text-meta text-mg-danger" role="alert">{uploadError}</p>
          )}
        </div>
      </form>
    </section>
  )
}

/**
 * 提交成功后写进对话流的「反馈已提交」卡片（PRD §7.5：编号 + 状态 + 预计响应时间 + 类型 + 描述）。
 * 编号、状态文案与预计响应时间都来自服务端：状态标签用 `status_label`，
 * 预计响应时间服务端没下发就整行不展示（技术方案 §13：该承诺值是配置项，不由前端写死）。
 */
export function FeedbackReceiptCard({ receipt }: { receipt: FeedbackReceipt }) {
  const { t } = useTranslation()
  const rows: Array<{ label: string; value: string }> = [
    { label: t('common.customerService.feedback.receipt.idLabel'), value: receipt.ticketId },
    ...(receipt.expectedResponseLabel
      ? [{ label: t('common.customerService.feedback.receipt.etaLabel'), value: receipt.expectedResponseLabel }]
      : []),
    { label: t('common.customerService.feedback.receipt.issueTypeLabel'), value: t(ISSUE_TYPE_LABEL_KEY[receipt.issueType]) },
    { label: t('common.customerService.feedback.receipt.summaryLabel'), value: receipt.summary },
  ]

  return (
    <article
      aria-label={t('common.customerService.feedback.receipt.ariaLabel', { id: receipt.ticketId })}
      className="mg-tile mb-4 flex flex-col gap-2 p-3"
    >
      <header className="flex items-center gap-2">
        <LuCircleCheckBig className="text-mg-success" size={15} />
        <strong className="text-xs font-bold text-mg-text-1">
          {t('common.customerService.feedback.receipt.title')}
        </strong>
        {/* 状态展示只认服务端下发的 status_label；前端不按 status 字符串拼中文（技术方案 §4.5/§4.6） */}
        <Badge className="ml-auto" size="xs" variant={receipt.status === 'pending' ? 'warning' : 'secondary'}>
          {receipt.statusLabel}
        </Badge>
      </header>
      <dl className="m-0 flex flex-col gap-1">
        {rows.map((row) => (
          <div className="flex gap-2 mg-text-meta" key={row.label}>
            <dt className="w-16 shrink-0 text-mg-text-3">{row.label}</dt>
            <dd className="m-0 min-w-0 flex-1 break-words text-mg-text-1">{row.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}
