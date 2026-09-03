/**
 * 「已转为异步问题单」内联卡片（PRD §7.6.1）。
 *
 * 卡片本身只是回执 —— PRD 明确它**不提供编辑、撤销或催办入口**，工单详情、后续沟通与
 * 处理记录都走服务记录。所以这里没有任何动作按钮，是刻意的。
 *
 * 版面按 §7.6.1 的四层信息表落：
 *   标题行   时钟图标 + 「已转为异步问题单」用品牌色，状态以品牌浅底胶囊右对齐
 *   原因说明 紧随标题行，辅助文字色
 *   关键信息 两行键值，标签左、值右，编号完整展示（不截断）
 *   联系说明 与上方以细分隔线区隔，明确用户无需停留等待
 *
 * 状态文案与预计联系时长都取服务端下发（`status_label` / `expected_contact_label`），
 * 前端不写死「待客服联系」「2 小时内」—— 技术方案 §13 明确这类承诺值是服务端配置项。
 */

import { LuClock3 } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'

export interface AsyncTicketCardData {
  ticketId: string
  /** 服务端下发的状态展示文案，如「待客服联系」 */
  statusLabel: string
  /** 转异步原因，来自事件 payload.message */
  reason: string
  /** 预计联系时长文案；服务端没给就不展示这一行 */
  expectedContactLabel?: string
}

export function AsyncTicketCard({ data }: { data: AsyncTicketCardData }) {
  const { t } = useTranslation()
  return (
    <article
      aria-label={t('common.customerService.asyncTicket.ariaLabel', { id: data.ticketId })}
      className="mg-tile mb-4 p-4"
    >
      <header className="flex items-center gap-2">
        <LuClock3 aria-hidden="true" className="text-brand-base" size={16} />
        <strong className="mg-text-body font-semibold text-brand-base">
          {t('common.customerService.asyncTicket.title')}
        </strong>
        <Badge className="ml-auto" size="sm" variant="brand">{data.statusLabel}</Badge>
      </header>

      <p className="mt-2 mb-0 text-[12px] leading-relaxed text-mg-text-2">{data.reason}</p>

      <dl className="mt-3 mb-0 flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[11px] text-mg-text-2">{t('common.customerService.asyncTicket.idLabel')}</dt>
          <dd className="m-0 font-mono text-[12px] text-mg-text-1">{data.ticketId}</dd>
        </div>
        {data.expectedContactLabel ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[11px] text-mg-text-2">{t('common.customerService.asyncTicket.etaLabel')}</dt>
            <dd className="m-0 text-[12px] text-mg-text-1">{data.expectedContactLabel}</dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-3 mb-0 border-t border-mg-border pt-2.5 text-[11px] leading-relaxed text-mg-text-2">
        {t('common.customerService.asyncTicket.contact')}
      </p>
    </article>
  )
}
