# 发票 / 开票 API 契约（V1.2 功能块 B）

> 给后端：客户控制台「发票/开票」功能所需接口。前端已按此契约实现 UI（services/invoice.ts 为 Mock 占位），接口就绪后前端只换实现、不改调用。
> 范围：**国内增值税发票**（普票/专票）。海外 Invoice 流程差异见末尾「海外」。
> 所有接口挂在 tenant 级；`{tenantId}` 为路径参数。沿用项目统一响应包 `{ code, msg, data, request_id, trace_id }`，`code=0` 成功。

---

## 一、枚举

| 枚举 | 取值 | 含义 |
|---|---|---|
| `title_type` | `vat_normal` / `vat_special` / `overseas` | 增值税普票 / 增值税专票 / 国外 Invoice |
| `invoice_status`（充值单维度） | `billable` / `invoicing` / `invoiced` / `failed` / `voided` | 可开票 / 开票中 / 已开票 / 开票失败 / 已红冲 |
| `status`（发票维度） | `invoicing` / `invoiced` / `failed` / `voided` | 开票中 / 已开票 / 开票失败 / 已红冲 |

---

## 二、接口清单

### 1. 可开票充值列表
`GET /tenants/{tenantId}/invoices/recharges`

申请开票页的充值勾选列表（企业组织充值均可开票；个人组织不应有此入口）。

**响应 data**
```jsonc
{
  "items": [
    {
      "recharge_id": "string",        // 充值单 ID
      "order_no": "RC20260601A7F3",   // 充值单号（展示）
      "amount": "500.00",             // 金额（string 小数）
      "currency": "CNY",
      "invoice_status": "billable",   // billable 可勾选；invoiced 已开（禁用勾选）
      "invoice_no": "INV-0009"        // 已开票时关联的发票号，可空
    }
  ]
}
```
> 已开票/开票中的充值不可再次开票（前端置灰）。

### 2. 发票记录列表
`GET /tenants/{tenantId}/invoices?status={status}&keyword={kw}&cursor={cursor}`

- `status` 可选，按发票状态筛选
- `keyword` 可选，搜发票号 / 抬头
- `cursor` 可选，游标分页（「加载更多」）

**响应 data**
```jsonc
{
  "items": [
    {
      "invoice_no": "INV-0009",          // 平台发票编号（展示）
      "status": "invoiced",
      "title_type": "vat_special",
      "total_amount": "1000.00",         // 价税合计（= 实付金额，价内含税）
      "currency": "CNY",
      "company_name": "上海某某网络科技有限公司",  // 抬头
      "tax_serial": "24317000000123456789",     // 税局发票号码，开票成功后有
      "error_msg": "出票失败：开票员未在有效时间内完成人脸认证…", // failed 时有
      "download_url": "https://…"        // invoiced 时有；或走接口 4
    }
  ],
  "has_more": true,
  "total": 7
}
```

### 3. 合并开票（提交）
`POST /tenants/{tenantId}/invoices`

勾选一或多笔「可开票且未开」充值合开一张。约束：**同一抬头 / 同 region / 同币种**。

**请求 body**
```jsonc
{
  "recharge_ids": ["r1", "r2"],   // 合并的充值单 ID（≥1）
  "title_id": "t1",               // 发票抬头 ID
  "title_type": "vat_special"     // 票种（默认取抬头自身类型，对公转账默认专票）
}
```
**响应 data**：`{ "invoice_no": "INV-PENDING", "status": "invoicing" }`
> 提交成功即已自动发起 FAPI 开票任务并返回「开票中」，不再等待运营二次点击；后续由服务商异步回调推进状态（开票中 → 已开票 / 开票失败）。所选充值整体进入「开票中」。

### 4. 下载发票
`GET /tenants/{tenantId}/invoices/{invoiceNo}/download`
**响应 data**：`{ "url": "https://…/INV-0009.pdf" }`（源文件 PDF/XML）。

### 5. 重新开具（失败重试）
`POST /tenants/{tenantId}/invoices/{invoiceNo}/retry`
仅 `status=failed` 可调；重新发起 FAPI 开票任务、回到「开票中」。**响应 data**：`{ "invoice_no": "INV-PENDING", "status": "invoicing" }`

### 6. 发票抬头列表
`GET /tenants/{tenantId}/invoice-titles`
与「组织设置 → 开票信息」同源。**响应 data**
```jsonc
{
  "items": [
    {
      "id": "t1",
      "type": "vat_special",
      "company_name": "上海某某网络科技有限公司",
      "tax_id": "91310000MA1FL***XY",   // 统一社会信用代码
      "email": "finance@demo-corp.com", // 接收邮箱
      "is_default": true,               // 唯一默认，开票时自动带出
      // 专票额外 4 项（普票为空）：
      "reg_address": "上海市浦东新区张江路 88 号 5 楼",
      "reg_phone": "021-0688 7610",
      "bank_name": "招商银行上海张江支行",
      "bank_account": "1219 0688 7610 901"
    }
  ]
}
```

### 7. 新增抬头
`POST /tenants/{tenantId}/invoice-titles`
**请求 body**（专票必填 4 项，普票仅前 4 字段）
```jsonc
{
  "type": "vat_special",
  "company_name": "…",
  "tax_id": "…",
  "email": "…",
  "reg_address": "…",   // 专票必填
  "reg_phone": "…",     // 专票必填
  "bank_name": "…",     // 专票必填
  "bank_account": "…"   // 专票必填
}
```
**响应 data**：`{ "ok": true }`（或返回新建的抬头对象）

### 8. 设为默认抬头
`PATCH /tenants/{tenantId}/invoice-titles/{titleId}/default`
设为唯一默认（自动取消其他默认）。**响应 data**：`{ "ok": true }`

---

## 三、业务规则（PRD §4，供后端对齐）

- **平台统一承担增值税**：充多少付多少（面额=实付=到账），所有充值可开票；充值弹窗无发票开关。
- **价内税（征收率 1%）**：价税合计 = 实付金额；税额 = 价税合计 ÷ 1.01 × 1%；不含税 = 价税合计 ÷ 1.01。例：充 500 → 价税合计 500、税额 4.95、不含税 495.05。
- **税收分类编码**：`3040203000000000000`「信息技术服务」，分类简称「生产生活服务」，发票项目名 `*生产生活服务*信息技术服务`；票种增值税电子普通发票；`tax_rate=0.01`、`is_contain_tax=含税`。
- **状态机**：未开票(可开) → 开票中（含 FAPI 返回的等待验证 / 执行中等中间态，只展示不由 admin 人工提交）→ 已开票 / 开票失败；已开票可被运营红冲 → 已红冲（原票作废、关联充值释放为可开票）。
- **红冲仅运营端**：客户端无红冲入口（D-INV15）。
- **合并约束**：同一抬头 / 同 region / 同币种；红冲时整张一起冲、关联多笔充值一起释放。
- **个人组织不开票**（D-INV11）：仅企业组织可开票，个人组织无「发票」入口。
- **抬头手工维护**：fpapi 无企业抬头查询接口，不做模糊带出。

---

## 四、海外（Invoice，site=international）

海外无增值税、无服务商、无红冲：客户选 Invoice 抬头 → 平台**直接生成 PDF** → 下载 / 邮件送达。可复用接口 3/4 的形态（`title_type=overseas`），但 `status` 仅 `invoiced`、无「开票中」中间态、无 `tax_serial`、`total_amount` 即实付金额（无税额）。需更正走「作废重开」。

---

## 五、未纳入（fpapi 无对应接口，前端不做）

发票查验、企业抬头查询、开票额度查询 —— 均不提供（D-INV）。
