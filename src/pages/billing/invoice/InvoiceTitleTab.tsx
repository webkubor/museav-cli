/**
 * 发票抬头页（PRD 1.0.4 §8.7.3.1）
 * 列表（普票/专票，设默认）↔ 新增抬头表单：票种/抬头名称/税号/接收邮箱 4 项，
 * 普票专票字段一致（PRD 未区分，续 #531）。
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LuPlus, LuArrowLeft, LuTrash2 } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { appToast } from '@/lib/app-toast'
import { trackEvent } from '@/lib/track'
import {
  listInvoiceTitles,
  createInvoiceTitle,
  setDefaultInvoiceTitle,
  deleteInvoiceTitle,
} from '@/services/invoice'
import type { InvoiceTitleType, CreateInvoiceTitleRequest } from '@/types'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'

const EMPTY_FORM: CreateInvoiceTitleRequest = {
  type: 'vat_normal',
  company_name: '',
  tax_id: '',
  email: '',
}

export function InvoiceTitleTab({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation('billing')
  const qc = useQueryClient()
  const { hasPermission } = usePermissions()
  const canManageTitles = hasPermission(PERMS.BILLING_INVOICE_TITLE_MANAGE)
  const [view, setView] = useState<'list' | 'form'>('list')
  const [form, setForm] = useState<CreateInvoiceTitleRequest>(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['invoice', 'titles', tenantId],
    queryFn: () => listInvoiceTitles(tenantId),
    enabled: Boolean(tenantId),
  })
  const titles = data?.items ?? []

  const setDefault = useMutation({
    mutationFn: (id: string) => setDefaultInvoiceTitle(tenantId, id),
    onSuccess: () => {
      appToast.success(t('billing.invoice.setDefaultSuccess'))
      trackEvent('billing.invoice_title:set_default', undefined, { result: 'success' })
      qc.invalidateQueries({ queryKey: ['invoice', 'titles', tenantId] })
    },
    onError: (err: Error) => {
      appToast.requestError(err, t('billing.invoice.setDefaultFailed'))
      trackEvent('billing.invoice_title:set_default', undefined, { result: 'fail' })
    },
  })

  // 任意抬头（含默认）均可删；删的是默认抬头时，把第一条剩余抬头递补为默认
  const removeTitle = useMutation({
    mutationFn: (id: string) => deleteInvoiceTitle(tenantId, id),
    onSuccess: async (_data, id) => {
      appToast.success(t('billing.invoice.deleteSuccess'))
      const removed = titles.find((t) => t.id === id)
      const rest = titles.filter((t) => t.id !== id)
      if (removed?.is_default && rest.length > 0) {
        await setDefaultInvoiceTitle(tenantId, rest[0].id).catch(() => {})
      }
      qc.invalidateQueries({ queryKey: ['invoice', 'titles', tenantId] })
      setDeleteTarget(null)
    },
    onError: (err: Error) => appToast.requestError(err, t('billing.invoice.deleteFailed')),
  })

  const create = useMutation({
    mutationFn: () => createInvoiceTitle(tenantId, form),
    onSuccess: () => {
      appToast.success(t('billing.invoice.titleSaveSuccess'))
      // §11.2 billing_invoice_title_add
      trackEvent('billing_invoice_title_add', { invoice_title_kind: form.type, result: 'success' })
      qc.invalidateQueries({ queryKey: ['invoice', 'titles', tenantId] })
      setForm(EMPTY_FORM)
      setView('list')
    },
    onError: () => {
      appToast.error(t('billing.invoice.titleSaveFailed'))
      trackEvent('billing_invoice_title_add', { invoice_title_kind: form.type, result: 'fail' })
    },
  })

  const set = (k: keyof CreateInvoiceTitleRequest, v: string) => setForm((f) => ({ ...f, [k]: v }))

  // #1192：原型要求必填项未填完时「保存」置灰，此前按钮恒可点、校验只在点击后用 toast 提示。
  // 邮箱格式不在这里校验（留给 handleSave 的 toast），按钮disabled只管「有没有填」。
  const isFormValid = Boolean(form.company_name.trim() && form.tax_id.trim() && form.email.trim())

  const handleSave = () => {
    if (!form.company_name.trim()) return appToast.warning(t('billing.invoice.companyNameRequired'))
    if (!form.tax_id.trim()) return appToast.warning(t('billing.invoice.taxIdRequired'))
    // 发票将推送到接收邮箱，邮箱必填且需为有效格式
    if (!form.email.trim()) return appToast.warning(t('billing.invoice.emailRequired'))
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return appToast.warning(t('billing.invoice.emailInvalid'))
    }
    create.mutate()
  }

  // ─── 新增表单视图 ───────────────────────────────
  if (view === 'form') {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setView('list')}
          className="flex items-center gap-1 text-sm text-mg-text-3 transition-colors hover:text-mg-text-1"
        >
          <LuArrowLeft size={15} /> {t('billing.invoice.back')}
        </button>
        <h3 className="text-base font-bold text-mg-text-1">{t('billing.invoice.addTitleHeading')}</h3>

        <Field label={t('billing.invoice.titleTypeLabel')}>
          <Select value={form.type} onChange={(v) => set('type', v)} className="w-full">
            <Select.Option value="vat_normal">{t('billing.invoice.titleType.vat_normal')}</Select.Option>
            <Select.Option value="vat_special">{t('billing.invoice.titleType.vat_special')}</Select.Option>
          </Select>
        </Field>
        <Field label={t('billing.invoice.companyName')}>
          <Input
            value={form.company_name}
            onChange={(e) => set('company_name', e.target.value)}
            placeholder={t('billing.invoice.companyNamePlaceholder')}
          />
        </Field>
        <Field label={t('billing.invoice.taxId')}>
          <Input
            value={form.tax_id}
            onChange={(e) => set('tax_id', e.target.value)}
            placeholder={t('billing.invoice.taxIdPlaceholder')}
          />
        </Field>
        <Field label={t('billing.invoice.email')}>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder={t('billing.invoice.emailPlaceholder')}
          />
        </Field>

        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={() => setView('list')}>
            {t('billing.invoice.cancel')}
          </Button>
          <Button variant="brand" className="flex-1" loading={create.isPending} disabled={!isFormValid} onClick={handleSave}>
            {t('billing.invoice.save')}
          </Button>
        </div>
      </div>
    )
  }

  // ─── 列表视图 ───────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs leading-relaxed text-mg-text-3">
          {t('billing.invoice.titleManageDesc')}
        </p>
        {canManageTitles && (
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => setView('form')}>
            <LuPlus size={14} className="mr-1" /> {t('billing.invoice.addTitleButton')}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-sm text-mg-text-3">{t('billing.invoice.loading')}</div>
      ) : titles.length === 0 ? (
        <EmptyState title={t('billing.invoice.emptyTitles')} />
      ) : (
        titles.map((title) => (
          <div
            key={title.id}
            className={cnCard(title.is_default)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-mg-text-1">{title.company_name}</span>
                  {title.is_default && (
                    <span className="rounded-full bg-brand-base px-2 py-0.5 text-xs font-semibold text-white">
                      {t('billing.invoice.defaultTitle')}
                    </span>
                  )}
                  <span className="rounded-md bg-mg-fill-0 px-2 py-0.5 text-xs text-mg-text-2">
                    {t(`billing.invoice.titleType.${title.type as InvoiceTitleType}`)}
                  </span>
                </div>
                <div className="space-y-0.5 text-xs text-mg-text-3">
                  <div>{t('billing.invoice.taxIdWithValue', { taxId: title.tax_id })}</div>
                  <div>{title.email}</div>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2 text-xs">
                {canManageTitles && !title.is_default && (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={setDefault.isPending && setDefault.variables === title.id}
                    onClick={() => setDefault.mutate(title.id)}
                  >
                    {t('billing.invoice.setDefault')}
                  </Button>
                )}
                {canManageTitles && <Button
                  variant="ghost"
                  size="sm"
                  className="text-mg-danger hover:bg-mg-danger/5"
                  onClick={() => setDeleteTarget({ id: title.id, name: title.company_name })}
                >
                  <LuTrash2 size={13} />
                </Button>}
              </div>
            </div>
          </div>
        ))
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && removeTitle.mutate(deleteTarget.id)}
        title={t('billing.invoice.deleteTitle')}
        description={deleteTarget ? t('billing.invoice.deleteTitleDesc', { name: deleteTarget.name }) : undefined}
        confirmLabel={t('billing.invoice.delete')}
        cancelLabel={t('billing.invoice.cancel')}
        variant="destructive"
        loading={removeTitle.isPending}
      />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-mg-text-2">{label}</label>
      {children}
    </div>
  )
}

function cnCard(isDefault: boolean) {
  return `rounded-md border p-4 ${isDefault ? 'border-brand-base/40 bg-brand-base/[0.02]' : 'border-mg-border'}`
}
