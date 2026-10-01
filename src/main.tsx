import { createRoot, hydrateRoot } from 'react-dom/client'
import { routes } from '@generouted/react-router/lazy'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { installStaleChunkRecovery } from './stale-chunk-recovery'
import './styles.css'

async function main() {
  const root = document.getElementById('root')!
  const router = createBrowserRouter(routes)
  installStaleChunkRecovery(router)

  // Prerendered pages must hydrate with the real route module, not the
  // loading fallback, or React discards the static markup and repaints.
  if (!router.state.initialized) {
    await new Promise<void>((done) => {
      const stop = router.subscribe((state) => {
        if (state.initialized) {
          stop()
          done()
        }
      })
    })
  }

  const app = <RouterProvider router={router} />
  if (root.dataset.prerendered === window.location.pathname && !router.state.errors) {
    hydrateRoot(root, app, {
      onRecoverableError(error) {
        console.error(
          `[prerender] The static HTML for ${window.location.pathname} did not match what React rendered, so React repainted it. ` +
            'Public pages must render the same markup without a browser: no Date.now(), Math.random(), window, or matchMedia during render.',
          error,
        )
      },
    })
  } else {
    root.replaceChildren()
    createRoot(root).render(app)
  }
}

void main()
