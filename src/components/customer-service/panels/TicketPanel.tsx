/**
 * 工单详情（PRD §7.10 三种形态 + §7.11 补充与处理记录）。
 *
 * 三类工单的详情结构**不同**，这是 PRD 明写的，不要试图统一成一套对话视图：
 *   · 人工服务      对话形态，是主面板那场会话的归档回看，含服务评价，无写入口。
 *   · 转异步        对话形态 + 后台处理记录，底部开放回复。不展示五星评价。
 *   · 问题反馈      **表单形态，不使用对话气泡**。按反馈表单字段展示，Request ID 与
 *                   附件为空时整行不展示；底部只有「补充问题描述」，没有回复入口
 *                   （§7.11：它的客服沟通走电话或邮件，工单内不会出现客服消息）。
 *
 * 写入口一律按服务端能力位渲染（§4.6），不按状态字符串推 —— 能力不可用时不展示失效按钮。
 *
 * 已读口径按 §7.9 分两条：问题反馈打开详情即已读；转异步要等最新客服消息或状态变更
 * 真的滚进可视区域才推进游标。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuDownload, LuLoaderCircle, LuPaperclip, LuSendHorizontal } from 'react-icons/lu'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { cn } from '@/lib/utils'
import { formatDateTime, formatDateTimeYMD } from '@/lib/format-date'
import { ticketWriteAffordance } from '../machine'
import type {
  SupportAttachment,
  SupportTicketDetail,
  SupportTicketMessage,
} from '@/interfaces/support'

export interface TicketPanelProps {
  ticket: SupportTicketDetail | null
  loading: boolean
  error: boolean
  /** 回复 / 补充提交中 */
  submitting: boolean
  /** 上一次提交失败：保留已填内容并就地提示（技术方案 §7.1：失败保留输入与已选附件） */
  submitError: boolean
  onRetry: () => void
  onReply: (content: string, file: File | null) => Promise<boolean>
  onSupplement: (content: string, file: File | null) => Promise<boolean>
  onReopen: () => void
  onCreateFollowup: () => void
  onDownloadAttachment: (attachment: SupportAttachment) => void
  /** 推进已读游标 */
  onRead: (readSeq: number) => void
  onBackToList: () => void
}

export function TicketPanel(props: TicketPanelProps) {
  const { t } = useTranslation()
  const { ticket } = props

  if (props.loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-1.5 mg-text-caption text-mg-text-2">
        <LuLoaderCircle aria-hidden="true" className="animate-spin" size={14} />
        {t('common.customerService.ticket.loading')}
      </div>
    )
  }

  if (props.error || !ticket) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center" role="alert">
        <strong className="mg-text-body font-semibold text-mg-text-1">
          {t('common.customerService.ticket.errorTitle')}
        </strong>
        <p className="m-0 mg-text-meta leading-relaxed text-mg-text-2">
          {t('common.customerService.ticket.errorDesc')}
        </p>
        <div className="mt-1 flex gap-2">
          <Button onClick={props.onRetry} size="small" variant="outline">
            {t('common.customerService.records.retry')}
          </Button>
          <Button onClick={props.onBackToList} size="small" variant="ghost">
            {t('common.customerService.records.backToList')}
          </Button>
        </div>
      </div>
    )
  }

  return ticket.ticket_type === 'feedback'
    ? <FeedbackTicketBody {...props} ticket={ticket} />
    : <ConversationTicketBody {...props} ticket={ticket} />
}

/* ── 问题反馈：表单形态 ───────────────────────────────────────────────────── */

