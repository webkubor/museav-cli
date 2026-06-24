/**
 * 发票抬头页（FR-B1）
 * 列表（普票/专票，设默认）↔ 新增抬头表单（专票多注册地址/电话/开户行/账号 4 项）。
 * 与「组织设置 → 开票信息」同源。
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LuPlus, LuArrowLeft } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { appToast } from '@/lib/app-toast'
import {
  listInvoiceTitles,
  createInvoiceTitle,
  setDefaultInvoiceTitle,
} from '@/services/invoice'
import type { InvoiceTitleType, CreateInvoiceTitleRequest } from '@/types'

const TITLE_TYPE_LABEL: Record<InvoiceTitleType, string> = {
  vat_normal: '增值税普票',
  vat_special: '增值税专票',
  overseas: '国外 Invoice',
}

const EMPTY_FORM: CreateInvoiceTitleRequest = {
  type: 'vat_normal',
  company_name: '',
  tax_id: '',
  email: '',
  reg_address: '',
  reg_phone: '',
  bank_name: '',
  bank_account: '',
}

export function InvoiceTitleTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient()
  const [view, setView] = useState<'list' | 'form'>('list')
  const [form, setForm] = useState<CreateInvoiceTitleRequest>(EMPTY_FORM)

  const { data, isLoading } = useQuery({
    queryKey: ['invoice', 'titles', tenantId],
    queryFn: () => listInvoiceTitles(tenantId),
    enabled: Boolean(tenantId),
  })
  const titles = data?.items ?? []

  const setDefault = useMutation({
    mutationFn: (id: string) => setDefaultInvoiceTitle(tenantId, id),
    onSuccess: () => {
      appToast.success('已设为默认抬头')
      qc.invalidateQueries({ queryKey: ['invoice', 'titles', tenantId] })
    },
  })

  const create = useMutation({
    mutationFn: () => createInvoiceTitle(tenantId, form),
    onSuccess: () => {
      appToast.success('抬头已保存')
      qc.invalidateQueries({ queryKey: ['invoice', 'titles', tenantId] })
      setForm(EMPTY_FORM)
      setView('list')
    },
    onError: () => appToast.error('保存失败，请重试'),
  })

  const set = (k: keyof CreateInvoiceTitleRequest, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSave = () => {
    if (!form.company_name.trim()) return appToast.warning('请填写抬头名称')
    if (!form.tax_id.trim()) return appToast.warning('请填写税号')
    // 发票将推送到接收邮箱，邮箱必填且需为有效格式
    if (!form.email.trim()) return appToast.warning('请填写接收邮箱')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return appToast.warning('请填写有效的接收邮箱')
    create.mutate()
  }

  // ─── 新增表单视图 ───────────────────────────────
  if (view === 'form') {
    const isSpecial = form.type === 'vat_special'
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setView('list')}
          className="flex items-center gap-1 text-sm text-mg-text-2 transition-colors hover:text-mg-text-0"
        >
          <LuArrowLeft size={15} /> 返回
        </button>
        <h3 className="text-base font-bold text-mg-text-0">新增发票抬头</h3>

        <Field label="票种">
          <Select value={form.type} onChange={(v) => set('type', v)} className="w-full">
            <Select.Option value="vat_normal">{TITLE_TYPE_LABEL.vat_normal}</Select.Option>
            <Select.Option value="vat_special">{TITLE_TYPE_LABEL.vat_special}</Select.Option>
          </Select>
        </Field>
        <Field label="抬头名称">
          <Input value={form.company_name} onChange={(e) => set('company_name', e.target.value)} placeholder="公司全称" />
        </Field>
        <Field label="税号">
          <Input value={form.tax_id} onChange={(e) => set('tax_id', e.target.value)} placeholder="统一社会信用代码" />
        </Field>
        <Field label="接收邮箱">
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="finance@company.com" />
        </Field>

        {isSpecial && (
          <>
            <Field label="注册地址">
              <Input value={form.reg_address} onChange={(e) => set('reg_address', e.target.value)} placeholder="营业执照注册地址" />
            </Field>
            <Field label="注册电话">
              <Input value={form.reg_phone} onChange={(e) => set('reg_phone', e.target.value)} placeholder="注册电话" />
            </Field>
            <Field label="开户银行">
              <Input value={form.bank_name} onChange={(e) => set('bank_name', e.target.value)} placeholder="开户银行" />
            </Field>
            <Field label="银行账号">
              <Input value={form.bank_account} onChange={(e) => set('bank_account', e.target.value)} placeholder="银行账号" />
            </Field>
          </>
        )}

        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={() => setView('list')}>
            取消
          </Button>
          <Button variant="brand" className="flex-1" loading={create.isPending} onClick={handleSave}>
            保存
          </Button>
        </div>
      </div>
    )
  }

  // ─── 列表视图 ───────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs leading-relaxed text-mg-text-2">
          增值税发票抬头（普票/专票），与「组织设置 → 开票信息」同源；默认抬头在开票时自动带出。
        </p>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => setView('form')}>
          <LuPlus size={14} className="mr-1" /> 新增抬头
        </Button>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-sm text-mg-text-2">加载中…</div>
      ) : (
        titles.map((t) => (
          <div
            key={t.id}
            className={cnCard(t.is_default)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-mg-text-0">{t.company_name}</span>
                  {t.is_default && (
                    <span className="rounded-full bg-brand-base px-2 py-0.5 text-[11px] font-semibold text-white">
                      默认
                    </span>
                  )}
                  <span className="rounded-md bg-mg-fill-0 px-2 py-0.5 text-[11px] text-mg-text-1">
                    {TITLE_TYPE_LABEL[t.type]}
                  </span>
                </div>
                <div className="space-y-0.5 text-xs text-mg-text-2">
                  <div>税号 {t.tax_id}</div>
                  {t.reg_address && <div>{t.reg_address}</div>}
                  {t.bank_name && (
                    <div>
                      {t.bank_name} {t.bank_account}
                    </div>
                  )}
                  <div>{t.email}</div>
                </div>
              </div>
              <div className="shrink-0 text-xs">
                {t.is_default ? (
                  <span className="text-mg-text-3">默认抬头</span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={setDefault.isPending && setDefault.variables === t.id}
                    onClick={() => setDefault.mutate(t.id)}
                  >
                    设为默认
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-mg-text-1">{label}</label>
      {children}
    </div>
  )
}

function cnCard(isDefault: boolean) {
  return `rounded-md border p-4 ${isDefault ? 'border-brand-base/40 bg-brand-base/[0.02]' : 'border-mg-border'}`
}
