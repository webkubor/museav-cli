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
    "applied": true,       // 是否已落库(dry_run=true 时应为 false)
    "has_changes": false,  // 与后端现状是否有差异
    "created_menu_keys": [],
    "updated_menu_keys": [],
    "deprecated_menu_keys": [],   // 全量模式下,本次未出现而被废弃的
    "created_permission_ids": [],
    "updated_permission_ids": []
  },
  "request_id": "…"
}
```

## 8. 后端当前待办(与本契约的差距)

1. 接受并处理 query 参数 `market`、`catalog_version`(现在似乎未真正区分市场)。
2. 按 `market` 分库存两套目录(china / global)。
3. 实现 `catalog_version` 变化触发**全量刷新**。
4. 角色授权矩阵按市场独立。
5. (可选)返回各市场**上次同步时间**,供 admin「菜单权限管理」展示。
