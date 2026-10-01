/**
 * Authenticated server actions. Action tools reach the record room with
 * per-record RBAC turned off, so every action must authorize the caller
 * itself (role, ownership) before reading or writing on their behalf.
 */

import type { Hono } from 'hono'
import { apiWorkerFetch, normalizeApiError } from 'deepspace/worker'
import type { ActionResult, ActionTools, VerifyResult } from 'deepspace/worker'
import { actions } from '../actions/index.js'
import { integrations } from '../integrations.js'
import type { AppContext, Env } from '../../worker.js'

type ResolveAuth = (req: Request, env: Env) => Promise<VerifyResult | null>

export function registerActionRoutes(app: Hono<AppContext>, resolveAuth: ResolveAuth): void {
  app.post('/api/actions/:name', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Unauthorized' }, 401)
    // Actions need the raw bearer token (user-billed integrations forward it).
    const authHeader = c.req.header('Authorization') ?? ''
    const callerJwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!callerJwt) return c.json({ error: 'Unauthorized' }, 401)
    // Attribution for RBAC-off, owner-billed work; the name is quoted, never raw.
    console.info(`[action] ${JSON.stringify(c.req.param('name'))} caller=${auth.userId}`)
    const name = c.req.param('name')
    const action = actions[name]
    if (!action) return c.json({ error: 'Action not found' }, 404)
    const params = await c.req.json<Record<string, unknown>>()
    const tools = createActionTools(c.env, auth.userId, callerJwt)
    const result = await action({ userId: auth.userId, params, tools, env: c.env, callerJwt })
    return c.json(result as unknown as Record<string, unknown>)
  })
}

function createActionTools(env: Env, userId: string, callerJwt: string): ActionTools {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.DEEPSPACE_APP_ID}`))

  async function execTool<TData>(
    tool: string,
    params: Record<string, unknown>,
  ): Promise<ActionResult<TData>> {
    const res = await stub.fetch(
      new Request('https://internal/api/tools/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
          'X-App-Action': 'true',
        },
        body: JSON.stringify({ tool, params }),
      }),
    )
    return res.json() as Promise<ActionResult<TData>>
  }

  async function callIntegration<T>(endpoint: string, data?: unknown): Promise<ActionResult<T>> {
    const integrationName = endpoint.split('/')[0]
    const billingMode = integrations[integrationName]?.billing ?? 'developer'

    const jwt = billingMode === 'developer' ? env.APP_OWNER_JWT : callerJwt

    const res = await apiWorkerFetch(env, `/api/integrations/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(data ?? {}),
    })
    const payload = (await res.json()) as Record<string, unknown>
    if (!res.ok || payload.success === false) {
      return { success: false, ...normalizeApiError(res.status, payload) }
    }
    return payload as ActionResult<T>
  }

  return {
    create: (collection, data, recordId) =>
      execTool('records.create', { collection, data, recordId }),
    update: (collection, recordId, data) =>
      execTool('records.update', { collection, recordId, data }),
    remove: (collection, recordId) => execTool('records.delete', { collection, recordId }),
    deleteWhere: (collection, where, limit) =>
      execTool('records.deleteWhere', { collection, where, limit }),
    get: (collection, recordId) => execTool('records.get', { collection, recordId }),
    query: (collection, options) => execTool('records.query', { collection, ...options }),
    integration: callIntegration,
    registerUser: (options) => execTool('users.register', { ...options }),
  }
}
