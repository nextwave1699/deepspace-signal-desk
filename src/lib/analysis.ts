import { z } from 'zod'
import type {
  AnalysisSignal,
  ChecklistItem,
  Confidence,
  Evidence,
  Hypothesis,
  Incident,
  IncidentAnalysis,
  RelatedError,
} from './incident-types'
import { extractSignals, summarizeEntries, type LogEntry, type Signal } from './signals'

export interface HypothesisDraft {
  title: string
  rationale: string
  supporting: string[]
  contradicting: string[]
  nextSteps: string[]
  confidence: Confidence
}

export interface KeyEventDraft {
  at: string
  title: string
  detail: string
}

export interface AnalysisResult {
  analysis: IncidentAnalysis
  hypotheses: HypothesisDraft[]
  keyEvents: KeyEventDraft[]
}

const confidence = z.enum(['low', 'medium', 'high']).catch('low')
const text = z.string().catch('')
const texts = z.array(z.string()).catch([])

const responseSchema = z.object({
  summary: text,
  impact: text,
  overallConfidence: confidence,
  signals: z
    .array(
      z.object({
        label: text,
        detail: text,
        count: z.number().nullable().catch(null),
        at: z.string().nullable().catch(null),
        severity: z.enum(['critical', 'warning', 'info']).catch('info'),
      }),
    )
    .catch([]),
  hypotheses: z
    .array(
      z.object({
        title: text,
        rationale: text,
        supporting: texts,
        contradicting: texts,
        nextSteps: texts,
        confidence,
      }),
    )
    .catch([]),
  relatedErrors: z
    .array(z.object({ signature: text, count: z.number().catch(0), relation: text }))
    .catch([]),
  keyEvents: z.array(z.object({ at: text, title: text, detail: text })).catch([]),
  checklist: z
    .array(z.object({ step: text, why: text, priority: z.enum(['now', 'next', 'later']).catch('next') }))
    .catch([]),
  uncertainty: texts,
})

export function extractJsonObject(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw)
  const candidate = fenced ? fenced[1] : raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('Model response contained no JSON object')
  return JSON.parse(candidate.slice(start, end + 1))
}

function isValidIso(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime())
}

export function parseAnalysisResponse(raw: string): AnalysisResult {
  const parsed = responseSchema.parse(extractJsonObject(raw))
  if (!parsed.summary) throw new Error('Model response is missing a summary')
  return {
    analysis: {
      engine: 'ai',
      summary: parsed.summary,
      impact: parsed.impact,
      overallConfidence: parsed.overallConfidence,
      signals: parsed.signals.filter((s) => s.label),
      relatedErrors: parsed.relatedErrors.filter((r) => r.signature),
      checklist: parsed.checklist.filter((c) => c.step),
      uncertainty: parsed.uncertainty.filter(Boolean),
    },
    hypotheses: parsed.hypotheses.filter((h) => h.title).slice(0, 5),
    keyEvents: parsed.keyEvents
      .filter((e) => e.title && isValidIso(e.at))
      .map((e) => ({ ...e, at: new Date(e.at).toISOString() })),
  }
}

function fmtWindow(first: string | null, last: string | null): string {
  if (!first) return ''
  const a = first.slice(11, 19)
  const b = last && last !== first ? `–${last.slice(11, 19)}` : ''
  return ` (${a}${b} UTC)`
}

export function describeSignal(s: Signal): string {
  const services = s.services.length ? ` in ${s.services.join(', ')}` : ''
  return `${s.sample.slice(0, 140)} ×${s.count}${services}${fmtWindow(s.firstSeen, s.lastSeen)}`
}

const MAX_DIGEST_CHARS = 32_000
const MAX_LINES_PER_SOURCE = 80

