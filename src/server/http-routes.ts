/**
 * Proxies to DeepSpace platform services. Caller identity comes only from a
 * verified JWT; caller-supplied identity headers are always stripped.
 */

import type { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import {
  apiWorkerFetch,
  authWorkerFetch,
  BROWSER_PROXY_ROUTES,
  isPlatformReservedPath,
  platformWorkerFetch,
  resolveAppRole,
  resolveSessionReadAuth,
  SESSION_COOKIE,
  verifyAgentToken,
  verifyJwt,
  nativeAuthCallback,
  nativeAuthExchange,
  nativeAuthMe,
  nativeAuthSignOut,
  nativeAuthStart,
  nativeAuthToken,
} from 'deepspace/worker'
import type { ExpoAuthBridgeOptions, JwtVerifierConfig, VerifyResult } from 'deepspace/worker'
import { integrations } from '../integrations.js'
import type { AppContext, Env } from '../../worker.js'

function jwtConfig(env: Env): JwtVerifierConfig {
  return { publicKey: env.AUTH_JWT_PUBLIC_KEY, issuer: env.AUTH_JWT_ISSUER }
}

export async function resolveAuth(req: Request, env: Env): Promise<VerifyResult | null> {
  const header = req.headers.get('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  return (await verifyJwt(jwtConfig(env), token)).result
}

/** Agent credentials are valid only at the exact origin receiving the request. */
export async function resolveAgentAuth(req: Request, env: Env): Promise<VerifyResult | null> {
  const header = req.headers.get('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  return (await verifyAgentToken(jwtConfig(env), token, new URL(req.url).origin)).result
}

function reassertAppIdentity(headers: Headers, env: Env): void {
  headers.delete('x-app-identity-token')
  headers.delete('x-app-id')
  if (!env.APP_IDENTITY_TOKEN) return
  headers.set('x-app-identity-token', env.APP_IDENTITY_TOKEN)
  headers.set('x-app-id', env.DEEPSPACE_APP_ID)
}

export function registerAuthAndIntegrationRoutes(app: Hono<AppContext>): void {
  const nativeAuthOptions = (env: Env): ExpoAuthBridgeOptions => ({
    allowedRedirectUris: (env.NATIVE_AUTH_REDIRECT_URIS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  })

  // Native routes must precede the auth wildcard below.
  app.get('/api/auth/native-start', (c) => nativeAuthStart(c.req.raw, c.env, nativeAuthOptions(c.env)))
  app.post('/api/auth/native-exchange', (c) => nativeAuthExchange(c.req.raw, c.env))
  app.post('/api/auth/native-token', (c) => nativeAuthToken(c.req.raw, c.env))
  app.get('/api/auth/native-me', (c) => nativeAuthMe(c.req.raw, c.env))
  app.post('/api/auth/native-signout', (c) => nativeAuthSignOut(c.req.raw, c.env))

  app.get('/api/auth/social-redirect', (c) => {
    const provider = c.req.query('provider')
    if (!provider) return c.json({ error: 'Missing provider' }, 400)

    const appOrigin = new URL(c.req.url).origin
    const authOrigin = new URL(c.env.AUTH_WORKER_URL).origin

    return c.redirect(
      `${authOrigin}/login/social?provider=${encodeURIComponent(provider)}&returnTo=${encodeURIComponent(appOrigin)}`,
    )
  })

  app.get('/api/auth/oauth-complete', async (c) => {
    if (c.req.query('redirect_uri')) {
      return nativeAuthCallback(c.req.raw, c.env, nativeAuthOptions(c.env))
    }
    const code = c.req.query('code')
    const appOrigin = new URL(c.req.url).origin
    // `/` is static (no auth providers), so signed-in users land on /home.
    const appHome = `${appOrigin}/home`

    if (!code) return c.redirect(appHome)

    const res = await authWorkerFetch(c.env, '/api/auth/exchange-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })

    if (!res.ok) return c.redirect(appHome)
    const data = (await res.json()) as { sessionToken?: string }
    if (!data.sessionToken) return c.redirect(appHome)
    const sessionToken = data.sessionToken

    return new Response(null, {
      status: 302,
      headers: {
        Location: appHome,
        'Set-Cookie': `${SESSION_COOKIE}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
      },
    })
  })

  app.all('/api/auth/sign-out', async (c) => {
    try {
      await authWorkerFetch(c.env, '/api/auth/sign-out', {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
      })
    } catch {
      // Expire the cookie anyway so a failed upstream call cannot keep the user signed in.
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      },
    })
  })

  app.all('/api/auth/*', async (c) => {
    const url = new URL(c.req.url)
    const res = await authWorkerFetch(c.env, url.pathname + url.search, {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
    })
    const headers = new Headers(res.headers)
    const setCookie = headers.get('set-cookie')
    if (setCookie) {
      headers.set('set-cookie', setCookie.replace(/;\s*Domain=[^;]*/gi, ''))
    }
    return new Response(res.body, { status: res.status, headers })
  })

  app.all('/api/debug/*', async (c) => {
    if (c.env.ALLOW_DEBUG_ROUTES !== 'true') {
      return c.notFound()
    }
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'unauthorized' }, 401)
    if ((await resolveAppRole(c.env, auth.userId)) !== 'admin') {
      return c.json({ error: 'forbidden' }, 403)
    }
    const stub = c.env.RECORD_ROOMS.get(
      c.env.RECORD_ROOMS.idFromName(`app:${c.env.DEEPSPACE_APP_ID}`),
    )
    return stub.fetch(c.req.raw)
  })

  app.get('/api/integrations', async (c) => {
    try {
      const res = await apiWorkerFetch(c.env, '/api/integrations')
      return new Response(res.body, { status: res.status, headers: res.headers })
    } catch {
      return c.json({ error: 'Failed to fetch integration catalog' }, 502)
    }
  })

  // OAuth connection state is always user-billed, so forward the caller JWT.
  app.get('/api/integrations/status', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Sign in required' }, 401)
    const token = c.req.header('Authorization')?.slice(7)
    try {
      const res = await apiWorkerFetch(c.env, '/api/integrations/status', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      return new Response(res.body, { status: res.status, headers: res.headers })
    } catch {
      return c.json({ error: 'Status proxy failed' }, 502)
    }
  })

  app.delete('/api/integrations/oauth/:provider/disconnect', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Sign in required' }, 401)
    const token = c.req.header('Authorization')?.slice(7)
    const provider = c.req.param('provider')
    try {
      const res = await apiWorkerFetch(
        c.env,
        `/api/integrations/oauth/${encodeURIComponent(provider)}/disconnect`,
        {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      )
      return new Response(res.body, { status: res.status, headers: res.headers })
    } catch {
      return c.json({ error: 'Disconnect proxy failed' }, 502)
    }
  })

  app.all('/api/integrations/:name/:endpoint', async (c) => {
    const integrationName = c.req.param('name')
    const billingMode = integrations[integrationName]?.billing ?? 'developer'

    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth && billingMode === 'user') {
      return c.json({ error: 'Sign in required for this integration' }, 401)
    }

    const target = `/api/integrations/${integrationName}/${c.req.param('endpoint')}`
    const headers: Record<string, string> = {
      'Content-Type': c.req.header('Content-Type') ?? 'application/json',
    }

    // The api-worker bills the JWT subject, so billing mode picks which JWT to send.
    if (billingMode === 'developer') {
      headers['Authorization'] = `Bearer ${c.env.APP_OWNER_JWT}`
    } else {
      const token = c.req.header('Authorization')?.slice(7)
      if (token) headers['Authorization'] = `Bearer ${token}`
    }

    if (c.env.APP_IDENTITY_TOKEN) {
      headers['x-app-identity-token'] = c.env.APP_IDENTITY_TOKEN
      headers['x-app-id'] = c.env.DEEPSPACE_APP_ID
    }

    const hasBody = c.req.method !== 'GET' && c.req.method !== 'HEAD'
    const body = hasBody ? await c.req.text() : undefined

    try {
      const res = await apiWorkerFetch(c.env, target, {
        method: c.req.method,
        headers,
        body,
      })
      return new Response(res.body, { status: res.status, headers: res.headers })
    } catch {
      return c.json({ error: 'Integration proxy failed' }, 502)
    }
  })
}

export function registerPlatformProxyRoutes(app: Hono<AppContext>): void {
  app.all('/api/files/*', async (c) => {
    // Cookie fallback lets private files render in <img>/<video>; it stays out
    // of resolveAuth because that also gates writes.
    const auth =
      (await resolveAuth(c.req.raw, c.env)) ?? (await resolveSessionReadAuth(c.req.raw, c.env))
    const userId = auth?.userId ?? null

    const url = new URL(c.req.url)
    const platformUrl = new URL(c.req.url)
    platformUrl.pathname = url.pathname.replace('/api/files', '/internal/files')

    const headers = new Headers(c.req.raw.headers)
    // platform-worker trusts x-user-id, so it must only ever come from the verified JWT.
    headers.delete('x-user-id')
    reassertAppIdentity(headers, c.env)
    if (userId) headers.set('x-user-id', userId)

    const resp = await platformWorkerFetch(
      c.env,
      new Request(platformUrl.toString(), {
        method: c.req.method,
        headers,
        body: c.req.raw.body,
      }),
    )

    const contentType = resp.headers.get('content-type') ?? ''
    if (contentType.includes('application/json') && c.req.method !== 'HEAD') {
      const body = (await resp.json()) as Record<string, unknown>
      const rewriteUrl = (value: string) => value.replace(/^https?:\/\/[^/]+/, url.origin)
      if (typeof body.url === 'string') body.url = rewriteUrl(body.url)
      if (Array.isArray(body.files)) {
        for (const file of body.files as Array<Record<string, unknown>>) {
          if (typeof file.url === 'string') file.url = rewriteUrl(file.url)
        }
      }
      return c.json(body, resp.status as ContentfulStatusCode)
    }

    return new Response(resp.body, { status: resp.status, headers: resp.headers })
  })

  // Exact (method, path) allowlist: prefix matching would expose deploy/CLI routes.
  app.all('/_deepspace/*', async (c) => {
    const url = new URL(c.req.url)
    const method = c.req.method
    const route = BROWSER_PROXY_ROUTES.find(
      (candidate) => candidate.method === method && candidate.path === url.pathname,
    )
    if (!route) {
      return c.json({ error: 'not_found' }, 404)
    }

    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth?.userId) return c.json({ error: 'unauthorized' }, 401)

    const forwardedParams = new URLSearchParams(url.search)
    forwardedParams.set('appId', c.env.DEEPSPACE_APP_ID)
    const queryString = forwardedParams.toString()
    const apiPath =
      url.pathname.replace('/_deepspace/', '/api/') + (queryString ? `?${queryString}` : '')

    const headers = new Headers(c.req.raw.headers)
    headers.delete('x-user-id')
    reassertAppIdentity(headers, c.env)
    headers.set('x-user-id', auth.userId)

    return apiWorkerFetch(c.env, apiPath, {
      method,
      headers,
      body: ['GET', 'HEAD'].includes(method) ? undefined : c.req.raw.body,
    })
  })
}

const matches = (pathname: string, prefixes: readonly string[]): boolean =>
  prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

const API_PREFIXES = ['/api']

/** Empty app shell written by prerender.ts, served for client routes. */
const SPA_SHELL_PATH = '/_spa'

/** A path whose last segment has an extension is a file, never a client route. */
function namesAFile(pathname: string): boolean {
  const last = pathname.slice(pathname.lastIndexOf('/') + 1)
  return last.includes('.')
}

/** Register last so the client-route fallback cannot shadow worker routes. */
export function registerStaticRoutes(app: Hono<AppContext>): void {
  // Unknown API calls of any method get a JSON 404, never HTML or plain text.
  app.all('*', async (c, next) => {
    if (matches(new URL(c.req.url).pathname, API_PREFIXES)) {
      return c.json({ error: 'not_found' }, 404)
    }
    await next()
  })

  app.get('*', async (c) => {
    const url = new URL(c.req.url)
    const response = await c.env.ASSETS.fetch(c.req.raw)
    if (response.status !== 404) return response

    if (namesAFile(url.pathname) || isPlatformReservedPath(url.pathname)) {
      return c.json({ error: 'not_found' }, 404)
    }
    // `/` is the prerendered landing, so prefer the empty shell for app routes.
    url.pathname = SPA_SHELL_PATH
    const shell = await c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw))
    if (shell.status !== 404) return shell
    url.pathname = '/'
    return c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw))
  })
}
