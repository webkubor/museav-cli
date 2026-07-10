import { useState } from 'react'
import { LuShieldCheck } from 'react-icons/lu'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { TagInput } from '@/components/ui/TagInput'
import Select, { SelectItem } from '@/components/ui/Select'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createGuardrail } from '@/services/guardrails'
import { listModels } from '@/services/catalog'
import { appToast } from '@/lib/app-toast'
import type { GuardrailDetail } from '@/interfaces/guardrails'
import { PROMPT_INJECTION_LABEL, PROMPT_INJECTION_MODES, type PromptInjectionMode } from '@/pages/guardrails/derive'

type Props = {
  open: boolean
  onClose: () => void
  workspaceId: string
  onCreated: (guardrail: GuardrailDetail) => void
}

function isValidIp(v: string) {
  const s = v.trim()
  const m4 = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/)
  if (m4) {
    const ok = [m4[1], m4[2], m4[3], m4[4]].every((o) => Number(o) <= 255)
    return ok && (m4[5] === undefined || Number(m4[5]) <= 32)
  }
  const m6 = s.match(/^([0-9a-fA-F:]+)(?:\/(\d{1,3}))?$/)
  if (m6 && s.includes(':')) {
    return m6[1].split(':').filter(Boolean).every((seg) => /^[0-9a-fA-F]{1,4}$/.test(seg)) &&
      (m6[2] === undefined || Number(m6[2]) <= 128)
  }
  return false
}

export function CreateGuardrailDialog({ open, onClose, workspaceId, onCreated }: Props) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [modelBlacklist, setModelBlacklist] = useState<string[]>([])
  const [ipWhitelist, setIpWhitelist] = useState<string[]>([])
  const [promptInjectionMode, setPromptInjectionMode] = useState<PromptInjectionMode>('off')
  const [ipError, setIpError] = useState('')

  const modelsQuery = useQuery({
    queryKey: ['models-catalog'],
    queryFn: () => listModels({ page_size: 100 }),
    staleTime: 5 * 60_000,
  })
  const modelSuggestions = modelsQuery.data?.items?.map((m) => m.model_id) ?? []

  function reset() {
    setName('')
    setModelBlacklist([])
    setIpWhitelist([])
    setPromptInjectionMode('off')
    setIpError('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  const mutation = useMutation({
    mutationFn: () =>
      createGuardrail(workspaceId, {
        name: name.trim(),
        metadata: { model_blacklist: modelBlacklist, ip_whitelist: ipWhitelist, prompt_injection_mode: promptInjectionMode },
      }),
    onSuccess: (g) => {
      queryClient.invalidateQueries({ queryKey: ['guardrails', workspaceId] })
      appToast.success(`护栏「${g.name}」已创建`)
      onCreated(g)
      handleClose()
    },
    onError: (err: unknown) => {
      appToast.requestError(err, '护栏创建失败')
    },
  })

  function handleSubmit() {
    if (!name.trim()) { appToast.error('请填写护栏名称'); return }
    mutation.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={
        <span className="inline-flex items-center gap-2">
          <LuShieldCheck className="w-4 h-4 text-brand-base" />
          新建护栏
        </span>
      }
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={handleClose}>取消</Button>
          <Button variant="brand" loading={mutation.isPending} onClick={handleSubmit}>
            创建并绑定
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6 py-2">
        <div>
          <label className="block text-xs font-bold text-mg-text-2 mb-2">
            护栏名称 <span className="text-mg-danger ml-0.5">*</span>
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入护栏名称"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-mg-text-2 mb-1.5">模型黑名单</label>
          <p className="text-xs text-mg-text-3 mb-2">选中的模型将被禁止通过此护栏调用</p>
          <TagInput
            value={modelBlacklist}
            onChange={setModelBlacklist}
            suggestions={modelSuggestions}
            allowFreeText={false}
            placeholder="选择要屏蔽的模型"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-mg-text-2 mb-1.5">IP 白名单</label>
          <p className="text-xs text-mg-text-3 mb-2">为空则允许所有 IP；支持 IPv4/IPv6 及 CIDR</p>
          <TagInput
            value={ipWhitelist}
            onChange={(v) => { setIpError(''); setIpWhitelist(v) }}
            allowFreeText
            tagVariant="mono"
            validator={isValidIp}
            onValidationError={() => {
              setIpError('无效的 IP 地址格式')
              setTimeout(() => setIpError(''), 3000)
            }}
            placeholder="输入 IP 或 CIDR，回车确认"
          />
          {ipError && <p className="text-xs text-mg-danger mt-1.5">{ipError}</p>}
        </div>

        <div>
          <label className="block text-xs font-bold text-mg-text-2 mb-1.5">提示词注入检测</label>
          <p className="text-xs text-mg-text-3 mb-2">命中后：仅记录继续 / 脱敏后继续 / 拦截请求</p>
          <Select value={promptInjectionMode} onChange={(v) => setPromptInjectionMode(v as PromptInjectionMode)} className="w-full">
            {PROMPT_INJECTION_MODES.map((m) => (
              <SelectItem key={m} value={m}>{PROMPT_INJECTION_LABEL[m]}</SelectItem>
            ))}
          </Select>
        </div>
      </div>
    </Modal>
  )
}
