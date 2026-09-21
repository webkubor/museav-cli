/**
 * 创建 API Key 抽屉：名称、类型、负责人、过期时间、护栏与最终生效规则预览
 */
import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { SideSheet } from "@/components/ui/SideSheet";
import {
  DateRangePicker,
  type DateRangeValue,
} from "@/components/ui/DateRangePicker";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Select, { SelectItem } from "@/components/ui/Select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { reportOnboardingStep } from "@/store/use-onboarding-store";
import {
  createApiKey,
  getEffectiveGuardrailPreview,
} from "@/services/api-keys";
import { listWorkspaceMembers, listWorkspaces } from "@/services/workspaces";
import { listGuardrails } from "@/services/guardrails";
import { appToast } from "@/lib/app-toast";
import { useCurrency } from "@/hooks/use-platform-config";
import { useAuthStore } from "@/store/auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useTenantRole } from "@/hooks/use-tenant-role";
import { PERMS } from "@/config/permissions";
import {
  getExpirationPresets,
  resolveExpiryISO,
  type ScopeType,
} from "./constants";
import { keyTypeDesc, keyTypeLabel } from "./derive";
import { trackEvent } from "@/lib/track";
import { todayInputDate } from "@/lib/datetime";
import type { GuardrailDetail } from "@/interfaces/guardrails";
import {
  activeDefaultGuardrail,
  activeGlobalGuardrail,
  deriveKind,
  deriveScope,
  PROMPT_INJECTION_LABEL,
  PERIOD_LABEL,
  resolveKeyPromptInjection,
  metadataList,
} from "@/pages/guardrails/derive";
import { groupThousands, trimAmountScale } from "@/pages/guardrails/budget";
import type { ApiKeyCreated, ApiKeyType } from "@/types";
import { LuInfo, LuChevronDown, LuChevronRight } from "react-icons/lu";
import { useNavigate } from "react-router-dom";

/** PRD「Key 类型」→ 后端 scope 映射（私有→personal / 成员→member / 服务→workspace） */
const TYPE_CARDS: { type: ApiKeyType; scope: ScopeType }[] = [
  { type: "personal", scope: "personal" },
  { type: "member", scope: "member" },
  { type: "service", scope: "workspace" },
];

/** scope → Key 类型（埋点 key_type 用） */
const KEY_TYPE_OF_SCOPE: Record<ScopeType, ApiKeyType> = {
  personal: "personal",
  member: "member",
  workspace: "service",
};

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  onCreated: (created: ApiKeyCreated) => void;
};

