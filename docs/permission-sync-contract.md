# 权限目录同步 · 后端接口契约

> 面向后端(modelgo-controller)。前端 console 用此接口把「菜单权限目录」推送到 controller;
> 按**市场(国内/国外)**分别推送,带**版本号**驱动全量/增量。本文是需后端实现/对齐的契约。

---

## 1. 端点

```
POST /api/v1/menu-permissions/catalog/sync
```

内网免鉴权脚手架接口;设置 `Authorization: Bearer <token>` 时应接受并透传(未来收口用)。

## 2. Query 参数(全部走 query,**不放 body**)

| 参数 | 值 | 必填 | 含义 |
| :--- | :--- | :--- | :--- |
| `dry_run` | `true` / `false` | 是 | `true`=只对账不落库,返回将发生的变更;`false`=正式落库 |
| `market` | `china` / `global` | 是 | 市场维度。**同一后端库按市场分别存**:china 与 global 是两套独立目录 |
| `catalog_version` | SemVer,如 `1.0.0` | 是 | 目录版本。见 §5 全量/增量语义 |

> ⚠️ 现状:后端 body schema 严格,body 里出现多余字段(如 market)会返 `400 / code 4001 invalid JSON body`。因此 market / catalog_version **必须走 query**,body 只含 §3 三段。

## 3. 请求 Body（`application/json`）

```jsonc
{
  "source": "modelgo-console-web",   // string, 固定来源标识
  "menus": [                         // 菜单数组(前端已按 market 过滤:国外不含发票等国内特例)
    {
      "key": "billing",              // string, 菜单唯一 key。命名见 §4
      "name": "账单管理",             // string, 中文名
      "name_en": "Billing",          // string, 英文名
      "scope": "tenant",             // enum: "tenant" | "workspace" | "settings"
      "view_permission": "billing:view",              // string, 该菜单可见所需的 permission_id
      "actions": ["billing.recharge:create", "..."]   // string[], 该菜单下按钮动作的 permission_id 列表
    }
  ],
  "permissions": [                   // 权限定义数组(仅本次 menus 引用到的 id)
    {
      "permission_id": "billing:view",  // string, 权限唯一 ID。命名见 §4
      "granularity": "menu",            // enum: "menu"(菜单可见) | "page"(子页) | "action"(按钮)
      "description": "查看账单管理"       // string, 中文说明
    }
  ]
}
```

字段约束:
- `menus[].view_permission` 与 `menus[].actions[]` 引用的每个 id,必须在 `permissions[]` 里有定义。
- 同一菜单内 permission_id 不重复;menu key 不重复。

## 4. 命名规范（后端应按此校验,拒绝不合规)

**Permission ID** 正则:

```
/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*:[a-z][a-z0-9_]*$/
```

= **`资源[.子资源]:动作`**
- 冒号左=资源域,`.` 可嵌套子资源(`billing.invoice`、`billing.invoice_title`)
- 冒号右=动作(view/create/edit/delete/manage/apply/download/…)
- 全小写 snake_case,首字符字母,仅字母/数字/下划线

**Menu key** 正则:`/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/`（如 `api-keys`、`billing`）。

**Granularity** 三档:`menu`(顶级菜单可见) / `page`(子页可见) / `action`(按钮动作)。

## 5. 市场（国内 / 国外）语义

- 前端推**两次**:`market=china`(国内,body 含发票等国内特例)、`market=global`(国外,body 已剔除国内特例)。
- 后端**按 market 分别存两套目录**;同一 permission_id 在两市场可存在于一套、不存在于另一套(例:`billing.invoice:view` 仅 china)。
- 后端「菜单权限管理」运营页已有市场维度(发票显「仅国内」),需与此推送一致。
- 角色→权限的授权矩阵也应**按市场独立**(china 的 owner 与 global 的 owner 可授不同权限集)。

## 6. 版本号 · 全量 vs 增量

- `catalog_version` **变化**(与后端上次记录的该市场版本不同)→ **全量刷新**该市场目录:以本次推送为准,旧目录中本次未出现的菜单/权限**标废弃**,不做保守增量。
- `catalog_version` **不变** → **增量对账**:只处理新增/更新,返回差异。
- 目的:结构大改后 bump 版本强制全量,清掉增量遗留的脏数据。

## 7. 响应（统一信封）

```jsonc
{
  "code": 0,               // 0=成功,非 0=失败(附 msg / request_id)
  "data": {
    "market": "china",     // 本次落库的市场
    "catalog_version": "1.0.0",  // 本次落库的版本
    "synced_at": "2026-07-14T10:00:00Z",  // 该市场本次同步时间(供 admin 展示)
    "applied": true,       // 是否已落库(dry_run=true 时应为 false)
    "has_changes": false,  // 与后端现状是否有差异
    "full_refresh": false, // 是否因版本变化走了全量刷新
    "created_menu_keys": [],
    "updated_menu_keys": [],
    "deprecated_menu_keys": [],   // 全量模式下,本次未出现而被废弃的
    "created_permission_ids": [],
    "updated_permission_ids": []
  },
  "request_id": "…"
}
```

## 7.5 市场准入规则 · 归「权限门」（不进 platform-config）

登录/注册/绑手机/模型体验这类**所有人可见、但需按市场强制约束**的行为,归权限体系的**权限门**(admin /perm-gate,路由级 enforce 拦截),不是 platform-config 的配置项。规则是**硬规则**:国内邮箱注册 = 无法注册,不是"开关可调"。

**后端必须在权限门层按市场落这些规则:**

| 规则 | china | global | 强制点(路由级) | 建议错误码 |
| :--- | :--- | :--- | :--- | :--- |
| 邮箱注册 | **拒绝**(无法注册) | 放行 | `POST /v1/auth/register`(email 通道) | `SIGNUP_METHOD_NOT_AVAILABLE` |
| 手机注册 | 放行 | 拒绝 | `POST /v1/auth/register`(phone 通道)/ sms 发码 | 同上 |
| 强制绑手机 | **已登录且未绑手机 → 拦截业务路由**,仅放行 绑定/登出/会话 相关路由 | 无此门 | 业务 /v1 路由统一前置检查 | `PHONE_BINDING_REQUIRED` |
| 模型体验约束 | 按市场规则约束(匿名限次等) | 同左 | /v1/experience/* | — |

- **前端行为**(已实现,规则化硬编码即正解):国内不渲染邮箱注册入口、登录后未绑手机弹不可跳过的绑定弹窗;这只是体验层,**真正的拦截必须在权限门**(同 §11 "前端隐藏只是体验优化"原则)。
- 前端会把上述错误码映射为对应引导(如收到 `PHONE_BINDING_REQUIRED` → 拉起绑定弹窗),错误码定稿后同步给前端。
- platform-config 保持只管站点能力(支付渠道/币种/登录方式列表),**不加** signup/绑手机字段。

## 8. 后端必须实现（本契约为准）

1. **接受** query 参数 `dry_run`、`market`、`catalog_version`;body 只解析 §3 三段,多余字段忽略(不得再对整包 400)。
2. **按 `market` 分库存**两套独立目录(china / global);同一 permission_id 可只存在于其一。
3. **`catalog_version` 变化 → 全量刷新**该市场目录(§5):旧目录本次未出现者标废弃;版本不变则增量对账。
4. **角色→权限授权矩阵按市场独立**;admin「菜单权限管理」按市场展示对应目录。
5. **返回各市场上次同步时间**(响应 `data.synced_at` 或独立接口),供 admin 页展示「上次同步时间」。
6. 按 §4 正则**校验** permission_id / menu key,不合规拒绝并回明确 msg。