/** A bounded, model-ready digest of an incident and its evidence. */
export function buildEvidenceDigest(
  incident: Incident,
  sources: (Evidence & { id: string })[],
  entries: LogEntry[],
  hypotheses: Hypothesis[] = [],
): string {
  const summary = summarizeEntries(entries)
  const signals = extractSignals(entries).slice(0, 20)
  const parts: string[] = [
    '## Incident',
    `Title: ${incident.title}`,
    `Severity: ${incident.severity}`,
    `Primary service: ${incident.service || 'unknown'}`,
    `Started: ${incident.startedAt}`,
    `Status: ${incident.status}`,
    `Description: ${incident.description || '(none)'}`,
    '',
    '## Evidence statistics (computed deterministically)',
    `Entries: ${summary.total} across ${sources.length} source(s)`,
    `By level: ${Object.entries(summary.byLevel)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}`,
    `Services seen: ${summary.services.join(', ') || 'none'}`,
    `Log window: ${summary.window ? `${summary.window.start} → ${summary.window.end}` : 'no timestamps'}`,
    `First error: ${summary.firstError ? `${summary.firstError.timestamp ?? 'untimed'} ${summary.firstError.message}` : 'none'}`,
  ]
  if (summary.latency) {
    parts.push(
      `Latency: baseline ${summary.latency.baselineMs}ms → peak ${summary.latency.peakMs}ms (${summary.latency.ratio}×) at ${summary.latency.peakAt ?? 'unknown'} from ${summary.latency.samples} samples`,
    )
  }
  parts.push('', '## Top warning/error signatures')
  if (signals.length === 0) parts.push('(none)')
  for (const s of signals) parts.push(`- [${s.level}] ${describeSignal(s)}`)

  if (hypotheses.length) {
    parts.push('', '## Hypotheses the team is already tracking')
    for (const h of hypotheses) parts.push(`- [${h.status}] ${h.title}`)
  }

  parts.push('', '## Evidence excerpts')
  for (const source of sources) {
    const lines = source.content.split(/\r?\n/)
    const header = `### ${source.label} (${source.kind}${source.service ? `, ${source.service}` : ''}, ${lines.length} lines)`
    const excerpt =
      lines.length <= MAX_LINES_PER_SOURCE
        ? lines
        : [
            ...lines.slice(0, 15),
            '…',
            ...lines
              .slice(15)
              .filter((l) => /error|warn|fatal|exception|timeout|fail|refused|panic|latency|deploy/i.test(l))
              .slice(0, MAX_LINES_PER_SOURCE - 20),
            '…',
            ...lines.slice(-5),
          ]
    parts.push(header, '```', ...excerpt.map((l) => l.slice(0, 400)), '```')
  }

  const digest = parts.join('\n')
  return digest.length > MAX_DIGEST_CHARS ? `${digest.slice(0, MAX_DIGEST_CHARS)}\n…(truncated)` : digest
}

export const ANALYSIS_INSTRUCTIONS = `You are SignalDesk, an incident-response analyst helping on-call engineers investigate a production incident.
Reason only from the evidence provided. Never invent log lines, counts, timestamps or services.
Cite concrete evidence in every supporting or contradicting point (e.g. "DB connection timeout ×37 from 14:32 UTC").
Calibrate confidence honestly: "high" needs multiple independent signals and no strong contradictions; use "low" when evidence is thin.
Always list what is unknown or what additional data would change your conclusions.

Respond with ONLY a JSON object, no prose, matching exactly:
{
  "summary": "2-4 sentence plain-language incident summary",
  "impact": "who/what is affected and how badly, based on evidence",
  "overallConfidence": "low" | "medium" | "high",
  "signals": [{ "label": "short name", "detail": "what the evidence shows", "count": number | null, "at": "ISO timestamp" | null, "severity": "critical" | "warning" | "info" }],
  "hypotheses": [{ "title": "candidate root cause", "rationale": "why", "supporting": ["evidence"], "contradicting": ["evidence"], "nextSteps": ["how to confirm or rule out"], "confidence": "low" | "medium" | "high" }],
  "relatedErrors": [{ "signature": "error text", "count": number, "relation": "how it relates to the likely root cause (symptom, cause, unrelated noise)" }],
  "keyEvents": [{ "at": "ISO timestamp", "title": "short", "detail": "one sentence" }],
  "checklist": [{ "step": "concrete investigation action", "why": "what it tells us", "priority": "now" | "next" | "later" }],
  "uncertainty": ["open questions or missing data"]
}
Give 2-4 hypotheses ordered by likelihood, 3-8 signals, up to 8 key events, and 4-8 checklist steps.`

