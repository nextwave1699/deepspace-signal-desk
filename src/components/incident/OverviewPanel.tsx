import { useEffect, useMemo, useState } from 'react'
import { useMutations, type RecordData } from 'deepspace'
import { Pencil } from 'lucide-react'
import { Button, Textarea } from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import type { Incident } from '@/lib/incident-types'
import { summarizeEntries, type LogEntry } from '@/lib/signals'
import { AnalysisPanel } from './AnalysisPanel'

interface Props {
  incident: RecordData<Incident>
  evidenceCount: number
  entries: LogEntry[]
}

export function OverviewPanel({ incident, evidenceCount, entries }: Props) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <AnalysisPanel incident={incident} evidenceCount={evidenceCount} />
      <aside className="space-y-4">
        <DescriptionCard incident={incident} />
        <EvidenceStats entries={entries} />
      </aside>
    </div>
  )
}

function EvidenceStats({ entries }: { entries: LogEntry[] }) {
  const summary = useMemo(() => summarizeEntries(entries), [entries])
  const errors = summary.byLevel.error + summary.byLevel.fatal
  const rows: [string, string][] = [
    ['Entries', String(summary.total)],
    ['Errors', String(errors)],
    ['Warnings', String(summary.byLevel.warn)],
    ['Services', summary.services.join(', ') || '—'],
    ['First error', summary.firstError?.timestamp ? formatDateTime(summary.firstError.timestamp) : '—'],
  ]
  if (summary.latency) {
    rows.push(['Latency', `${summary.latency.baselineMs}ms → ${summary.latency.peakMs}ms (${summary.latency.ratio}×)`])
  }
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">Evidence at a glance</h2>
      <dl className="space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-words text-right font-mono text-xs leading-5">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function DescriptionCard({ incident }: { incident: RecordData<Incident> }) {
  const { ready, put } = useMutations<Incident>('incidents')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(incident.data.description ?? '')

  useEffect(() => {
    if (!editing) setDraft(incident.data.description ?? '')
  }, [incident.data.description, editing])

  const save = () => {
    put(incident.recordId, { description: draft.trim() })
    setEditing(false)
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Description</h2>
        {!editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} disabled={!ready}>
            <Pencil aria-hidden />
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={save}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {incident.data.description || 'No description yet.'}
        </p>
      )}
    </section>
  )
}