function FeedbackTicketBody(props: TicketPanelProps & { ticket: SupportTicketDetail }) {
  const { t } = useTranslation()
  const { ticket } = props
  const snapshot = ticket.feedback

  // §7.9：问题反馈的新消息只会是状态变更，状态就在标题旁，打开详情即视为已读
  useEffect(() => {
    props.onRead(ticket.latest_message_seq ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.ticket_id])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <MetaList
          rows={[
            { label: t('common.customerService.ticket.type'), value: ticket.display_type },
            { label: t('common.customerService.ticket.id'), value: ticket.ticket_id, mono: true },
            { label: t('common.customerService.ticket.submittedAt'), value: formatDateTimeYMD(ticket.created_at) },
            ...(ticket.updated_at !== ticket.created_at
              ? [{ label: t('common.customerService.ticket.updatedAt'), value: formatDateTimeYMD(ticket.updated_at) }]
              : []),
            ...(ticket.source_ticket_id
              ? [{ label: t('common.customerService.ticket.sourceTicket'), value: ticket.source_ticket_id, mono: true }]
              : []),
          ]}
        />

        {snapshot ? (
          <div className="mt-3 flex flex-col gap-3">
            <Field label={t('common.customerService.feedback.issueTypeLabel')}>
              <span className="mg-text-body text-mg-text-1">{snapshot.category}</span>
            </Field>

            <Field label={t('common.customerService.feedback.descriptionLabel')}>
              {/* 刻意不截断：§7.10 要求按反馈表单字段完整展示问题描述，
                  截成单行 + title 会让用户读不到自己提交的内容（ui-guard 的溢出 WARN 在此不适用） */}
              <p className="m-0 mg-text-body leading-relaxed text-mg-text-1">{snapshot.description}</p>
              {/* §7.11：补充以虚线分隔续写在问题描述之后，不呈现为独立消息 */}
              {(ticket.supplements ?? []).map((item) => (
                <div className="mt-2 border-t border-dashed border-mg-border pt-2" key={item.id}>
                  <p className="m-0 mb-1 mg-text-micro text-mg-text-3">
                    {t('common.customerService.ticket.supplementAt', { time: formatDateTime(item.created_at) })}
                  </p>
                  {item.content ? (
                    <p className="m-0 mg-text-body leading-relaxed text-mg-text-1">{item.content}</p>
                  ) : null}
                  {(item.attachments ?? []).map((attachment) => (
                    <AttachmentRow
                      attachment={attachment}
                      key={attachment.id}
                      onDownload={props.onDownloadAttachment}
                    />
                  ))}
                </div>
              ))}
            </Field>

            {/* Request ID 与附件为空时整行不展示（§7.10） */}
            {snapshot.occurred_at ? (
              <Field label={t('common.customerService.feedback.occurredAtLabel')}>
                <span className="mg-text-body text-mg-text-1">{formatDateTimeYMD(snapshot.occurred_at)}</span>
              </Field>
            ) : null}
            {snapshot.request_id ? (
              <Field label={t('common.customerService.feedback.requestIdLabel')}>
                <code className="font-mono mg-text-caption text-mg-text-1">{snapshot.request_id}</code>
              </Field>
            ) : null}
            {(snapshot.attachments ?? []).length > 0 ? (
              <Field label={t('common.customerService.feedback.attachmentLabel')}>
                {(snapshot.attachments ?? []).map((attachment) => (
                  <AttachmentRow
                    attachment={attachment}
                    key={attachment.id}
                    onDownload={props.onDownloadAttachment}
                  />
                ))}
              </Field>
            ) : null}
          </div>
        ) : null}

        <HandlingEvents ticket={ticket} />
        <Resolution ticket={ticket} />
      </div>

      <TicketFooter {...props} key={ticket.ticket_id} ticket={ticket} />
    </div>
  )
}

/* ── 人工服务 / 转异步：对话形态 ─────────────────────────────────────────── */

