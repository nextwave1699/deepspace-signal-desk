import { useMemo, useState } from 'react'
import { useMutations, type RecordData } from 'deepspace'
import { FileText, Plus, Trash2 } from 'lucide-react'
import {
  Button,
  ConfirmModal,
  EmptyState,
  Input,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import { cn } from '@/lib/utils'
import { formatDateTime, fromLocalInputValue } from '@/lib/format'
import type { Evidence, Incident } from '@/lib/incident-types'
import { LEVEL_RANK, type LogEntry, type LogLevel } from '@/lib/signals'
import { AddEvidenceDialog, KIND_LABELS } from './AddEvidenceDialog'

const MAX_ROWS = 400

const LEVEL_STYLES: Record<LogLevel, string> = {
  fatal: 'bg-[#f0564a] text-white',
  error: 'bg-[#f0564a]/15 text-[#ff8a80]',
  warn: 'bg-[#f59e0b]/15 text-[#fbbf5a]',
  info: 'bg-secondary text-muted-foreground',
  debug: 'bg-transparent text-muted-foreground/70',
}

export function LevelTag({ level }: { level: LogLevel }) {
  return (
    <span
      className={cn(
        'inline-flex w-12 justify-center rounded px-1 py-px font-mono text-[10px] font-medium uppercase',
        LEVEL_STYLES[level],
      )}
    >
      {level}
    </span>
  )
}

interface Props {
  incident: RecordData<Incident>
  evidence: RecordData<Evidence>[]
  entries: LogEntry[]
}

type LevelFilter = 'all' | 'warn' | 'error'

export function EvidencePanel({ incident, evidence, entries }: Props) {
  const { ready, remove } = useMutations<Evidence>('evidence')
  const [adding, setAdding] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<RecordData<Evidence> | null>(null)
  const [search, setSearch] = useState('')
  const [service, setService] = useState('all')
  const [level, setLevel] = useState<LevelFilter>('all')
  const [source, setSource] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const services = useMemo(
    () => [...new Set(entries.map((e) => e.service).filter((s): s is string => !!s))].sort(),
    [entries],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const fromIso = from ? fromLocalInputValue(from) : null
    const toIso = to ? fromLocalInputValue(to) : null
    return entries
      .filter((e) => {
        if (source !== 'all' && e.evidenceId !== source) return false
        if (service !== 'all' && e.service !== service) return false
        if (level !== 'all' && LEVEL_RANK[e.level] < LEVEL_RANK[level]) return false
        if (fromIso && (!e.timestamp || e.timestamp < fromIso)) return false
        if (toIso && (!e.timestamp || e.timestamp > toIso)) return false
        if (q && !e.raw.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        if (a.timestamp && b.timestamp) return a.timestamp.localeCompare(b.timestamp)
        if (a.timestamp) return -1
        if (b.timestamp) return 1
        return 0
      })
  }, [entries, search, service, level, source, from, to])

  const countsBySource = useMemo(() => {
    const counts = new Map<string, { total: number; errors: number }>()
    for (const e of entries) {
      const c = counts.get(e.evidenceId ?? '') ?? { total: 0, errors: 0 }
      c.total++
      if (LEVEL_RANK[e.level] >= LEVEL_RANK.error) c.errors++
      counts.set(e.evidenceId ?? '', c)
    }
    return counts
  }, [entries])

  const hasFilters = search || service !== 'all' || level !== 'all' || source !== 'all' || from || to

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Sources</h2>
          <Button size="sm" onClick={() => setAdding(true)} data-testid="add-evidence-button">
            <Plus aria-hidden />
            Add evidence
          </Button>
        </div>
        {evidence.length === 0 ? (
          <EmptyState
            className="rounded-lg border border-dashed border-border py-10"
            icon={<FileText />}
            title="No evidence yet"
            description="Paste logs, error messages or stack traces, or upload JSON/CSV exports from your observability tools."
            action={{ label: 'Add evidence', onClick: () => setAdding(true) }}
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {evidence.map((ev) => {
              const counts = countsBySource.get(ev.recordId) ?? { total: 0, errors: 0 }
              return (
                <li
                  key={ev.recordId}
                  className="group flex items-start gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{ev.data.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {KIND_LABELS[ev.data.kind]}
                      {ev.data.service ? ` · ${ev.data.service}` : ''}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {counts.total} entries ·{' '}
                      <span className={counts.errors ? 'text-[#ff8a80]' : undefined}>{counts.errors} errors</span>
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Delete ${ev.data.label}`}
                    disabled={!ready}
                    onClick={() => setPendingDelete(ev)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {entries.length > 0 && (
        <section className="rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <SearchInput
              placeholder="Search entries…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClear={() => setSearch('')}
              className="min-w-48 flex-1"
            />
            <FilterSelect
              label="Level"
              value={level}
              onChange={(v) => setLevel(v as LevelFilter)}
              options={[
                ['all', 'All levels'],
                ['warn', 'Warn and above'],
                ['error', 'Errors only'],
              ]}
            />
            <FilterSelect
              label="Service"
              value={service}
              onChange={setService}
              options={[['all', 'All services'], ...services.map((s) => [s, s] as [string, string])]}
            />
            <FilterSelect
              label="Source"
              value={source}
              onChange={setSource}
              options={[['all', 'All sources'], ...evidence.map((e) => [e.recordId, e.data.label] as [string, string])]}
            />
            <Input
              type="datetime-local"
              aria-label="From time"
              className="h-9 w-auto text-xs"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              type="datetime-local"
              aria-label="To time"
              className="h-9 w-auto text-xs"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setService('all')
                  setLevel('all')
                  setSource('all')
                  setFrom('')
                  setTo('')
                }}
              >
                Clear
              </Button>
            )}
          </div>
          <p className="px-3 pt-2 text-xs text-muted-foreground" data-testid="evidence-count">
            {filtered.length} of {entries.length} entries
            {filtered.length > MAX_ROWS ? ` · showing first ${MAX_ROWS}` : ''}
          </p>
          <div className="max-h-[520px] overflow-auto p-1">
            <table className="w-full border-separate border-spacing-0 font-mono text-xs">
              <tbody>
                {filtered.slice(0, MAX_ROWS).map((e) => {
                  const key = `${e.evidenceId}:${e.line}`
                  const isOpen = expanded === key
                  return (
                    <tr
                      key={key}
                      className="cursor-pointer align-top hover:bg-accent/40"
                      onClick={() => setExpanded(isOpen ? null : key)}
                    >
                      <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">
                        {e.timestamp ? formatDateTime(e.timestamp) : '—'}
                      </td>
                      <td className="px-1 py-1">
                        <LevelTag level={e.level} />
                      </td>
                      <td className="max-w-32 truncate px-2 py-1 text-muted-foreground">{e.service ?? ''}</td>
                      <td className="w-full px-2 py-1">
                        {isOpen ? (
                          <pre className="whitespace-pre-wrap break-all text-foreground">{e.raw}</pre>
                        ) : (
                          <span className="line-clamp-1 break-all">{e.message}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <AddEvidenceDialog
        open={adding}
        onClose={() => setAdding(false)}
        incidentId={incident.recordId}
        defaultService={incident.data.service ?? ''}
        referenceDate={incident.data.startedAt}
      />
      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) remove(pendingDelete.recordId)
          setPendingDelete(null)
        }}
        title="Delete this evidence?"
        description={pendingDelete ? `"${pendingDelete.data.label}" will be removed for everyone.` : undefined}
        confirmText="Delete"
      />
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: [string, string][]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="h-9 w-auto min-w-32 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, text]) => (
          <SelectItem key={v} value={v}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