interface Rule {
  title: string
  test: RegExp
  rationale: string
  nextSteps: string[]
}

const RULES: Rule[] = [
  {
    title: 'Database connection pool exhaustion',
    test: /(connection|conn)\b.*\b(pool|timeout|acquire|exhaust)|too many connections|pool (exhausted|timeout)|could not obtain connection|remaining connection slots/i,
    rationale: 'Connection acquisition failures suggest the database pool is saturated or the database is not accepting connections.',
    nextSteps: [
      'Check active vs max connections on the database and in the service pool metrics',
      'Look for slow or long-running queries holding connections',
      'Compare pool size against current replica count and traffic',
    ],
  },
  {
    title: 'Memory exhaustion (OOM kills)',
    test: /out of memory|\boom\b|oomkilled|heap (space|limit)|memory limit|cannot allocate/i,
    rationale: 'Memory-related errors point to processes hitting their memory limit and being killed or degraded.',
    nextSteps: ['Check container restarts and OOMKilled events', 'Compare memory usage against limits over the incident window'],
  },
  {
    title: 'Recent deploy or configuration change',
    test: /\b(deploy(ed|ment)?|release|rollout|rolled out|version|config(uration)? (change|reload)|migration)\b/i,
    rationale: 'Deploy or configuration activity appears in the evidence near the incident window.',
    nextSteps: ['Diff the change deployed closest to the first error', 'Consider rolling back to confirm or rule out'],
  },
  {
    title: 'Upstream dependency timeouts',
    test: /timed? ?out|deadline exceeded|timeout/i,
    rationale: 'Requests are timing out waiting on a dependency, which can be a cause or a downstream symptom.',
    nextSteps: ['Identify which dependency the timeouts target', 'Check that dependency\'s latency and error dashboards'],
  },
  {
    title: 'Upstream service returning 5xx',
    test: /\b50[0-4]\b|bad gateway|service unavailable|upstream (connect|error|reset)/i,
    rationale: 'Server errors from an upstream service are propagating to callers.',
    nextSteps: ['Trace a failing request to find the first service returning 5xx', 'Check that service\'s health and recent changes'],
  },
  {
    title: 'Rate limiting or quota exhaustion',
    test: /rate.?limit|\b429\b|throttl|quota/i,
    rationale: 'Requests are being throttled by a provider or internal limiter.',
    nextSteps: ['Check provider quota dashboards', 'Look for a traffic spike or retry storm'],
  },
  {
    title: 'Disk space exhaustion',
    test: /no space left|enospc|disk (full|quota)/i,
    rationale: 'Writes are failing because a volume is full.',
    nextSteps: ['Check volume usage on affected hosts', 'Find what is filling the disk (logs, temp files, WAL)'],
  },
  {
    title: 'TLS or certificate failure',
    test: /certificate|x509|tls handshake|ssl/i,
    rationale: 'TLS negotiation errors suggest an expired or mismatched certificate.',
    nextSteps: ['Check certificate expiry dates', 'Verify the trust chain on both sides of the connection'],
  },
  {
    title: 'DNS resolution failure',
    test: /enotfound|nxdomain|name resolution|could not resolve|dns/i,
    rationale: 'Services cannot resolve hostnames of their dependencies.',
    nextSteps: ['Test resolution from an affected host', 'Check recent DNS or service-discovery changes'],
  },
  {
    title: 'Authentication or credential failure',
    test: /unauthori[sz]ed|\b401\b|\b403\b|forbidden|token (expired|invalid)|invalid credentials|permission denied/i,
    rationale: 'Calls are being rejected for authentication or authorization reasons, e.g. a rotated or expired secret.',
    nextSteps: ['Check for recently rotated secrets or expired tokens', 'Verify the service account permissions'],
  },
]

function signalSeverity(s: Signal): AnalysisSignal['severity'] {
  if (s.level === 'fatal' || (s.level === 'error' && s.count >= 5)) return 'critical'
  if (s.level === 'error' || s.level === 'warn') return 'warning'
  return 'info'
}

