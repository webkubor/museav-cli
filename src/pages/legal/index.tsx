/**
 * 控制台法律文档页
 * 职责：承载注册页链接到的隐私政策与服务条款，避免公共 legal 路由为空或 404
 * 路由：/legal/privacy、/legal/terms
 * API：无
 */

import { Link } from 'react-router-dom'
import { LuArrowLeft } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'

type LegalDocType = 'privacy' | 'terms'

interface LegalSection {
  title: string
  paragraphs?: string[]
  items?: string[]
}

interface LegalDocument {
  title: string
  subtitle: string
  updatedAt: string
  summary: string
  sections: LegalSection[]
}

const LEGAL_DOCS: Record<LegalDocType, LegalDocument> = {
  privacy: {
    title: '隐私政策',
    subtitle: 'ModelGo 控制台',
    updatedAt: '生效日期：2026 年 6 月 17 日',
    summary:
      '本政策说明你在使用 ModelGo 控制台、API 网关、模型接入、账单、推荐计划和可观测性功能时，平台如何处理账号、组织、工作空间、API Key 元数据、调用日志与安全数据。',
    sections: [
      {
        title: '1. 我们处理哪些信息',
        items: [
          '账号信息：邮箱、展示名、头像、登录方式、第三方账号绑定状态。',
          '组织与工作空间数据：组织、工作空间、成员、角色、权限、邀请链接、当前活跃租户与工作空间。',
          'API Key 与护栏配置：密钥名称、作用域、状态、创建时间、限额、白名单、风控策略；完整密钥仅在创建时展示一次。',
          '调用与用量数据：模型名称、供应商、请求时间、Token 数、费用、状态、错误码、延迟、任务执行状态。',
          '账单与推荐计划数据：余额、充值订单、发票信息、返佣记录、邀请码和提现申请所需信息。',
          '安全与设备数据：会话 Cookie、CSRF Token、设备指纹、IP、请求头、链路追踪 ID、异常登录与风控命中记录。',
        ],
      },
      {
        title: '2. 我们如何使用这些信息',
        items: [
          '完成注册、登录、会话校验、权限判断和多租户访问控制。',
          '创建、管理和审计 API Key、模型调用、账单、发票、推荐返佣和可观测性配置。',
          '计算用量、费用、Token 消耗、请求趋势、调用日志和任务状态。',
          '识别异常注册、批量验证码请求、撞库、滥用、越权访问和支付风险。',
          '提供客服支持、故障排查、产品安全审计和合规要求下的必要记录。',
        ],
      },
      {
        title: '3. 模型调用内容与日志',
        paragraphs: [
          'ModelGo 会为完成模型请求转发、计费、风控、错误排查和可观测性功能处理调用相关数据。你可以在控制台按工作空间配置可观测性转发、采样率和隐私模式。',
          '隐私模式开启后，可观测性转发优先记录时间、模型、Token、状态、延迟等元数据，减少原始请求与响应正文外发。除非你主动启用相关功能或法律法规另有要求，平台不会把你的业务内容作为公开训练数据使用。',
        ],
      },
      {
        title: '4. Cookie、本地存储与设备标识',
        paragraphs: [
          '控制台使用会话 Cookie 保持登录状态，使用 CSRF Token 防护写操作，并通过本地存储保存语言、主题、当前组织、当前工作空间、设备标识等偏好。设备标识用于安全风控、异常行为识别和问题排查。',
        ],
      },
      {
        title: '5. 信息共享',
        items: [
          '模型供应商：为完成你发起的模型调用，请求会被转发到所选模型或网关供应商。',
          '支付、发票与通知服务：为完成充值、开票、邮件验证码、系统通知和客服支持，必要信息会提供给对应服务方。',
          '基础设施服务：为运行控制台、API 网关、日志、监控和安全防护，必要数据会由云服务和运维系统处理。',
          '法律合规：在法律法规、监管要求、争议处理或保护平台与用户安全所必需的范围内披露。',
        ],
      },
      {
        title: '6. 保存、删除与安全',
        paragraphs: [
          '我们会在实现服务目的、满足账务审计、安全风控、争议处理和法律合规所需期间保存数据。你可以在控制台管理账号、组织、工作空间、API Key、日志转发、发票和推荐计划相关信息。',
          '平台通过权限控制、会话校验、CSRF 防护、密钥脱敏、操作审计和异常检测降低数据泄露与滥用风险。任何系统都无法保证绝对安全，发现异常时请及时通过控制台客服或官网联系方式反馈。',
        ],
      },
      {
        title: '7. 政策更新',
        paragraphs: [
          '当产品能力、数据处理方式或法律要求变化时，我们会更新本政策，并在页面展示最新生效日期。重大变化会通过控制台、官网或其他合理方式提示。',
        ],
      },
    ],
  },
  terms: {
    title: '服务条款',
    subtitle: 'ModelGo 控制台',
    updatedAt: '生效日期：2026 年 6 月 17 日',
    summary:
      '本条款适用于你访问和使用 ModelGo 控制台、API 网关、模型接入、账单、推荐计划、可观测性和相关开发者工具。',
    sections: [
      {
        title: '1. 账号与组织',
        items: [
          '你需要使用真实、可接收通知的邮箱注册账号，并对账号下的操作负责。',
          '组织、工作空间、成员、角色和权限由组织管理员管理。管理员应确保成员权限与实际职责匹配。',
          '不得共享、出售、出租账号、API Key、邀请码或其他访问凭证。',
        ],
      },
      {
        title: '2. API Key 与模型调用',
        items: [
          'API Key 是访问模型网关的安全凭证，应妥善保存；完整密钥仅在创建时展示一次。',
          '你需要确保请求内容、调用方式和下游使用场景符合法律法规、模型供应商政策和平台规则。',
          '平台可能因安全、风控、供应商限制、欠费、异常调用或维护需要限制、暂停或终止部分调用。',
        ],
      },
      {
        title: '3. 费用、账单与返佣',
        items: [
          '模型调用、Token、请求、任务、充值、发票和返佣以控制台和平台账务系统记录为准。',
          '赠送额度、兑换额度、返佣和提现规则以页面展示及平台配置为准，异常套利、同主体刷量和违规邀请可能被审计、冻结或追回。',
          '如发生退款、失败订单、计费争议或发票问题，应通过控制台客服或官网联系方式提交处理。',
        ],
      },
      {
        title: '4. 禁止行为',
        items: [
          '不得进行批量注册、撞库、验证码轰炸、爬取、扫描、绕过限流、攻击、干扰或破坏平台稳定性的行为。',
          '不得上传、生成、传播违法违规、侵权、恶意软件、钓鱼欺诈、侵犯隐私或绕过安全机制的内容。',
          '不得反向工程、滥用优惠、伪造身份、伪造来源、伪造设备标识或规避平台风控。',
        ],
      },
      {
        title: '5. 服务变更与可用性',
        paragraphs: [
          '平台会持续迭代模型、供应商、价格、限额、功能、路由、文档和控制台能力。我们会尽力保持服务稳定，但不承诺所有模型、供应商或功能永久可用。',
          '因供应商故障、网络问题、维护、风控、合规或不可抗力导致的服务不可用，平台会在合理范围内处理和恢复。',
        ],
      },
      {
        title: '6. 终止与更新',
        paragraphs: [
          '如果你违反本条款、法律法规或平台安全规则，平台可以限制、暂停或终止相关账号、组织、工作空间、API Key 或服务访问。本条款更新后继续使用服务，视为接受更新后的条款。',
        ],
      },
    ],
  },
}

