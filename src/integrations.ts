/**
 * Who pays for each integration: 'developer' (app owner, the default) or
 * 'user' (the signed-in caller). Integrations backed by per-user OAuth tokens
 * must be 'user', otherwise calls act on the owner's connected account.
 */
export const integrations: Record<string, { billing: 'developer' | 'user' }> = {
  google: { billing: 'user' },
}
