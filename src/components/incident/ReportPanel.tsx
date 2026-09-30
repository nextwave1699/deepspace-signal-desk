import { useEffect, useMemo, useState } from 'react'
import { useMutations, type RecordData } from 'deepspace'
import { Copy, Download, FileText, RefreshCw, Sparkles } from 'lucide-react'
import { Button, Label, Textarea, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions-client'
import { formatDateTime } from '@/lib/format'
import type { Evidence, Incident, IncidentReport } from '@/lib/incident-types'
import { reportToMarkdown } from '@/lib/report'
import { LEVEL_RANK, summarizeEntries, type LogEntry } from '@/lib/signals'
import { buildTimelineRows } from '@/lib/timeline'
import { useHypotheses } from './AnalysisPanel'
import { HypothesisStatusTag } from './badges'
import { useTimelineEvents } from './TimelinePanel'

type Draft = Pick<IncidentReport, 'summary' | 'rootCause' | 'impact' | 'resolution'> & { followUps: string }

const FIELDS: { key: keyof Draft; label: string; rows: number; hint?: string }[] = [
  { key: 'summary', label: 'Summary', rows: 4 },
  { key: 'rootCause', label: 'Root cause', rows: 4 },
  { key: 'impact', label: 'Impact', rows: 3 },
  { key: 'resolution', label: 'Resolution', rows: 4 },
  { key: 'followUps', label: 'Follow-up actions', rows: 5, hint: 'One action per line' },
]

function toDraft(report: IncidentReport): Draft {
  return { ...report, followUps: report.followUps.join('\n') }
}

interface Props {
  incident: RecordData<Incident>
  evidence: RecordData<Evidence>[]
  entries: LogEntry[]
}

export function ReportPanel({ incident, evidence, entries }: Props) {
  const { report } = incident.data
  const { ready, put } = useMutations<Incident>('incidents')
  const { records: events } = useTimelineEvents(incident.recordId)
  const { records: hypotheses } = useHypotheses(incident.recordId)
  const { success, error } = useToast()
  const [generating, setGenerating] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(report ? toDraft(report) : null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (report && !dirty) setDraft(toDraft(report))
  }, [report, dirty])

  const summary = useMemo(() => summarizeEntries(entries), [entries])
  const timeline = useMemo(
    () => buildTimelineRows(incident.data, events, summary.firstError),
    [incident.data, events, summary.firstError],
  )
  const evidenceStats = useMemo(
    () =>
      evidence.map((e) => {
        const mine = entries.filter((x) => x.evidenceId === e.recordId)
        return { ...e.data, entries: mine.length, errors: mine.filter((x) => LEVEL_RANK[x.level] >= LEVEL_RANK.error).length }
      }),
    [evidence, entries],
  )

  const generate = async () => {
    setGenerating(true)
    try {
      await callAction('generateReport', { incidentId: incident.recordId })
      setDirty(false)
    } catch (err) {
      error('Could not generate the report', err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
    }
  }

  const current: IncidentReport | null =
    report && draft
      ? {
          ...report,
          summary: draft.summary,
          rootCause: draft.rootCause,
          impact: draft.impact,
          resolution: draft.resolution,
          followUps: draft.followUps.split('\n').map((l) => l.trim()).filter(Boolean),
        }
      : null

  const save = () => {
    if (!current) return
    put(incident.recordId, { report: current })
    setDirty(false)
    success('Report saved')
  }

  const markdown = () =>
    current
      ? reportToMarkdown({
          incident: incident.data,
          report: current,
          timeline,
          evidence: evidenceStats,
          hypotheses: hypotheses.map((h) => h.data),
        })
      : ''

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown())
      success('Report copied as Markdown')
    } catch {
      error('Clipboard unavailable', 'Use Download instead.')
    }
  }

  const download = () => {
    const blob = new Blob([markdown()], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `incident-${incident.data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!report || !draft) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
        <FileText className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">No report yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Draft a post-incident report from the evidence, confirmed hypotheses, milestones and notes. You can edit
          every section before sharing it.
        </p>
        <Button className="mt-5" onClick={generate} loading={generating} data-testid="generate-report">
          {!generating && <Sparkles aria-hidden />}
          Draft report
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]" data-testid="report-panel">
      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {report.engine === 'ai' ? 'AI draft' : 'Rule-based draft'} · generated {formatDateTime(report.generatedAt)}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={generate} loading={generating}>
              {!generating && <RefreshCw aria-hidden />}
              Regenerate
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty || !ready}>
              Save changes
            </Button>
          </div>
        </div>
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`report-${f.key}`}>{f.label}</Label>
            <Textarea
              id={`report-${f.key}`}
              rows={f.rows}
              value={draft[f.key]}
              onChange={(e) => {
                setDraft({ ...draft, [f.key]: e.target.value })
                setDirty(true)
              }}
            />
            {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
          </div>
        ))}
      </div>

      <aside className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Export</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={copy}>
              <Copy aria-hidden />
              Copy Markdown
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={download}>
              <Download aria-hidden />
              Download
            </Button>
          </div>
          {dirty && <p className="mt-2 text-xs text-muted-foreground">Exports include your unsaved edits.</p>}
        </div>
        <ReportSection title="Timeline">
          {timeline.map((r) => (
            <li key={r.id} className="text-xs">
              <span className="font-mono text-muted-foreground">{formatDateTime(r.at)}</span> {r.title}
            </li>
          ))}
        </ReportSection>
        <ReportSection title="Evidence">
          {evidenceStats.length === 0 && <li className="text-xs text-muted-foreground">No evidence attached</li>}
          {evidenceStats.map((e, i) => (
            <li key={i} className="text-xs">
              {e.label} <span className="text-muted-foreground">· {e.entries} entries, {e.errors} errors</span>
            </li>
          ))}
        </ReportSection>
        <ReportSection title="Hypotheses reviewed">
          {hypotheses.length === 0 && <li className="text-xs text-muted-foreground">None recorded</li>}
          {hypotheses.map((h) => (
            <li key={h.recordId} className="flex items-start justify-between gap-2 text-xs">
              <span>{h.data.title}</span>
              <HypothesisStatusTag status={h.data.status} />
            </li>
          ))}
        </ReportSection>
      </aside>
    </div>
  )
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  )
}
