import { useMemo, useState, type FormEvent } from 'react'
import { useMutations, useQuery, type RecordData } from 'deepspace'
import { AlertTriangle, CheckCircle2, Flag, Flame, Sparkles, Trash2 } from 'lucide-react'
import { Button, Input, Label, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import { formatDateTime, fromLocalInputValue, toLocalInputValue } from '@/lib/format'
import type { Incident, TimelineEvent } from '@/lib/incident-types'
import { summarizeEntries, type LogEntry } from '@/lib/signals'
import { ActivityStrip } from './ActivityStrip'

type Row = {
  id: string
  at: string
  title: string
  detail: string
  tone: 'start' | 'signal' | 'ai' | 'milestone' | 'resolved'
  removable?: boolean
}

const TONES: Record<Row['tone'], { icon: typeof Flag; className: string; label: string }> = {
  start: { icon: Flame, className: 'text-[#ff8a80] bg-[#f0564a]/15', label: 'Declared' },
  signal: { icon: AlertTriangle, className: 'text-[#fbbf5a] bg-[#f59e0b]/15', label: 'Detected' },
  ai: { icon: Sparkles, className: 'text-primary bg-primary/15', label: 'AI key event' },
  milestone: { icon: Flag, className: 'text-[#93c5fd] bg-[#60a5fa]/15', label: 'Milestone' },
  resolved: { icon: CheckCircle2, className: 'text-[#6ee7b7] bg-[#34d399]/15', label: 'Resolved' },
}

export function useTimelineEvents(incidentId: string) {
  return useQuery<TimelineEvent>('timeline-events', { where: { incidentId }, orderBy: 'at', orderDir: 'asc' })
}

export function TimelinePanel({ incident, entries }: { incident: RecordData<Incident>; entries: LogEntry[] }) {
  const { records: events } = useTimelineEvents(incident.recordId)
  const { ready, create, remove } = useMutations<TimelineEvent>('timeline-events')
  const summary = useMemo(() => summarizeEntries(entries), [entries])

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [
      {
        id: 'start',
        at: incident.data.startedAt,
        title: 'Incident started',
        detail: incident.data.title,
        tone: 'start',
      },
    ]
    if (summary.firstError?.timestamp) {
      list.push({
        id: 'first-error',
        at: summary.firstError.timestamp,
        title: 'First error in evidence',
        detail: summary.firstError.message,
        tone: 'signal',
      })
    }
    for (const ev of events) {
      list.push({
        id: ev.recordId,
        at: ev.data.at,
        title: ev.data.title,
        detail: ev.data.detail,
        tone: ev.data.kind === 'key-event' ? 'ai' : 'milestone',
        removable: ev.data.source === 'user',
      })
    }
    if (incident.data.status === 'resolved' && incident.data.resolvedAt) {
      list.push({ id: 'resolved', at: incident.data.resolvedAt, title: 'Incident resolved', detail: '', tone: 'resolved' })
    }
    return list.sort((a, b) => a.at.localeCompare(b.at))
  }, [events, incident.data, summary.firstError])

  const markers = rows.map((r) => ({ at: r.at, label: r.title }))

  const [at, setAt] = useState(() => toLocalInputValue(new Date().toISOString()))
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')

  const addMilestone = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    create({
      incidentId: incident.recordId,
      at: fromLocalInputValue(at),
      title: title.trim(),
      detail: detail.trim(),
      kind: 'milestone',
      source: 'user',
    })
    setTitle('')
    setDetail('')
    setAt(toLocalInputValue(new Date().toISOString()))
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-5">
        <ActivityStrip entries={entries} markers={markers} />
        <ol className="relative space-y-1" data-testid="timeline-list">
          {rows.map((row, i) => {
            const tone = TONES[row.tone]
            const Icon = tone.icon
            return (
              <li key={row.id} className="group relative flex gap-3 pb-3">
                {i < rows.length - 1 && (
                  <span className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-border" aria-hidden />
                )}
                <span className={cn('z-0 flex size-7 shrink-0 items-center justify-center rounded-full', tone.className)}>
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-xs text-muted-foreground">{formatDateTime(row.at)}</span>
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground/80">{tone.label}</span>
                  </div>
                  <p className="text-sm font-medium">{row.title}</p>
                  {row.detail && <p className="mt-0.5 break-words text-sm text-muted-foreground">{row.detail}</p>}
                </div>
                {row.removable && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Remove milestone ${row.title}`}
                    disabled={!ready}
                    onClick={() => remove(row.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </li>
            )
          })}
        </ol>
      </div>

      <form onSubmit={addMilestone} className="h-fit space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Add milestone</h2>
        <p className="text-xs text-muted-foreground">
          Record decisions and actions — mitigations, rollbacks, escalations.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="milestone-at">When</Label>
          <Input id="milestone-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="milestone-title">What happened</Label>
          <Input
            id="milestone-title"
            placeholder="Rolled back deploy v2.14.0"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="milestone-detail">Detail</Label>
          <Textarea id="milestone-detail" rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={!ready || !title.trim()}>
          Add to timeline
        </Button>
      </form>
    </div>
  )
}