function ConversationTicketBody(props: TicketPanelProps & { ticket: SupportTicketDetail }) {
  const { t } = useTranslation()
  const { ticket } = props
  const messages = useMemo(() => ticket.messages ?? [], [ticket.messages])

  /** 最后一条客服或系统消息 —— §7.9：它进入可视区域才算已读 */
  const latestStaffMessage = useMemo(
    () => [...messages].reverse().find((item) => item.sender_type !== 'user'),
    [messages],
  )
  const readSeq = latestStaffMessage?.seq ?? 0
  const onRead = props.onRead
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const bindSentinel = useCallback((node: HTMLDivElement | null) => {
    sentinelRef.current = node
  }, [])

  useEffect(() => {
    const target = sentinelRef.current
    if (!target || readSeq === 0) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) onRead(readSeq)
    }, { threshold: 0.6 })
    observer.observe(target)
    return () => observer.disconnect()
  }, [onRead, readSeq])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <strong className="mg-text-body font-semibold text-mg-text-1">{ticket.title}</strong>
        <MetaList
          className="mt-2"
          rows={[
            { label: t('common.customerService.ticket.type'), value: ticket.display_type },
            { label: t('common.customerService.ticket.id'), value: ticket.ticket_id, mono: true },
            { label: t('common.customerService.ticket.createdAt'), value: formatDateTimeYMD(ticket.created_at) },
            { label: t('common.customerService.ticket.updatedAt'), value: formatDateTimeYMD(ticket.updated_at) },
            ...(ticket.source_ticket_id
              ? [{ label: t('common.customerService.ticket.sourceTicket'), value: ticket.source_ticket_id, mono: true }]
              : []),
            // §7.9：已取消不展示客服信息（取消发生在接通之前，尚未分配客服）
            ...(ticket.assignee_display_name && ticket.status !== 'cancelled'
              ? [{ label: t('common.customerService.ticket.assignee'), value: ticket.assignee_display_name }]
              : []),
          ]}
        />

        <div aria-label={t('common.customerService.ticket.timelineAria')} className="mt-3 flex flex-col gap-2">
          {messages.map((message) => (
            <TimelineItem
              bindSentinel={message.seq === readSeq ? bindSentinel : undefined}
              key={message.message_id}
              message={message}
              onDownload={props.onDownloadAttachment}
            />
          ))}
        </div>

        <HandlingEvents ticket={ticket} />
        <Resolution ticket={ticket} />
      </div>

      <TicketFooter {...props} key={ticket.ticket_id} ticket={ticket} />
    </div>
  )
}

