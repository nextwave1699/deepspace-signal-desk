/**
 * Vite plugin that prerenders the public pages after `vite build` so crawlers
 * get real HTML. Writes flat <route>.html files (auto-trailing-slash serves
 * them without a redirect), the empty `_spa.html` shell for client routes,
 * and sitemap.xml / robots.txt. `deepspace dev` never runs it.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build as viteBuild, type Plugin, type ResolvedConfig } from 'vite'
import react from '@vitejs/plugin-react'

const appDir = fileURLToPath(new URL('.', import.meta.url))
const ENTRY = 'src/prerender-entry.tsx'
const SHELL_FILE = '_spa.html'
const ROOT_PLACEHOLDER = '<div id="root"></div>'
/** React 19 puts hoisted head tags before _app's root element. */
const BODY_ANCHOR = '<div data-testid="app-root"'
/** Keeps the nested SSR build from re-running this plugin. */
const PASS_ENV = 'DEEPSPACE_PRERENDER_PASS'

interface Entry {
  PRERENDER_ROUTES: readonly string[]
  render(route: string): string
  seo: { origin: string; noindex: boolean }
}

/** From DEEPSPACE_SITE_ORIGIN at deploy, else derived from wrangler.toml's name. */
function siteOrigin(): string {
  if (process.env.DEEPSPACE_SITE_ORIGIN) return process.env.DEEPSPACE_SITE_ORIGIN
  const name = /^name\s*=\s*"([^"]+)"/m.exec(readFileSync(join(appDir, 'wrangler.toml'), 'utf8'))?.[1]
  return name ? `https://${name}.app.space` : 'http://localhost'
}

export function prerender(): Plugin {
  let config: ResolvedConfig
  let ran = false

  return {
    name: 'prerender',
    enforce: 'post',
    config() {
      return { define: { __DEEPSPACE_SITE_ORIGIN__: JSON.stringify(siteOrigin()) } }
    },
    configResolved(resolved) {
      config = resolved
    },
    async closeBundle() {
      if (config.command !== 'build' || ran || process.env[PASS_ENV]) return
      // Only the client environment's output contains the HTML template.
      const clientDir = join(config.root, 'dist', 'client')
      const envOutDir = this.environment?.config?.build?.outDir
      if (envOutDir ? resolve(config.root, envOutDir) !== clientDir : this.environment?.name !== 'client') return
      ran = true

      const templatePath = join(clientDir, 'index.html')
      const template = readFileSync(templatePath, 'utf8')
      if (!template.includes(ROOT_PLACEHOLDER)) {
        throw new Error(`[prerender] dist/client/index.html has no '${ROOT_PLACEHOLDER}' to fill — keep the scaffold's empty root container.`)
      }

      // 1. Isolated SSR pass with the client's defines and alias, without this plugin.
      const ssrDir = join(config.root, 'dist', 'prerender')
      process.env[PASS_ENV] = '1'
      try {
        await viteBuild({
          configFile: false,
          root: config.root,
          mode: 'production',
          logLevel: 'warn',
          define: config.define,
          resolve: { alias: { '@': join(config.root, 'src') }, dedupe: ['react', 'react-dom'] },
          plugins: [react()],
          build: {
            ssr: join(config.root, ENTRY),
            outDir: ssrDir,
            emptyOutDir: true,
            rollupOptions: { output: { entryFileNames: 'entry.mjs' } },
          },
        })
      } finally {
        delete process.env[PASS_ENV]
      }
      const entry = (await import(pathToFileURL(join(ssrDir, 'entry.mjs')).href)) as Entry
      const { origin, noindex } = entry.seo

      // 2. The plain shell first, from the untouched template.
      writeFileSync(join(clientDir, SHELL_FILE), noindex ? withNoindexMeta(template) : template)

      // 3. Each page (the template was read above, so overwriting index.html is safe).
      const routes = entry.PRERENDER_ROUTES
      for (const route of routes) {
        const html = entry.render(route)
        const at = html.indexOf(BODY_ANCHOR)
        if (at < 0) throw new Error(`[prerender] ${route} rendered no '${BODY_ANCHOR}' — src/pages/_app.tsx root markup changed?`)
        const head = html.slice(0, at)
        const body = html.slice(at)
        if (!head.includes('<title>') || !head.includes('name="description"')) {
          throw new Error(`[prerender] ${route} rendered no <title>/description — render <Seo {...seo} path="${route}" /> first in the page.`)
        }
        if (!body.includes('<h') && !body.includes('<p')) {
          throw new Error(`[prerender] ${route} rendered an empty page — public pages must return markup without a browser.`)
        }
        const page = stampHead(template, head).replace(
          ROOT_PLACEHOLDER,
          // A replacer function, because a replacement string would expand `$&` in page copy.
          () => `<div id="root" data-prerendered="${route}">${body}</div>`,
        )
        if (page.includes('__DEEPSPACE_APP_ID__')) {
          throw new Error(`[prerender] ${route} contains the literal __DEEPSPACE_APP_ID__; the deploy would refuse it.`)
        }
        const file = join(clientDir, route === '/' ? 'index.html' : `${route.slice(1)}.html`)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, page)
      }

      // 4. Crawler files.
      const robotsPath = join(clientDir, 'robots.txt')
      if (noindex) {
        writeFileSync(robotsPath, 'User-agent: *\nDisallow: /\n')
      } else {
        const robots = existsSync(robotsPath) ? readFileSync(robotsPath, 'utf8') : 'User-agent: *\nAllow: /\n'
        if (!/^Sitemap:/m.test(robots)) writeFileSync(robotsPath, `${robots.trimEnd()}\n\nSitemap: ${origin}/sitemap.xml\n`)
        writeFileSync(
          join(clientDir, 'sitemap.xml'),
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes
            .map((route) => `  <url><loc>${origin}${route}</loc></url>`)
            .join('\n')}\n</urlset>\n`,
        )
      }

      rmSync(ssrDir, { recursive: true, force: true })
      console.log(`[prerender] wrote ${routes.length} page(s) [${routes.join(', ')}], ${SHELL_FILE}, robots.txt${noindex ? ' (noindex)' : ', sitemap.xml'}`)
    },
  }
}

/**
 * Replace the template's title/description/canonical/og tags with the page's
 * <Seo> output. Throws if a strip no-ops, which would ship duplicate titles.
 */
function stampHead(template: string, head: string): string {
  const stripped = template
    .replace(/<title>[\s\S]*?<\/title>\s*/g, '')
    .replace(/<meta\s+name="(?:description|robots)"[^>]*>\s*/g, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/g, '')
    .replace(/<meta\s+(?:property|name)="(?:og|twitter):[^>]*>\s*/g, '')
  for (const leftover of ['<title', 'name="description"', 'rel="canonical"', 'property="og:']) {
    if (stripped.includes(leftover)) {
      throw new Error(`[prerender] could not strip '${leftover}' from index.html — keep its head to the scaffold's shape and put SEO tags in <Seo>.`)
    }
  }
  return stripped.replace('</head>', () => `${head}\n  </head>`)
}

function withNoindexMeta(template: string): string {
  return template.replace('</head>', () => `<meta name="robots" content="noindex, nofollow"/>\n  </head>`)
}
