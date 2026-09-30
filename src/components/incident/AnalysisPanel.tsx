import { useState } from 'react'
import { useMutations, useQuery, type RecordData } from 'deepspace'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CircleHelp,
  ListChecks,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react'
import { Button, Checkbox, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { callAction } from '@/lib/actions-client'
import { formatDateTime, relativeTime } from '@/lib/format'
import type { AnalysisSignal, ChecklistItem, Hypothesis, Incident, IncidentAnalysis } from '@/lib/incident-types'
import { ConfidenceMeter, HypothesisStatusTag } from './badges'
import { AddHypothesisButton, HypothesisControls } from './HypothesisControls'
import { useNotes } from './NotesPanel'

const STALE_RUN_MS = 3 * 60_000

export function useHypotheses(incidentId: string) {
  return useQuery<Hypothesis>('hypotheses', { where: { incidentId }, orderBy: 'createdAt', orderDir: 'asc' })
}

export function AnalysisPanel({ incident, evidenceCount }: { incident: RecordData<Incident>; evidenceCount: number }) {
  const { error } = useToast()
  const [requesting, setRequesting] = useState(false)
  const { analysis, analysisStatus, analyzedAt, analysisError } = incident.data
  const stale = Date.now() - new Date(incident.updatedAt).getTime() > STALE_RUN_MS
  const running = requesting || (analysisStatus === 'running' && !stale)

  const run = async () => {
    setRequesting(true)
    try {
      await callAction('analyzeIncident', { incidentId: incident.recordId })
    } catch (err) {
      error('Analysis failed', err instanceof Error ? err.message : String(err))
    } finally {
      setRequesting(false)
    }
  }

  return (
    <section className="space-y-4" data-testid="analysis-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" aria-hidden />
            AI analysis
          </h2>
          <p className="text-xs text-muted-foreground">
            {running
              ? 'Reading the evidence…'
              : analyzedAt
                ? `Last analyzed ${relativeTime(analyzedAt)} · ${formatDateTime(analyzedAt)}`
                : `Correlates ${evidenceCount} evidence source${evidenceCount === 1 ? '' : 's'} into signals, hypotheses and next steps.`}
          </p>
        </div>
        <Button onClick={run} loading={running} variant={analysis ? 'outline' : 'default'} data-testid="run-analysis">
          {!running && (analysis ? <RefreshCw aria-hidden /> : <Sparkles aria-hidden />)}
          {analysis ? 'Re-analyze' : 'Analyze incident'}
        </Button>
      </div>

      {analysisStatus === 'failed' && analysisError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-[#ff8a80]">
          {analysisError}
        </p>
      )}

      {!analysis && (
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
          <Bot className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">No analysis yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Add logs or errors in the Evidence tab, then analyze. SignalDesk shows the evidence behind
            every hypothesis, what contradicts it, and how confident it is.
          </p>
        </div>
      )}
      {analysis ? <AnalysisBody incident={incident} analysis={analysis} /> : <HypothesesColumn incident={incident} />}
    </section>
  )
}

function HypothesesColumn({ incident }: { incident: RecordData<Incident> }) {
  const { records: hypotheses } = useHypotheses(incident.recordId)
  const { records: notes } = useNotes(incident.recordId)
  const ranked = [...hypotheses].sort((a, b) => statusOrder(a.data.status) - statusOrder(b.data.status))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hypotheses</h3>
        <AddHypothesisButton incidentId={incident.recordId} />
      </div>
      {ranked.length === 0 && <p className="text-sm text-muted-foreground">No hypotheses yet.</p>}
      {ranked.map((h) => (
        <HypothesisCard key={h.recordId} hypothesis={h}>
          <HypothesisControls
            incident={incident}
            hypothesis={h}
            notes={notes.filter((n) => n.data.hypothesisId === h.recordId)}
          />
        </HypothesisCard>
      ))}
    </div>
  )
}