function TimelineItem({
  message,
  bindSentinel,
  onDownload,
}: {
  message: SupportTicketMessage
  bindSentinel?: (node: HTMLDivElement | null) => void
  onDownload: (attachment: SupportAttachment) => void
}) {
  const { t } = useTranslation()
  const isUser = message.sender_type === 'user'
  const isSystem = message.kind === 'system' || message.sender_type === 'system'

  if (message.kind === 'rating') {
    return (
      <div className="text-center mg-text-meta text-mg-text-2" ref={bindSentinel}>
        {t('common.customerService.ticket.ratingLine', { rating: message.content })}
      </div>
    )
  }

  if (isSystem) {
    return (
      <div className="flex flex-col items-center gap-0.5 text-center" ref={bindSentinel}>
        <p className="m-0 mg-text-meta leading-relaxed text-mg-text-2">{message.content}</p>
        <time className="mg-text-micro text-mg-text-3">{formatDateTime(message.created_at)}</time>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')} ref={bindSentinel}>
      <div
        className={cn(
          'max-w-[88%] rounded-md px-3 py-2 mg-text-body leading-relaxed break-words',
          isUser
            ? 'border border-mg-fill-1 bg-mg-fill-1 text-mg-text-1'
            : 'border border-mg-border bg-mg-fill-0 text-mg-text-1',
        )}
      >
        {message.kind === 'attachment' && message.attachment ? (
          <AttachmentRow attachment={message.attachment} onDownload={onDownload} />
        ) : message.content}
      </div>
      <time className="mt-0.5 px-1 mg-text-micro text-mg-text-3">
        {formatDateTime(message.created_at)}
      </time>
    </div>
  )
}

/* ── 底部写入口：一律由能力位决定 ─────────────────────────────────────────── */

function TicketFooter(props: TicketPanelProps & { ticket: SupportTicketDetail }) {
  const { t } = useTranslation()
  const { ticket } = props
  const affordance = ticketWriteAffordance(ticket.capabilities)
  const [supplementOpen, setSupplementOpen] = useState(false)
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // 换工单时草稿要清空 —— 靠调用处 key={ticket.ticket_id} 重挂载本组件完成，
  // 不在 effect 里 setState（那会多渲染一帧且被 set-state-in-effect 拦）

  const canSubmit = Boolean(content.trim() || file)

  async function submit(handler: (value: string, chosen: File | null) => Promise<boolean>) {
    if (!canSubmit || props.submitting) return
    const ok = await handler(content, file)
    if (!ok) return
    setContent('')
    setFile(null)
    setSupplementOpen(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (affordance === 'none') return null

  if (affordance === 'closed-actions') {
    return (
      <footer className="flex justify-end gap-2 border-t border-mg-fill-0 px-4 py-3">
        {ticket.capabilities.can_reopen ? (
          <Button onClick={props.onReopen} size="small" variant="outline">
            {t('common.customerService.ticket.reopen')}
          </Button>
        ) : null}
        {ticket.capabilities.can_create_followup ? (
          <Button onClick={props.onCreateFollowup} size="small" variant="ghost">
            {t('common.customerService.ticket.createFollowup')}
          </Button>
        ) : null}
      </footer>
    )
  }

  if (affordance === 'supplement') {
    // §7.11：默认只展示按钮，点击后原地展开多行输入与附件选择
    if (!supplementOpen) {
      return (
        <footer className="border-t border-mg-fill-0 px-4 py-3">
          <Button onClick={() => setSupplementOpen(true)} size="small" variant="outline">
            {t('common.customerService.ticket.supplement')}
          </Button>
        </footer>
      )
    }
    return (
      <footer className="flex flex-col gap-2 border-t border-mg-fill-0 px-4 py-3">
        <label className="mg-text-meta text-mg-text-2" htmlFor="mg-cs-supplement">
          {t('common.customerService.ticket.supplement')}
        </label>
        <Textarea
          autoFocus
          id="mg-cs-supplement"
          onChange={(event) => setContent(event.target.value)}
          placeholder={t('common.customerService.ticket.supplementPlaceholder')}
          rows={3}
          value={content}
        />
        <AttachmentPicker file={file} inputRef={fileInputRef} onPick={setFile} />
        {props.submitError ? (
          <p className="m-0 mg-text-meta text-mg-danger" role="alert">
            {t('common.customerService.ticket.supplementFailed')}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button
            disabled={props.submitting}
            onClick={() => {
              setSupplementOpen(false)
              setContent('')
              setFile(null)
            }}
            size="small"
            variant="ghost"
          >
            {t('common.customerService.feedback.cancel')}
          </Button>
          <Button
            disabled={!canSubmit}
            loading={props.submitting}
            onClick={() => void submit(props.onSupplement)}
            size="small"
            variant="brand"
          >
            {t('common.customerService.ticket.supplementSubmit')}
          </Button>
        </div>
      </footer>
    )
  }

  // reply：转异步工单的工单内异步回复
  return (
    <footer className="flex flex-col gap-2 border-t border-mg-fill-0 px-4 py-3">
      <div className="flex items-center gap-2">
        <Input
          aria-label={t('common.customerService.ticket.replyAria')}
          onChange={(event) => setContent(event.target.value)}
          onEnterPress={() => void submit(props.onReply)}
          placeholder={t('common.customerService.ticket.replyPlaceholder')}
          value={content}
        />
        <Button
          aria-label={t('common.customerService.ticket.replySend')}
          disabled={!canSubmit}
          icon={<LuSendHorizontal size={14} />}
          loading={props.submitting}
          onClick={() => void submit(props.onReply)}
          size="small"
          variant="brand"
        />
      </div>
      <AttachmentPicker file={file} inputRef={fileInputRef} onPick={setFile} />
      {props.submitError ? (
        <p className="m-0 mg-text-meta text-mg-danger" role="alert">
          {t('common.customerService.ticket.replyFailed')}
        </p>
      ) : null}
    </footer>
  )
}

/* ── 公共小块 ─────────────────────────────────────────────────────────────── */

function MetaList({
  rows,
  className,
}: {
  rows: Array<{ label: string; value: string; mono?: boolean }>
  className?: string
}) {
  return (
    <dl className={cn('m-0 flex flex-col gap-1', className)}>
      {rows.map((row) => (
        <div className="flex items-baseline justify-between gap-3" key={row.label}>
          <dt className="shrink-0 mg-text-meta text-mg-text-2">{row.label}</dt>
          <dd className={cn('m-0 truncate mg-text-meta text-mg-text-1', row.mono && 'font-mono')}>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="mg-text-meta text-mg-text-2">{label}</span>
      {children}
    </div>
  )
}

function AttachmentRow({
  attachment,
  onDownload,
}: {
  attachment: SupportAttachment
  onDownload: (attachment: SupportAttachment) => void
}) {
  const { t } = useTranslation()
  return (
    <span className="mt-1 inline-flex max-w-full items-center gap-1 mg-text-meta text-mg-text-1">
      <LuPaperclip aria-hidden="true" className="shrink-0" size={11} />
      <span className="truncate" title={attachment.file_name}>{attachment.file_name}</span>
      <button
        aria-label={t('common.customerService.ticket.downloadAttachment', { name: attachment.file_name })}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-mg-text-2 hover:bg-mg-fill-0 hover:text-mg-text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-glow"
        onClick={() => onDownload(attachment)}
        type="button"
      >
        <LuDownload aria-hidden="true" size={12} />
      </button>
    </span>
  )
}

function AttachmentPicker({
  file,
  inputRef,
  onPick,
}: {
  file: File | null
  inputRef: React.RefObject<HTMLInputElement | null>
  onPick: (file: File | null) => void
}) {
  const { t } = useTranslation()
  return (
    <label className="inline-flex cursor-pointer items-center gap-1 mg-text-meta text-mg-text-2 hover:text-mg-text-1">
      <input
        aria-label={t('common.customerService.ticket.attachmentAria')}
        className="sr-only"
        onChange={(event) => onPick(event.target.files?.[0] ?? null)}
        ref={inputRef}
        type="file"
      />
      <LuPaperclip aria-hidden="true" size={12} />
      {file?.name ?? t('common.customerService.ticket.addAttachment')}
    </label>
  )
}

function HandlingEvents({ ticket }: { ticket: SupportTicketDetail }) {
  const { t } = useTranslation()
  const events = ticket.handling_events ?? []
  // §7.11：只有问题反馈与转异步展示处理记录；人工服务本身就是对话
  if (events.length === 0 || ticket.service_mode === 'live') return null
  return (
    <div aria-label={t('common.customerService.ticket.handlingTitle')} className="mt-4">
      <p className="m-0 mb-1.5 mg-text-meta font-bold tracking-wide text-mg-text-2">
        {t('common.customerService.ticket.handlingTitle')}
      </p>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {events.map((event) => (
          <li className="flex items-baseline gap-2" key={event.id}>
            <span aria-hidden="true" className="mt-1 size-1 shrink-0 rounded-full bg-mg-fill-2" />
            <span className="min-w-0 flex-1">
              <span className="mg-text-body text-mg-text-1">{event.summary}</span>
              <span className="ml-1.5 mg-text-micro text-mg-text-3">
                {event.actor_name} · {formatDateTime(event.created_at)}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Resolution({ ticket }: { ticket: SupportTicketDetail }) {
  const { t } = useTranslation()
  if (ticket.status !== 'resolved' || !ticket.resolution) return null
  return (
    <div className="mt-4">
      <Badge size="xs" variant="success">{t('common.customerService.ticket.resolution')}</Badge>
      <p className="mt-1.5 mb-0 mg-text-body leading-relaxed text-mg-text-1">{ticket.resolution}</p>
    </div>
  )
}
