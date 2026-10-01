/**
 * Build-time render of the public pages for prerender.ts. The tree must mirror
 * what generouted renders on the client, or hydration mismatches.
 */

import type { ComponentType } from 'react'
import { renderToString } from 'react-dom/server'
// From react-router-dom, like the pages: under Vitest the two entry points
// load as separate module instances, and a router created from one is
// invisible to <Outlet>/<Link> imported from the other.
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import * as app from './pages/_app'
import Landing from './pages/index'

export { seo } from './seo'

export const PAGES: Record<string, ComponentType> = {
  '/': Landing,
}

export const PRERENDER_ROUTES = Object.keys(PAGES)

const App = app.default

function Layout() {
  return (
    <>
      <App />{' '}
      <></>
    </>
  )
}

/** Render one route. React 19 hoists <title>/<meta>/<link> to the START of the
 *  output, before _app's root element; prerender.ts splits them apart. */
export function render(route: string): string {
  const router = createMemoryRouter(
    [
      {
        Component: Layout,
        ErrorBoundary: app.Catch,
        children: PRERENDER_ROUTES.map((path) => ({ path, Component: PAGES[path] })),
      },
    ],
    { initialEntries: [route] },
  )
  return renderToString(<RouterProvider router={router} />)
}