/**
 * Rule-based analysis used when the model is unavailable. It is deliberately
 * conservative: confidence never exceeds "medium".
 */
export function heuristicAnalysis(incident: Incident, entries: LogEntry[], notice?: string): AnalysisResult {
  const summary = summarizeEntries(entries)
  const signals = extractSignals(entries)
  const problems = entries.filter((e) => e.level === 'error' || e.level === 'fatal' || e.level === 'warn')
  const errorCount = summary.byLevel.error + summary.byLevel.fatal

  const matches = RULES.map((rule) => {
    const hits = problems.filter((e) => rule.test.test(e.raw))
    const contextHits = rule.title.startsWith('Recent deploy') ? entries.filter((e) => rule.test.test(e.raw)) : hits
    return { rule, hits: contextHits }
  })
    .filter((m) => m.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length)
    .slice(0, 3)

  const hypotheses: HypothesisDraft[] = matches.map(({ rule, hits }) => {
    const hitSignals = extractSignals(hits, 'debug').slice(0, 3)
    const share = problems.length ? hits.length / problems.length : 0
    const contradicting: string[] = []
    if (share < 0.3 && problems.length > 0) {
      contradicting.push(`Only ${hits.length} of ${problems.length} warning/error entries match this pattern`)
    }
    const otherServices = summary.services.filter((s) => !hits.some((h) => h.service === s))
    if (otherServices.length > 0 && hits.length > 0) {
      contradicting.push(`No matching entries from ${otherServices.slice(0, 3).join(', ')}`)
    }
    return {
      title: rule.title,
      rationale: rule.rationale,
      supporting: hitSignals.map(describeSignal),
      contradicting,
      nextSteps: rule.nextSteps,
      confidence: share >= 0.4 && hits.length >= 3 ? 'medium' : 'low',
    }
  })

  if (hypotheses.length === 0 && signals.length > 0) {
    const top = signals[0]
    hypotheses.push({
      title: `Unclassified failure: ${top.sample.slice(0, 80)}`,
      rationale: 'The most frequent error does not match a known failure pattern.',
      supporting: signals.slice(0, 3).map(describeSignal),
      contradicting: [],
      nextSteps: ['Find the code path that emits the top error', 'Correlate its first occurrence with deploys and traffic'],
      confidence: 'low',
    })
  }

  const analysisSignals: AnalysisSignal[] = signals.slice(0, 6).map((s) => ({
    label: s.sample.slice(0, 80),
    detail: `${s.level} ×${s.count}${s.services.length ? ` in ${s.services.join(', ')}` : ''}`,
    count: s.count,
    at: s.firstSeen,
    severity: signalSeverity(s),
  }))
  if (summary.latency && summary.latency.ratio >= 2) {
    analysisSignals.unshift({
      label: `Latency increased ${summary.latency.ratio}×`,
      detail: `Baseline ${summary.latency.baselineMs}ms → peak ${summary.latency.peakMs}ms`,
      count: summary.latency.samples,
      at: summary.latency.peakAt,
      severity: summary.latency.ratio >= 4 ? 'critical' : 'warning',
    })
  }

  const relatedErrors: RelatedError[] = signals
    .filter((s) => s.level !== 'warn')
    .slice(0, 5)
    .map((s) => ({ signature: s.signature, count: s.count, relation: 'Frequent error during the incident window' }))

  const keyEvents: KeyEventDraft[] = []
  if (summary.firstError?.timestamp) {
    keyEvents.push({ at: summary.firstError.timestamp, title: 'First error observed', detail: summary.firstError.message.slice(0, 200) })
  }
  for (const s of signals.slice(0, 3)) {
    if (s.firstSeen && s.firstSeen !== summary.firstError?.timestamp) {
      keyEvents.push({ at: s.firstSeen, title: `First "${s.sample.slice(0, 60)}"`, detail: `Seen ${s.count} times` })
    }
  }
  if (summary.latency?.peakAt && summary.latency.ratio >= 2) {
    keyEvents.push({
      at: summary.latency.peakAt,
      title: `Latency peak ${summary.latency.peakMs}ms`,
      detail: `${summary.latency.ratio}× the ${summary.latency.baselineMs}ms baseline`,
    })
  }

  const checklist: ChecklistItem[] = [
    ...hypotheses.slice(0, 2).flatMap((h) =>
      h.nextSteps.slice(0, 2).map((step) => ({ step, why: `Tests "${h.title}"`, priority: 'now' as const })),
    ),
    { step: 'List deploys and config changes in the hour before the first error', why: 'Most incidents follow a change', priority: 'next' },
    { step: 'Confirm customer impact from request/error-rate dashboards', why: 'Sizes severity and urgency', priority: 'next' },
  ]

  const topLine = signals[0] ? `The most frequent problem is "${signals[0].sample.slice(0, 100)}" (${signals[0].count}×).` : 'No warnings or errors were found in the evidence.'
  const firstError = summary.firstError?.timestamp ? ` Errors begin at ${summary.firstError.timestamp.slice(11, 19)} UTC.` : ''
  return {
    analysis: {
      engine: 'heuristic',
      notice,
      summary: `${incident.severity} incident on ${incident.service || 'an unnamed service'}: ${summary.total} evidence entries with ${errorCount} errors and ${summary.byLevel.warn} warnings. ${topLine}${firstError}`,
      impact: incident.description || 'Impact has not been described yet.',
      overallConfidence: hypotheses.some((h) => h.confidence === 'medium') ? 'medium' : 'low',
      signals: analysisSignals,
      relatedErrors,
      checklist,
      uncertainty: [
        'Rule-based analysis matches known error patterns only; it cannot reason about causality.',
        ...(summary.window ? [] : ['Evidence has no timestamps, so ordering of events is unknown.']),
        ...(entries.length === 0 ? ['No evidence has been added yet.'] : []),
      ],
    },
    hypotheses,
    keyEvents,
  }
}

