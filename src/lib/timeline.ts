import type { Incident, TimelineEvent } from './incident-types'
import type { LogEntry } from './signals'

export type TimelineTone = 'start' | 'signal' | 'ai' | 'milestone' | 'resolved'

export interface TimelineRow {
  id: string
  at: string
  title: string
  detail: string
  tone: TimelineTone
  removable?: boolean
}

export function buildTimelineRows(
  incident: Incident,
  events: { recordId: string; data: TimelineEvent }[],
  firstError: LogEntry | null,
): TimelineRow[] {
  const rows: TimelineRow[] = [
    { id: 'start', at: incident.startedAt, title: 'Incident started', detail: incident.title, tone: 'start' },
  ]
  if (firstError?.timestamp) {
    rows.push({
      id: 'first-error',
      at: firstError.timestamp,
      title: 'First error in evidence',
      detail: firstError.message,
      tone: 'signal',
    })
  }
  for (const ev of events) {
    rows.push({
      id: ev.recordId,
      at: ev.data.at,
      title: ev.data.title,
      detail: ev.data.detail,
      tone: ev.data.kind === 'key-event' ? 'ai' : 'milestone',
      removable: ev.data.source === 'user',
    })
  }
  if (incident.status === 'resolved' && incident.resolvedAt) {
    rows.push({ id: 'resolved', at: incident.resolvedAt, title: 'Incident resolved', detail: '', tone: 'resolved' })
  }
  return rows.sort((a, b) => a.at.localeCompare(b.at))
}
