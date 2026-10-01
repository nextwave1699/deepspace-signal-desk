import type { Hono } from 'hono'
import { registerAgentToolRoutes, resolveAppMembership } from 'deepspace/worker'
import type { AgentToolAccessResult, JwtClaims } from 'deepspace/worker'
import type { buildTools } from './tools.js'
import { registerAiChatRoutes } from './chat-routes.js'
import { resolveAgentAuth, resolveAuth } from '../server/http-routes.js'
import type { AppContext, Env } from '../../worker.js'

type ToolFactory = typeof buildTools

export interface AgentAuthorizationContext {
  userId: string
  claims: JwtClaims
  request: Request
  env: Env
}

export interface RegisterAgentOptions {
  tools: ToolFactory
  inApp?: boolean
  local?: boolean
  /** Narrows access further after identity and membership checks pass. */
  authorize?: (context: AgentAuthorizationContext) => boolean | Promise<boolean>
}

function createAccessResolver(options: RegisterAgentOptions, resolveIdentity: typeof resolveAuth) {
  return async (request: Request, env: Env): Promise<AgentToolAccessResult> => {
    const auth = await resolveIdentity(request, env)
    if (!auth) return { ok: false, status: 401 }

    // A membership read that could not complete is a retryable 503, never a 403.
    const membership = await resolveAppMembership(env, auth.userId, request.signal)
    if (!membership) return { ok: false, status: 503 }
    if (!membership.member) return { ok: false, status: 403 }

    if (options.authorize) {
      try {
        if (
          !(await options.authorize({ userId: auth.userId, claims: auth.claims, request, env }))
        ) {
          return { ok: false, status: 403 }
        }
      } catch {
        return { ok: false, status: 503 }
      }
    }

    return { ok: true, auth }
  }
}

/** Registers the in-app chat and local-agent tool routes under one access policy. */
export function registerAgent(app: Hono<AppContext>, options: RegisterAgentOptions): void {
  if (options.inApp !== false) {
    registerAiChatRoutes(app, createAccessResolver(options, resolveAuth), options.tools)
  }
  if (options.local !== false) {
    registerAgentToolRoutes(app, {
      buildTools: options.tools,
      resolveAccess: createAccessResolver(options, resolveAgentAuth),
    })
  }
}