export const QA_INSTRUCTIONS = `You are SignalDesk, an incident-response analyst answering an on-call engineer's question about an active incident.
Answer only from the incident context provided: evidence, analysis, hypotheses and their review status, notes and timeline.
Quote or cite specific log lines, counts and timestamps when they support your answer.
If the evidence cannot answer the question, say so plainly and name the data that would.
Respect the team's hypothesis reviews: do not argue for a rejected hypothesis unless new evidence contradicts the rejection.
Be concise: short paragraphs or "- " bullet lists, no headings, under 250 words.`

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'is', 'are', 'was', 'were', 'what', 'why', 'how', 'when', 'where', 'which',
  'did', 'does', 'do', 'to', 'of', 'in', 'on', 'for', 'at', 'by', 'with', 'this', 'that', 'it', 'any', 'there',
  'we', 'our', 'i', 'you', 'be', 'from', 'about', 'show', 'me', 'find', 'see', 'can', 'could', 'should',
])

/** Keyword search over evidence, used to answer when the model is unavailable. */
export function searchEvidenceAnswer(question: string, entries: LogEntry[], notice: string): string {
  const terms = [...new Set(question.toLowerCase().match(/[a-z0-9_.-]{3,}/g) ?? [])].filter((t) => !STOP_WORDS.has(t))
  if (terms.length === 0) return `${notice}\n\nAsk about a specific error, service or time and I'll search the evidence directly.`
  const scored = entries
    .map((e) => ({ e, score: terms.filter((t) => e.raw.toLowerCase().includes(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.e.timestamp ?? '').localeCompare(b.e.timestamp ?? ''))
  if (scored.length === 0) {
    return `${notice}\n\nNo evidence entries mention ${terms.map((t) => `"${t}"`).join(', ')}.`
  }
  const lines = scored.slice(0, 8).map(({ e }) => `- ${e.timestamp ? `${e.timestamp.slice(11, 19)} ` : ''}[${e.level}] ${e.message.slice(0, 160)}`)
  return `${notice}\n\n${scored.length} evidence entries match ${terms.map((t) => `"${t}"`).join(', ')}. Most relevant:\n${lines.join('\n')}`
}