function AnalysisBody({ incident, analysis }: { incident: RecordData<Incident>; analysis: IncidentAnalysis }) {
  return (
    <div className="space-y-4">
      {analysis.notice && (
        <p className="flex items-start gap-2 rounded-md border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-3 py-2 text-sm text-[#fbd38d]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {analysis.notice}
        </p>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Summary</span>
          <span className="flex items-center gap-3">
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {analysis.engine === 'ai' ? 'AI' : 'Rule-based'}
            </span>
            <ConfidenceMeter confidence={analysis.overallConfidence} />
          </span>
        </div>
        <p className="text-sm leading-relaxed" data-testid="analysis-summary">{analysis.summary}</p>
        {analysis.impact && (
          <p className="mt-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Impact: </span>
            {analysis.impact}
          </p>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_auto_minmax(0,7fr)]">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Observed evidence</h3>
          <ul className="space-y-2.5">
            {analysis.signals.map((s, i) => (
              <SignalRow key={`${s.label}-${i}`} signal={s} />
            ))}
            {analysis.signals.length === 0 && <li className="text-sm text-muted-foreground">No notable signals.</li>}
          </ul>
        </div>
        <div className="hidden items-center xl:flex" aria-hidden>
          <ArrowRight className="size-5 text-muted-foreground" />
        </div>
        <HypothesesColumn incident={incident} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Checklist incident={incident} items={analysis.checklist} />
        <div className="space-y-4">
          {analysis.relatedErrors.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Related errors</h3>
              <ul className="space-y-2">
                {analysis.relatedErrors.map((r, i) => (
                  <li key={`${r.signature}-${i}`} className="text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <code className="break-all font-mono text-xs">{r.signature}</code>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">×{r.count}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{r.relation}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {analysis.uncertainty.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <CircleHelp className="size-3.5" aria-hidden />
                What we don't know yet
              </h3>
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {analysis.uncertainty.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function statusOrder(status: Hypothesis['status']): number {
  return { confirmed: 0, investigating: 1, open: 2, rejected: 3 }[status] ?? 2
}

const SIGNAL_DOT: Record<AnalysisSignal['severity'], string> = {
  critical: 'bg-[#f0564a]',
  warning: 'bg-[#f5a524]',
  info: 'bg-[#60a5fa]',
}

function SignalRow({ signal }: { signal: AnalysisSignal }) {
  return (
    <li className="flex gap-2.5">
      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', SIGNAL_DOT[signal.severity])} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="break-words text-sm font-medium">{signal.label}</p>
          {signal.count !== null && (
            <span className="shrink-0 font-mono text-xs text-muted-foreground">×{signal.count}</span>
          )}
        </div>
        <p className="break-words text-xs text-muted-foreground">
          {signal.detail}
          {signal.at && <span className="font-mono"> · {formatDateTime(signal.at)}</span>}
        </p>
        <span className="sr-only">Severity: {signal.severity}</span>
      </div>
    </li>
  )
}

export function HypothesisCard({ hypothesis, children }: { hypothesis: RecordData<Hypothesis>; children?: React.ReactNode }) {
  const h = hypothesis.data
  return (
    <article
      className={cn(
        'rounded-lg border bg-card p-4',
        h.status === 'confirmed' ? 'border-[#34d399]/50' : 'border-border',
        h.status === 'rejected' && 'opacity-60',
      )}
      data-testid="hypothesis-card"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="min-w-0 flex-1 text-sm font-semibold">{h.title}</h4>
        <div className="flex items-center gap-2">
          <ConfidenceMeter confidence={h.confidence} />
          <HypothesisStatusTag status={h.status} />
        </div>
      </header>
      {h.rationale && <p className="mt-1.5 text-sm text-muted-foreground">{h.rationale}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <EvidenceList
          title={`Supporting · ${h.supporting.length}`}
          items={h.supporting}
          icon={<Check className="size-3.5 text-[#6ee7b7]" aria-hidden />}
        />
        <EvidenceList
          title={`Contradicting · ${h.contradicting.length}`}
          items={h.contradicting}
          icon={<X className="size-3.5 text-[#ff8a80]" aria-hidden />}
        />
      </div>
      {h.nextSteps.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">To confirm or rule out</p>
          <ul className="list-disc space-y-0.5 pl-4 text-sm">
            {h.nextSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {children}
    </article>
  )
}

function EvidenceList({ title, items, icon }: { title: string; items: string[]; icon: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">None found</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="flex gap-1.5 text-xs">
              <span className="mt-0.5 shrink-0">{icon}</span>
              <span className="break-words">{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const PRIORITY_STYLES: Record<ChecklistItem['priority'], string> = {
  now: 'text-[#ff8a80]',
  next: 'text-[#fbbf5a]',
  later: 'text-muted-foreground',
}

function Checklist({ incident, items }: { incident: RecordData<Incident>; items: ChecklistItem[] }) {
  const { ready, put } = useMutations<Incident>('incidents')
  const done = new Set(incident.data.checklistDone ?? [])

  const toggle = (step: string, checked: boolean) => {
    const next = new Set(done)
    if (checked) next.add(step)
    else next.delete(step)
    put(incident.recordId, { checklistDone: [...next] })
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ListChecks className="size-3.5" aria-hidden />
          Investigation checklist
        </span>
        <span className="font-mono normal-case">
          {items.filter((i) => done.has(i.step)).length}/{items.length}
        </span>
      </h3>
      <ul className="space-y-2.5">
        {items.map((item, i) => {
          const checked = done.has(item.step)
          const id = `check-${i}`
          return (
            <li key={`${item.step}-${i}`} className="flex gap-2.5">
              <Checkbox
                id={id}
                checked={checked}
                disabled={!ready}
                onCheckedChange={(v) => toggle(item.step, v === true)}
                className="mt-0.5"
              />
              <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                <span className={cn('text-sm', checked && 'text-muted-foreground line-through')}>{item.step}</span>
                <span className="block text-xs text-muted-foreground">
                  <span className={cn('font-medium uppercase', PRIORITY_STYLES[item.priority])}>{item.priority}</span>
                  {item.why ? ` · ${item.why}` : ''}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
