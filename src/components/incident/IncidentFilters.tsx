import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { RecordData } from 'deepspace'
import {
  Button,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import { cn } from '@/lib/utils'
import { INCIDENT_STATUSES, SEVERITIES, type Incident, type Severity } from '@/lib/incident-types'
import { statusLabel } from './badges'

export interface IncidentFilterState {
  q: string
  severities: Severity[]
  status: string
  service: string
  sort: 'newest' | 'severity'
}

export function useIncidentFilters() {
  const [params, setParams] = useSearchParams()
  const state: IncidentFilterState = {
    q: params.get('q') ?? '',
    severities: (params.get('sev')?.split(',').filter((s) => (SEVERITIES as readonly string[]).includes(s)) ?? []) as Severity[],
    status: params.get('status') ?? 'active',
    service: params.get('service') ?? 'all',
    sort: params.get('sort') === 'severity' ? 'severity' : 'newest',
  }

  const update = (patch: Partial<IncidentFilterState>) => {
    const next = { ...state, ...patch }
    const out = new URLSearchParams()
    if (next.q) out.set('q', next.q)
    if (next.severities.length) out.set('sev', next.severities.join(','))
    if (next.status !== 'active') out.set('status', next.status)
    if (next.service !== 'all') out.set('service', next.service)
    if (next.sort !== 'newest') out.set('sort', next.sort)
    setParams(out, { replace: true })
  }

  return { state, update, reset: () => setParams(new URLSearchParams(), { replace: true }) }
}

export function applyIncidentFilters(
  incidents: RecordData<Incident>[],
  f: IncidentFilterState,
): RecordData<Incident>[] {
  const q = f.q.trim().toLowerCase()
  return incidents
    .filter((i) => {
      const d = i.data
      if (f.status === 'active' && d.status === 'resolved') return false
      if (f.status !== 'active' && f.status !== 'all' && d.status !== f.status) return false
      if (f.severities.length && !f.severities.includes(d.severity)) return false
      if (f.service !== 'all' && d.service !== f.service) return false
      if (q && ![d.title, d.service, d.description].some((v) => v?.toLowerCase().includes(q))) return false
      return true
    })
    .sort((a, b) =>
      f.sort === 'severity'
        ? a.data.severity.localeCompare(b.data.severity) || b.data.startedAt.localeCompare(a.data.startedAt)
        : b.data.startedAt.localeCompare(a.data.startedAt),
    )
}

export function IncidentFilterBar({
  incidents,
  state,
  update,
  reset,
}: {
  incidents: RecordData<Incident>[]
  state: IncidentFilterState
  update: (patch: Partial<IncidentFilterState>) => void
  reset: () => void
}) {
  const services = useMemo(
    () => [...new Set(incidents.map((i) => i.data.service).filter(Boolean))].sort(),
    [incidents],
  )
  const toggleSeverity = (s: Severity) =>
    update({
      severities: state.severities.includes(s) ? state.severities.filter((x) => x !== s) : [...state.severities, s],
    })
  const dirty = state.q || state.severities.length || state.status !== 'active' || state.service !== 'all' || state.sort !== 'newest'

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <SearchInput
        placeholder="Search incidents…"
        aria-label="Search incidents"
        value={state.q}
        onChange={(e) => update({ q: e.target.value })}
        onClear={() => update({ q: '' })}
        className="min-w-56 flex-1"
      />
      <div className="flex gap-1" role="group" aria-label="Filter by severity">
        {SEVERITIES.map((s) => {
          const on = state.severities.includes(s)
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => toggleSeverity(s)}
              className={cn(
                'h-9 rounded-md border px-2.5 font-mono text-xs transition-colors',
                on ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {s}
            </button>
          )
        })}
      </div>
      <Select value={state.status} onValueChange={(v) => update({ status: v })}>
        <SelectTrigger aria-label="Status" className="h-9 w-auto min-w-36 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="all">All statuses</SelectItem>
          {INCIDENT_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {statusLabel(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={state.service} onValueChange={(v) => update({ service: v })}>
        <SelectTrigger aria-label="Service" className="h-9 w-auto min-w-36 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All services</SelectItem>
          {services.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={state.sort} onValueChange={(v) => update({ sort: v as IncidentFilterState['sort'] })}>
        <SelectTrigger aria-label="Sort" className="h-9 w-auto min-w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest first</SelectItem>
          <SelectItem value="severity">Most severe</SelectItem>
        </SelectContent>
      </Select>
      {dirty && (
        <Button variant="ghost" size="sm" onClick={reset}>
          Reset
        </Button>
      )}
    </div>
  )
}