export function CreateKeyModal({
  open,
  onClose,
  workspaceId,
  onCreated,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { symbol } = useCurrency();
  // 个人租户可选 个人/项目 作用域，但没有「成员」（企业专属）
  const activeTenantId = useAuthStore((s) => s.activeTenantId);
  const tenants = useAuthStore((s) => s.tenants);
  const account = useAuthStore((s) => s.account);
  const isPersonalTenant =
    tenants.find((t) => t.tenant_id === activeTenantId)?.type === "personal";
  // Key 类型按各自细粒度创建权限 gate（#54 · PRD §8.1/§8.2）：无权限类型置灰并提示，绝不靠角色启发式
  const { hasPermission } = usePermissions();
  const { isEnterprise, canManage } = useTenantRole();
  const mustSetExpiry = isEnterprise && !canManage;
  const canCreateScope: Record<ScopeType, boolean> = {
    personal: hasPermission(PERMS.API_KEYS_CREATE_PERSONAL),
    member: hasPermission(PERMS.API_KEYS_CREATE_MEMBER),
    workspace: hasPermission(PERMS.API_KEYS_CREATE_SERVICE),
  };

  const [name, setName] = useState("");
  // 高级设置（安全策略）默认收起，对齐 PRD 原型 feat/api-key-create-modal-polish
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [scope, setScope] = useState<ScopeType>("personal");
  // 个人租户无「成员」Key，member 落到 workspace；类型可选性由上面的细粒度权限控制
  const effectiveScope: ScopeType =
    isPersonalTenant && scope === "member" ? "workspace" : scope;
  const [memberAccountId, setMemberAccountId] = useState("");
  const [guardrailIds, setGuardrailIds] = useState<string[]>([]);
  const todayStr = todayInputDate();
  const [expiryRange, setExpiryRange] = useState<DateRangeValue>({
    preset: mustSetExpiry ? "1y" : "all",
    startDate: todayStr,
    endDate: "",
  });
  const localizedExpirationPresets = getExpirationPresets(t);
  const expiryPresets = mustSetExpiry
    ? localizedExpirationPresets.filter((preset) => preset.key !== "all")
    : localizedExpirationPresets;
  useEffect(() => {
    if (mustSetExpiry && expiryRange.preset === "all") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpiryRange({ preset: "1y", startDate: todayStr, endDate: "" });
    }
  }, [mustSetExpiry, expiryRange.preset, todayStr]);
  // 服务 Key 负责人（复用成员下拉）；个人租户固定为自己
  const needsMaintainer = effectiveScope === "workspace" && !isPersonalTenant;
  // 当前选中的类型无创建权限时，落到第一个有权限的类型（个人租户排除成员 Key）
  useEffect(() => {
    if (!open || canCreateScope[effectiveScope]) return;
    const firstAllowed = (
      ["personal", "member", "workspace"] as ScopeType[]
    ).find((s) => canCreateScope[s] && !(isPersonalTenant && s === "member"));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (firstAllowed) setScope(firstAllowed);
  }, [open, effectiveScope, canCreateScope, isPersonalTenant]);

  const membersQuery = useQuery({
    queryKey: ["workspace-members", workspaceId],
    queryFn: () => listWorkspaceMembers(workspaceId, { page_size: 100 }),
    enabled:
      !!workspaceId && open && (effectiveScope === "member" || needsMaintainer),
    staleTime: 60_000,
  });

  const guardrailsQuery = useQuery({
    queryKey: ["guardrails", workspaceId],
    queryFn: () => listGuardrails(workspaceId).then((res) => res.items ?? []),
    enabled: !!workspaceId && open,
    staleTime: 60_000,
  });

  // 抽屉保持挂载时，重新打开不会触发 React Query 的 mount 刷新；每次打开主动拉取，确保新建/编辑的 Key 护栏进入下拉。
  useEffect(() => {
    if (open && workspaceId) void guardrailsQuery.refetch();
  }, [open, workspaceId, guardrailsQuery.refetch]);

  const workspaceQuery = useQuery({
    queryKey: ["workspaces", activeTenantId],
    queryFn: () => listWorkspaces(),
    enabled: !!activeTenantId && open,
    staleTime: 60_000,
  });
  const workspaceName =
    workspaceQuery.data?.find(
      (workspace) => workspace.workspace_id === workspaceId,
    )?.name ?? t("apiKeys.createModal.currentWorkspace");

  // 默认护栏自动选中，始终排首位。
  // 仅选 active 的默认护栏（需求方#96）：inactive/archived 的 default 后端 byID 收不到，
  // 自动塞进 guardrail_ids 会导致建 key 报 GUARDRAIL_NOT_FOUND「selected guardrail not found」。
  useEffect(() => {
    const guardrails = Array.isArray(guardrailsQuery.data)
      ? guardrailsQuery.data
      : [];
    if (!guardrails.length) return;
    const def = activeDefaultGuardrail(guardrails);
    if (def && !guardrailIds.includes(def.id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGuardrailIds((prev) => [
        def.id,
        ...prev.filter((id) => id !== def.id),
      ]);
    }
  }, [guardrailIds, guardrailsQuery.data]);

  // create_submit 埋点公共属性（PRD §11）：占位 prd_version，row_scope 在页面层带
  const submitTrackProps = () => ({
    prd_version: "api_keys_v0_1",
    key_type: KEY_TYPE_OF_SCOPE[effectiveScope],
    has_key_guardrail: guardrailIds.length > 0,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createApiKey(workspaceId, {
        name: name.trim(),
        scope: effectiveScope,
        // 成员 Key → 目标成员；服务 Key → 负责人（个人租户负责人固定自己，留空由后端默认创建者）
        member_account_id:
          effectiveScope === "member" || needsMaintainer
            ? memberAccountId || undefined
            : undefined,
        guardrail_ids: guardrailIds.length > 0 ? guardrailIds : undefined,
        expires_at: resolveExpiryISO(expiryRange) ?? undefined,
      }),
    onSuccess: (newKey) => {
      appToast.success(t("apiKeys.toast.createSuccess", { name: newKey.name }));
      queryClient.invalidateQueries({ queryKey: ["api-keys", workspaceId] });
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      trackEvent("api_keys:create_submit", submitTrackProps(), {
        source: "create_modal",
        result: "success",
      });
      // 新手指南第 3 步「创建 API Key」：证据是创建成功记录的 Key ID（规格 §7 表）。
      // 之后删掉这个 Key 也不回退完成状态（规格 §12）。
      reportOnboardingStep("api_key", "api_key_created", newKey.api_key_id);
      onCreated(newKey);
    },
    onError: (err: unknown) => {
      appToast.requestError(err, t("apiKeys.toast.createError"));
      trackEvent("api_keys:create_submit", submitTrackProps(), {
        source: "create_modal",
        result: "fail",
      });
    },
  });

  function handleSubmit() {
    if (!name.trim()) {
      appToast.error(t("apiKeys.createModal.nameRequired"));
      return;
    }
    if (effectiveScope === "member" && !memberAccountId) {
      appToast.error(t("apiKeys.createModal.memberRequired"));
      return;
    }
    if (needsMaintainer && !memberAccountId) {
      appToast.error(t("apiKeys.createModal.maintainerRequired"));
      return;
    }
    createMutation.mutate();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawData = guardrailsQuery.data as any;
  const allGuardrails: GuardrailDetail[] = Array.isArray(rawData)
    ? rawData
    : Array.isArray(rawData?.items)
      ? rawData.items
      : [];
  // 只认 active 的默认护栏（需求方#106）：存量数据可能有多条 is_default，其中 inactive 的
  // 后端 byID 收不到，若被 line 402 强行塞进 guardrail_ids 会导致建 key 报「selected guardrail not found」。
  // 与上方自动选择（#96）同口径，避免两处「默认」不一致。
  const defaultGuardrail = activeDefaultGuardrail(allGuardrails);
  const defaultId = defaultGuardrail?.id ?? "";
  const extraIds = guardrailIds.filter((id) => id !== defaultId);
  const selectedGuardrail = allGuardrails.find((g) => g.id === extraIds[0]);

  // 生效规则预览：提示词注入最终模式 + 来源（常规 Key 护栏显式 > 启用全局 > 关闭）
  const selectedGuardrails = allGuardrails.filter((g) =>
    guardrailIds.includes(g.id),
  );
  const piResolved = resolveKeyPromptInjection(
    selectedGuardrails,
    activeGlobalGuardrail(allGuardrails),
  );

  // 生效规则预览（PRD §8.2 预算闸门/模型黑名单/IP 白名单）：
  // 后端已交付工作区级生效预览接口（qa#420 第1项）：与调用时网关同一 resolver——黑名单并集/白名单交集/预算最严。
  // 优先读真接口；加载中/失败回退「全局护栏 + 所选 Key 护栏」本地叠加，不阻塞、不回归。
  const previewQuery = useQuery({
    queryKey: [
      "guardrail-effective-preview",
      workspaceId,
      effectiveScope,
      memberAccountId,
      extraIds[0] ?? "",
      account?.account_id ?? "",
    ],
    queryFn: () =>
      getEffectiveGuardrailPreview(workspaceId, {
        api_key_type: effectiveScope,
        responsible_member_id:
          effectiveScope === "member" || needsMaintainer
            ? memberAccountId || undefined
            : undefined,
        key_guardrail_id: extraIds[0] || undefined,
        created_by_member_id: account?.account_id || undefined,
      }).catch(() => undefined),
    enabled: !!workspaceId && open,
    staleTime: 30_000,
  });
  const eff = previewQuery.data?.effective;

  // 本地兜底源（真接口不可用时用）
  const globalGuardrail = activeGlobalGuardrail(allGuardrails);
  const previewGuardrails = [globalGuardrail, ...selectedGuardrails]
    .filter((g): g is GuardrailDetail => !!g)
    .filter((g, i, arr) => arr.findIndex((x) => x.id === g.id) === i);

  const modelBlacklist = eff
    ? eff.model_blacklist
    : [
        ...new Set(
          previewGuardrails.flatMap((g) => metadataList(g, "model_blacklist")),
        ),
      ];
  const ipWhitelist = eff
    ? eff.ip_whitelist
    : [
        ...new Set(
          previewGuardrails.flatMap((g) => metadataList(g, "ip_whitelist")),
        ),
      ];
  const memberApplies = effectiveScope !== "workspace";
  const memberLayer = previewQuery.data?.layers?.find((layer) =>
    /member|personal/i.test(layer.layer),
  );
  // 个人租户没有「成员」概念，个人护栏/个人预算两行不适用（V1.0.7 小需求#9），与 use-guardrails-page.tsx 的 showMember 同一口径
  const effectiveLayerRows = [
    {
      label: t("apiKeys.guardrail.global"),
      name: globalGuardrail?.name ?? t("apiKeys.common.notConfigured"),
      state: globalGuardrail ? "active" : "inactive",
    },
    ...(isPersonalTenant
      ? []
      : [
          {
            label: t("apiKeys.guardrail.member"),
            name: memberApplies
              ? (memberLayer?.guardrail_name ??
                (globalGuardrail ? t("apiKeys.guardrail.globalDefaultMemberBudget") : t("apiKeys.common.notConfigured")))
              : t("apiKeys.guardrail.memberBudgetNotApplicable"),
            state:
              memberApplies && (memberLayer || globalGuardrail)
                ? "active"
                : "inactive",
          },
        ]),
    {
      label: t("apiKeys.guardrail.key"),
      name: selectedGuardrail?.name ?? t("apiKeys.guardrail.noneSpaced"),
      state: selectedGuardrail || globalGuardrail ? "active" : "inactive",
    },
  ];
  const budgetGateRows = [
    { label: t("apiKeys.budget.workspaceTotal"), scope: "guardrail_total" },
    ...(isPersonalTenant ? [] : [{ label: t("apiKeys.budget.member"), scope: "per_member" }]),
    { label: t("apiKeys.budget.key"), scope: "per_api_key" },
  ].map(({ label, scope: aggregationScope }) => {
    const budget = eff?.budgets?.find(
      (item) => item.aggregation_scope === aggregationScope,
    );
    const value = budget
      ? `${symbol}${groupThousands(trimAmountScale(budget.spend_limit_amount))} / ${t(`guardrails.period.${budget.period_unit}`, { defaultValue: PERIOD_LABEL[budget.period_unit] ?? budget.period_unit })}`
      : t("apiKeys.limit.none");
    return { label, value, source: budget ? t("apiKeys.effectiveRule") : t("apiKeys.budget.notConfigured") };
  });
  const previewRuleRows = [
    {
      label: t("apiKeys.rule.modelBlacklist"),
      value: modelBlacklist.length > 0 ? modelBlacklist.join("、") : t("apiKeys.common.notConfigured"),
      source: modelBlacklist.length > 0 ? t("apiKeys.rule.globalKeySource") : t("apiKeys.common.none"),
    },
    {
      label: t("apiKeys.rule.ipWhitelist"),
      value: ipWhitelist.length > 0 ? ipWhitelist.join(", ") : t("apiKeys.common.notConfigured"),
      source: ipWhitelist.length > 0 ? t("apiKeys.rule.globalKeySource") : t("apiKeys.common.none"),
    },
    {
      label: t("apiKeys.rule.promptInjection"),
      value: t(`guardrails.promptInjection.mode.${piResolved.mode}`, { defaultValue: PROMPT_INJECTION_LABEL[piResolved.mode] }),
      source: piResolved.sourceLabel,
    },
  ];

  return (
    <>
      <SideSheet
        open={open}
        onClose={onClose}
        title={t("apiKeys.createModal.title")}
        description={t("apiKeys.createModal.desc", { workspaceName })}
        footer={
          <div className="flex justify-end gap-2 border-t border-mg-border pt-4">
            <Button variant="outline" onClick={onClose}>
              {t("apiKeys.createModal.cancel")}
            </Button>
            <Button
              variant="brand"
              data-track="api_keys:create_submit"
              loading={createMutation.isPending}
              onClick={handleSubmit}
            >
              {t("apiKeys.createModal.confirm")}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-7 px-1 py-3">
          {/* Key 名称（PRD 原型顺序） */}
          <div>
            <label className="block text-xs font-bold text-mg-text-2 mb-2">
              {t("apiKeys.createModal.nameLabel")}
            </label>
            <Input
              value={name}
              data-track="api_keys:field_name"
              onChange={(e) => setName(e.target.value)}
              placeholder={t("apiKeys.createModal.namePlaceholder")}
            />
          </div>

          {/* Key 类型（PRD §10.1）——卡片栅格，映射到后端 scope；个人租户无「成员 Key」 */}
          <div>
            <label className="block text-xs font-bold text-mg-text-2 mb-2">
              {t("apiKeys.createModal.typeLabel")}
            </label>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {TYPE_CARDS.filter(
                (c) => !(isPersonalTenant && c.type === "member"),
              ).map((c) => {
                const active = effectiveScope === c.scope;
                const allowed = canCreateScope[c.scope];
                return (
                  <button
                    key={c.type}
                    type="button"
                    data-track={`api_keys:type_${c.type}`}
                    disabled={!allowed}
                    title={!allowed ? t("apiKeys.createModal.noTypePermission") : undefined}
                    onClick={() => {
                      if (!allowed) return;
                      setScope(c.scope);
                      setMemberAccountId("");
                    }}
                    className={[
                      "rounded-md border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40",
                      active
                        ? "border-brand-base bg-brand-base/5 ring-1 ring-brand-base/30"
                        : "border-mg-border bg-mg-bg-1 enabled:hover:border-brand-base/35",
                    ].join(" ")}
                  >
                    <div className="text-xs font-bold text-mg-text-1">
                      {keyTypeLabel(t, c.type)}
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-mg-text-3">
                      {keyTypeDesc(t, c.type)}
                    </div>
                    {!allowed && (
                      <div className="mt-1.5 text-[11px] text-mg-text-4">
                        {t("apiKeys.createModal.noCreatePermission")}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 负责人（成员 Key）：管理员代建指定被负责成员 */}
          {effectiveScope === "member" && (
            <div>
              <label className="block text-xs font-bold text-mg-text-2 mb-2">
                {t("apiKeys.createModal.ownerLabel")}
              </label>
              <Select
                value={memberAccountId}
                onChange={setMemberAccountId}
                placeholder={t("apiKeys.createModal.memberPlaceholder")}
                className="w-full"
                data-track="api_keys:field_owner"
              >
                {(membersQuery.data?.items ?? []).map((m) => (
                  <SelectItem
                    key={m.account.account_id}
                    value={m.account.account_id}
                  >
                    {m.account.display_name || m.account.email}
                  </SelectItem>
                ))}
              </Select>
              {membersQuery.data?.items.length === 0 && (
                <p className="text-xs text-mg-text-3 mt-1.5">
                  {t("apiKeys.createModal.noMembers")}
                </p>
              )}
            </div>
          )}

          {/* 负责人（服务 Key，PRD §8.2 必填）：企业租户选空间成员必填；
              个人租户无多成员、无需指定负责人——PRD 原型仅显示「维护人为自己」提示，不出现「负责人」字段（需求方#210） */}
          {effectiveScope === "workspace" &&
            (isPersonalTenant ? (
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-mg-border bg-mg-bg-1 text-xs text-mg-text-2">
                {t("apiKeys.createModal.selfMaintainer", { account: account?.display_name || account?.email || t("apiKeys.createModal.currentAccount") })}
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-mg-text-2 mb-2">
                  {t("apiKeys.createModal.ownerLabel")}
                </label>
                <Select
                  value={memberAccountId}
                  onChange={setMemberAccountId}
                  placeholder={t("apiKeys.createModal.maintainerPlaceholder")}
                  className="w-full"
                  data-track="api_keys:field_maintainer"
                >
                  {(membersQuery.data?.items ?? []).map((m) => (
                    <SelectItem
                      key={m.account.account_id}
                      value={m.account.account_id}
                    >
                      {m.account.display_name || m.account.email}
                    </SelectItem>
                  ))}
                </Select>
                {membersQuery.data?.items.length === 0 && (
                  <p className="text-xs text-mg-text-3 mt-1.5">
                    {t("apiKeys.createModal.noMembers")}
                  </p>
                )}
              </div>
            ))}

          {/* 过期时间（PRD 原型：创建生命周期字段，Member 不可选择永不过期） */}
          <div>
            <label className="block text-xs font-bold text-mg-text-2 mb-2">
              {t("apiKeys.createModal.expiryLabel")}{" "}
              <span className="text-mg-text-3 font-normal">
                {mustSetExpiry
                  ? t("apiKeys.createModal.expiryRequiredHint")
                  : t("apiKeys.createModal.expiryOptionalHint")}
              </span>
            </label>
            <DateRangePicker
              value={expiryRange}
              onChange={setExpiryRange}
              presets={expiryPresets}
              customTitle={t("apiKeys.createModal.expiryPresetTitle")}
              customLabel={t("apiKeys.createModal.expiryCustomLabel")}
              hideStartDate={true}
              placeholder={t("apiKeys.createModal.expiryPlaceholder")}
              className="w-full rounded-md h-10 !bg-mg-bg-1"
            />
          </div>

          {/* 高级设置（PRD 原型 feat/api-key-create-modal-polish：安全策略收进折叠面板，默认收起） */}
          <div className="space-y-3">
            <button
              type="button"
              aria-expanded={advancedOpen}
              aria-controls="api-key-advanced-panel"
              data-track="api_keys:advanced_toggle"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 rounded-md border border-mg-border bg-mg-bg-1 px-3 py-2.5 text-left transition-colors hover:border-brand-base/60"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <strong className="text-[13px] font-bold text-mg-text-1">
                  {t("apiKeys.createModal.advancedTitle")}
                </strong>
                <em className="truncate text-xs not-italic text-mg-text-3">
                  {t("apiKeys.createModal.advancedDesc")}
                </em>
              </span>
              <LuChevronDown
                size={17}
                className={`shrink-0 transition-transform ${advancedOpen ? "rotate-180 text-brand-base" : "text-mg-text-3"}`}
              />
            </button>

            {advancedOpen && (
              <div id="api-key-advanced-panel" className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-base font-bold text-mg-text-1">{t("apiKeys.createModal.securityPolicy")}</h4>
                  <button
                    type="button"
                    data-track="api_keys:manage_guardrails"
                    className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-base hover:text-brand-deep"
                    onClick={() => {
                      onClose();
                      navigate(`/workspace/${workspaceId}/guardrails`);
                    }}
                  >
                    {t("apiKeys.createModal.manageGuardrails")} <LuChevronRight size={14} />
                  </button>
                </div>
                <div className="space-y-2.5">
                  <label className="block text-sm font-bold text-mg-text-1">
                    {t("apiKeys.guardrail.key")}
                  </label>
                  <Select
                    value={extraIds[0] ?? "__none__"}
                    onChange={(value) =>
                      setGuardrailIds([
                        ...(defaultId ? [defaultId] : []),
                        ...(value === "__none__" ? [] : [value]),
                      ])
                    }
                  >
                    <SelectItem value="__none__">{t("apiKeys.guardrail.noneSpaced")}</SelectItem>
                    {allGuardrails
                      .filter(
                        (g) =>
                          !g.is_default &&
                          deriveScope(g) === "key" &&
                          deriveKind(g) === "regular",
                      )
                      .map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                  </Select>
                  {allGuardrails.filter(
                    (g) =>
                      !g.is_default &&
                      deriveScope(g) === "key" &&
                      deriveKind(g) === "regular",
                  ).length === 0 && (
                    <p className="text-sm text-mg-text-2">{t("apiKeys.guardrail.noKeyGuardrails")}</p>
                  )}
                </div>
                <div className="mg-tile grid gap-2.5 p-3">
                  <div className="flex items-center gap-1.5">
                    <strong className="text-[13px] font-extrabold text-mg-text-1">
                      {t("apiKeys.effectivePreview")}
                    </strong>
                    <LuInfo
                      className="text-mg-text-3"
                      size={14}
                      aria-label={t("apiKeys.budget.runtimeCheckTip")}
                      title={t("apiKeys.budget.runtimeCheckTip")}
                    />
                  </div>
                  <div className={`grid gap-2 ${effectiveLayerRows.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                    {effectiveLayerRows.map((row) => (
                      <div
                        className={`grid min-w-0 gap-1 rounded-lg border bg-mg-bg-0 px-2.5 py-2 ${row.state === "active" ? "border-[var(--mg-state-selected-border)]" : "border-mg-border"}`}
                        key={row.label}
                      >
                        <span className="text-[11px] font-bold text-mg-text-2">
                          {row.label}
                        </span>
                        <strong className="break-words text-xs font-bold text-mg-text-1">
                          {row.name}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <strong className="text-[13px] font-extrabold text-mg-text-1">
                      {t("apiKeys.budget.gate")}
                    </strong>
                    <LuInfo
                      className="text-mg-text-3"
                      size={14}
                      aria-label={t("apiKeys.budget.stopTip")}
                      title={t("apiKeys.budget.stopTip")}
                    />
                  </div>
                  <div className="grid gap-2">
                    {budgetGateRows.map((row) => (
                      <div
                        className="grid min-w-0 gap-1 rounded-lg border border-mg-border bg-mg-bg-0 px-2.5 py-2"
                        key={row.label}
                      >
                        <span className="text-[11px] font-bold text-mg-text-2">
                          {row.label}
                        </span>
                        <strong className="text-xs font-bold text-mg-text-1">
                          {row.value}
                        </strong>
                        <em className="text-[11px] not-italic text-mg-text-2">
                          {row.source}
                        </em>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {previewRuleRows.map((row) => (
                      <div
                        className="grid min-w-0 gap-1 rounded-lg border border-mg-border bg-mg-bg-0 px-2.5 py-2"
                        key={row.label}
                      >
                        <span className="text-[11px] font-bold text-mg-text-2">
                          {row.label}
                        </span>
                        <strong className="break-words text-xs font-bold text-mg-text-1">
                          {row.value}
                        </strong>
                        <em className="break-words text-[11px] not-italic text-mg-text-2">
                          {t("apiKeys.rule.source", { source: row.source })}
                        </em>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </SideSheet>
    </>
  );
}
