import { signOut, useUser } from 'deepspace'
import { Button } from '@/components/ui'

export default function SettingsPage() {
  const { user } = useUser()

  return (
    <div className="min-h-full text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">Settings</h1>

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold">Your account</h2>

          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="text-foreground">{user?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="text-foreground">{user?.email ?? '—'}</dd>
            </div>
          </dl>

          <Button variant="secondary" className="mt-6" onClick={() => signOut()}>
            Sign out
          </Button>
        </section>
      </div>
    </div>
  )
}
