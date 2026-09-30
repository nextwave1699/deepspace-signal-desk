import type { RecordData } from 'deepspace'
import { formatDuration } from '@/lib/format'
import type { Incident } from '@/lib/incident-types'

const DAY_MS = 86_400_000

function medianResolveMs(incidents: RecordData<Incident>[]): number | null {
  const durations = incidents
    .filter((i) => i.data.status === 'resolved' && i.data.resolvedAt)
    .map((i) => new Date(i.data.resolvedAt as string).getTime() - new Date(i.data.startedAt).getTime())
    .filter((ms) => Number.isFinite(ms) && ms >= 0)
    .sort((a, b) => a - b)
  if (durations.length === 0) return null
  const mid = Math.floor(durations.length / 2)
  return durations.length % 2 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2
}

export function IncidentStats({ incidents, now = Date.now() }: { incidents: RecordData<Incident>[]; now?: number }) {
  const active = incidents.filter((i) => i.data.status !== 'resolved')
  const critical = active.filter((i) => i.data.severity === 'SEV1' || i.data.severity === 'SEV2')
  const resolved30 = incidents.filter(
    (i) => i.data.status === 'resolved' && i.data.resolvedAt && now - new Date(i.data.resolvedAt).getTime() < 30 * DAY_MS,
  )
  const mttr = medianResolveMs(incidents)

  const tiles: { label: string; value: string; hint: string; alert?: boolean }[] = [
    { label: 'Active incidents', value: String(active.length), hint: 'Not yet resolved' },
    { label: 'Active SEV1–2', value: String(critical.length), hint: 'Critical and major', alert: critical.length > 0 },
    { label: 'Resolved · 30 days', value: String(resolved30.length), hint: 'Closed in the last 30 days' },
    {
      label: 'Median time to resolve',
      value: mttr === null ? '—' : formatDuration(new Date(0).toISOString(), new Date(mttr).toISOString()),
      hint: 'Across all resolved incidents',
    },
  ]

  return (
    <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="incident-stats">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-border bg-card px-4 py-3">
          <dt className="text-xs text-muted-foreground">{t.label}</dt>
          <dd className={`mt-1 text-2xl font-semibold tabular-nums ${t.alert ? 'text-[#ff8a80]' : ''}`}>{t.value}</dd>
          <dd className="text-[11px] text-muted-foreground/80">{t.hint}</dd>
        </div>
      ))}
    </dl>
  )
}
