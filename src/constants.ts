export const APP_NAME = 'SignalDesk'

/**
 * Injected at build time from DEEPSPACE_APP_ID in wrangler.toml, so each
 * environment reads its own rooms. Never replace it with a literal.
 */
declare const __DEEPSPACE_APP_ID__: string
export const APP_ID: string = __DEEPSPACE_APP_ID__

export const SCOPE_ID = `app:${APP_ID}`

export { ROLES, ROLE_CONFIG, type Role } from 'deepspace'
