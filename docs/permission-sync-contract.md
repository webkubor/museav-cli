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

## 7.5 市场入口差异 · platform-config 必须字段化

国内/国外的**入口级差异**不属于权限目录,归 `GET /platform-config`(按 site 返回)。当前响应只有 login/pay/withdraw methods,**缺注册与手机号字段**,后端必须补:

| 字段 | 类型 | china | global | 驱动的前端行为 |
| :--- | :--- | :--- | :--- | :--- |
| `signup_methods` | string[] | `["phone"]` | `["email"]` | 注册入口:国外邮箱注册,国内无邮箱注册(手机号) |
| `phone_binding_required` | boolean | `true` | `false` | 登录后强制绑手机弹窗:国内必须绑,国外不绑 |

- 前端现状:这两个差异目前按 `market === 'china'` 硬编码(signup/index.tsx、login/index.tsx、PhoneBindingGuard),字段就绪后改为**直读 platform-config**,删除硬编码判断。
- 语义与既有 `enabled_login_methods` 一致:后端按 site 返回该市场的值,前端零判断直用。

## 8. 后端必须实现（本契约为准）

1. **接受** query 参数 `dry_run`、`market`、`catalog_version`;body 只解析 §3 三段,多余字段忽略(不得再对整包 400)。
2. **按 `market` 分库存**两套独立目录(china / global);同一 permission_id 可只存在于其一。
3. **`catalog_version` 变化 → 全量刷新**该市场目录(§5):旧目录本次未出现者标废弃;版本不变则增量对账。
4. **角色→权限授权矩阵按市场独立**;admin「菜单权限管理」按市场展示对应目录。
5. **返回各市场上次同步时间**(响应 `data.synced_at` 或独立接口),供 admin 页展示「上次同步时间」。
6. 按 §4 正则**校验** permission_id / menu key,不合规拒绝并回明确 msg。
