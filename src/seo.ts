import { APP_NAME } from './constants'

/** Injected by prerender.ts from the deploy target; absent in unit tests. */
declare const __DEEPSPACE_SITE_ORIGIN__: string | undefined

export const seo = {
  title: `${APP_NAME} | AI incident intelligence for engineering teams`,
  description: `${APP_NAME} turns production logs, errors and stack traces into ranked root-cause hypotheses with the evidence for and against each, a shared timeline and a post-incident report.`,
  origin: typeof __DEEPSPACE_SITE_ORIGIN__ === 'string' ? __DEEPSPACE_SITE_ORIGIN__ : 'http://localhost',
  noindex: false,
}
