import { Suspense } from 'react'
import { Outlet, useRouteError } from 'react-router-dom'
import { ErrorScreen } from '../components/ErrorScreen'
import { ToastProvider, TooltipProvider } from '@/components/ui'

export default function App() {
  return (
    <ToastProvider>
      <TooltipProvider>
        <div data-testid="app-root" className="min-h-screen bg-background text-foreground">
          <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-muted-foreground">Loading...</div>}>
            <Outlet />
          </Suspense>
        </div>
      </TooltipProvider>
    </ToastProvider>
  )
}

export function Catch() {
  const error = useRouteError()
  return <ErrorScreen error={error} />
}

export function HydrateFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Loading...
    </div>
  )
}
