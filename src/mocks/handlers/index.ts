import { authHandlers } from './auth'
import { modelsHandlers } from './models'
import { apiKeyHandlers } from './api-keys'
import { billingUsageHandlers } from './billing-usage'
import { docsHandlers } from './docs'
import { invitationHandlers } from './invitations'
import { workspaceHandlers } from './workspaces'
import { tenantHandlers } from './tenants'
import { observabilityHandlers } from './observability'
import { guardrailHandlers } from './guardrails'
export const handlers = [
  ...authHandlers,
  ...modelsHandlers,
  ...apiKeyHandlers,
  ...billingUsageHandlers,
  ...docsHandlers,
  ...invitationHandlers,
  ...workspaceHandlers,
  ...tenantHandlers,
  ...observabilityHandlers,
  ...guardrailHandlers,
]
