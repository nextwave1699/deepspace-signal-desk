import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import generouted from '@generouted/react-router/plugin'
import { cloudflare } from '@cloudflare/vite-plugin'
import checker from 'vite-plugin-checker'
import { deepspaceBuild } from 'deepspace/build'
import { prerender } from './prerender.ts'

const appDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    generouted(),
    cloudflare(),
    deepspaceBuild({ appDir }),
    // Prerenders public pages and writes sitemap.xml / robots.txt.
    prerender(),
    // Rules-of-Hooks lint as a dev overlay and a build failure.
    checker({
      eslint: {
        lintCommand: 'eslint .',
        useFlatConfig: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    // Scan route files up front so the first dev boot does not re-optimize and
    // reload. Scoped to src/pages to keep worker-only modules out of the client.
    entries: ['./index.html', './src/pages/**/*.tsx'],
  },
})
