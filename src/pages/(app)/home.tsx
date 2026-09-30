import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthOverlay, useAuthProfileReady, useQuery, type RecordData } from 'deepspace'
import { Plus, Radio, SearchX, Sparkles } from 'lucide-react'
import { Button, EmptyState } from '@/components/ui'
import { NewIncidentDialog } from '@/components/incident/NewIncidentDialog'
import { SeverityBadge, StatusPill } from '@/components/incident/badges'
import { applyIncidentFilters, IncidentFilterBar, useIncidentFilters } from '@/components/incident/IncidentFilters'
import { IncidentStats } from '@/components/incident/IncidentStats'
import { relativeTime } from '@/lib/format'
import type { Incident } from '@/lib/incident-types'

export default function HomePage() {
  const { isLoaded, isSignedIn } = useAuthProfileReady({ requireUser: true })
  if (!isLoaded) return null
  return isSignedIn ? <IncidentDashboard /> : <SignedOutHome />
}

function IncidentDashboard() {
  const { records, status } = useQuery<Incident>('incidents', {
    orderBy: 'createdAt',
    orderDir: 'desc',
  })
  const [creating, setCreating] = useState(false)
  const filters = useIncidentFilters()
  const visible = applyIncidentFilters(records, filters.state)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Incidents</h1>
          <p className="text-sm text-muted-foreground">
            Every investigation your team has opened, in one live workspace.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} data-testid="new-incident-button">
          <Plus aria-hidden />
          Declare incident
        </Button>
      </header>

      {status === 'loading' ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-card" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <EmptyState
          icon={<Radio />}
          title="No incidents yet"
          description="Declare an incident to start collecting evidence and let SignalDesk help you find the root cause."
          action={{ label: 'Declare incident', onClick: () => setCreating(true) }}
        />
      ) : (
        <>
          <IncidentStats incidents={records} />
          <IncidentFilterBar incidents={records} {...filters} />
          {visible.length === 0 ? (
            <EmptyState
              icon={<SearchX />}
              title="No incidents match these filters"
              action={{ label: 'Reset filters', onClick: filters.reset }}
            />
          ) : (
            <IncidentList incidents={visible} />
          )}
        </>
      )}

      <NewIncidentDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

function IncidentList({ incidents }: { incidents: RecordData<Incident>[] }) {
  return (
    <ul
      className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card"
      data-testid="incident-list"
    >
      {incidents.map((incident) => (
        <li key={incident.recordId}>
          <Link
            to={`/incidents/${incident.recordId}`}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-accent/50"
          >
            <SeverityBadge severity={incident.data.severity} />
            <span className="min-w-0 flex-1 truncate font-medium">{incident.data.title}</span>
            {incident.data.service && (
              <span className="font-mono text-xs text-muted-foreground">{incident.data.service}</span>
            )}
            {incident.data.analysis && <Sparkles className="size-3.5 text-primary" aria-label="Analyzed" />}
            <StatusPill status={incident.data.status} className="w-28" />
            <span className="w-20 text-right text-xs text-muted-foreground">
              {relativeTime(incident.data.startedAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function SignedOutHome() {
  const [showAuth, setShowAuth] = useState(false)
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Radio className="size-6" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold">Sign in to your incident desk</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          SignalDesk keeps your team's incidents, evidence, and AI-assisted investigations in one
          shared, real-time workspace.
        </p>
        <Button className="mt-6" onClick={() => setShowAuth(true)}>
          Sign in
        </Button>
      </div>
      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
    </div>
  )
}