interface LegalPageProps {
  docType: LegalDocType
}

function LegalSectionBlock({ section }: { section: LegalSection }) {
  return (
    <section className="space-y-3 border-t border-mg-border pt-6">
      <h2 className="text-base font-bold text-mg-text-1">{section.title}</h2>
      {section.paragraphs?.map((text) => (
        <p key={text} className="text-sm leading-7 text-mg-text-2">
          {text}
        </p>
      ))}
      {section.items && (
        <ul className="space-y-2">
          {section.items.map((item) => (
            <li key={item} className="flex gap-2 text-sm leading-7 text-mg-text-2">
              <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-base" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** 渲染控制台公开法律文档。 */
export default function LegalPage({ docType }: LegalPageProps) {
  const document = LEGAL_DOCS[docType]
  const switchTarget = docType === 'privacy' ? 'terms' : 'privacy'
  const switchLabel = docType === 'privacy' ? '查看服务条款' : '查看隐私政策'

  return (
    <main className="min-h-screen bg-mg-bg-1 px-4 py-8 text-mg-text-1 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link to="/signup">
              <LuArrowLeft size={15} />
              返回注册
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/legal/${switchTarget}`}>{switchLabel}</Link>
          </Button>
        </div>

        <article className="rounded-md border border-mg-border bg-card-bg shadow-sm">
          <header className="border-b border-mg-border px-6 py-7 sm:px-8">
            <div className="mb-2 text-xs font-semibold text-brand-base">{document.subtitle}</div>
            <h1 className="text-3xl font-bold tracking-tight text-mg-text-1">{document.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-mg-text-2">{document.summary}</p>
            <p className="mt-4 text-xs font-medium text-mg-text-3">{document.updatedAt}</p>
          </header>

          <div className="space-y-7 px-6 py-7 sm:px-8">
            {document.sections.map((section) => (
              <LegalSectionBlock key={section.title} section={section} />
            ))}
          </div>
        </article>
      </div>
    </main>
  )
}
