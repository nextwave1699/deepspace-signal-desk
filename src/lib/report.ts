import { z } from 'zod'
import { extractJsonObject } from './analysis'
import type { Evidence, Hypothesis, Incident, IncidentReport, Note } from './incident-types'
import type { TimelineRow } from './timeline'

export const REPORT_INSTRUCTIONS = `You are SignalDesk, writing the post-incident report for an engineering team.
Use only the incident context provided. The root cause must reflect hypotheses the team CONFIRMED; if none is confirmed, say the root cause is not yet confirmed and name the leading candidate with its confidence.
Write for engineers and engineering managers: factual, blameless, specific (services, times in UTC, counts).
Respond with ONLY a JSON object:
{
  "summary": "3-5 sentence executive summary",
  "rootCause": "root cause and the evidence that confirms it",
  "impact": "who and what was affected, for how long, how badly",
  "resolution": "what was done to mitigate and resolve, from milestones and notes",
  "followUps": ["concrete, owner-assignable follow-up action", "..."]
}
Give 3-7 follow-ups covering prevention, detection and response.`

const reportSchema = z.object({
  summary: z.string().catch(''),
  rootCause: z.string().catch(''),
  impact: z.string().catch(''),
  resolution: z.string().catch(''),
  followUps: z.array(z.string()).catch([]),
})

export function parseReportResponse(raw: string, now = new Date()): IncidentReport {
  const parsed = reportSchema.parse(extractJsonObject(raw))
  if (!parsed.summary || !parsed.rootCause) throw new Error('Model report is missing required sections')
  return { ...parsed, followUps: parsed.followUps.filter(Boolean), engine: 'ai', generatedAt: now.toISOString() }
}

export function heuristicReport(
  incident: Incident,
  hypotheses: Hypothesis[],
  milestones: { at: string; title: string; detail: string }[],
  now = new Date(),
): IncidentReport {
  const confirmed = hypotheses.filter((h) => h.status === 'confirmed')
  const leading = hypotheses
    .filter((h) => h.status !== 'rejected')
    .sort((a, b) => rank(b.confidence) - rank(a.confidence))[0]

  const rootCause = confirmed.length
    ? confirmed.map((h) => `${h.title}. ${h.rationale}${h.supporting.length ? ` Evidence: ${h.supporting.join('; ')}.` : ''}`).join('\n\n')
    : leading
      ? `Not yet confirmed. Leading hypothesis: ${leading.title} (${leading.confidence} confidence).`
      : 'Not yet determined.'

  const resolution = milestones.length
    ? milestones.map((m) => `${m.at.slice(0, 16).replace('T', ' ')} UTC — ${m.title}${m.detail ? `: ${m.detail}` : ''}`).join('\n')
    : incident.status === 'resolved'
      ? 'The incident was marked resolved; no mitigation steps were recorded.'
      : 'The incident is still open.'

  const checklistOpen = (incident.analysis?.checklist ?? [])
    .filter((c) => !(incident.checklistDone ?? []).includes(c.step))
    .map((c) => c.step)
  const followUps = [
    ...confirmed.flatMap((h) => h.nextSteps.slice(0, 2)),
    ...checklistOpen.slice(0, 3),
    'Add alerting on the first signal that preceded customer impact',
  ].filter((v, i, all) => all.indexOf(v) === i)

  return {
    summary:
      incident.analysis?.summary ??
      `${incident.severity} incident "${incident.title}" affecting ${incident.service || 'an unnamed service'}.`,
    rootCause,
    impact: incident.analysis?.impact || incident.description || 'Impact was not recorded.',
    resolution,
    followUps,
    engine: 'heuristic',
    generatedAt: now.toISOString(),
  }
}

function rank(c: Hypothesis['confidence']): number {
  return { low: 0, medium: 1, high: 2 }[c] ?? 0
}

export interface ReportContext {
  incident: Incident
  report: IncidentReport
  timeline: TimelineRow[]
  evidence: (Evidence & { entries: number; errors: number })[]
  hypotheses: Hypothesis[]
  notes?: Note[]
}

function utc(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

export function reportToMarkdown({ incident, report, timeline, evidence, hypotheses }: ReportContext): string {
  const duration =
    incident.status === 'resolved' && incident.resolvedAt
      ? `${Math.round((new Date(incident.resolvedAt).getTime() - new Date(incident.startedAt).getTime()) / 60000)} minutes`
      : 'ongoing'
  const lines = [
    `# Incident report: ${incident.title}`,
    '',
    `| | |`,
    `|---|---|`,
    `| Severity | ${incident.severity} |`,
    `| Service | ${incident.service || '—'} |`,
    `| Status | ${incident.status} |`,
    `| Started | ${utc(incident.startedAt)} |`,
    `| Duration | ${duration} |`,
    '',
    '## Summary',
    '',
    report.summary,
    '',
    '## Root cause',
    '',
    report.rootCause,
    '',
    '## Impact',
    '',
    report.impact,
    '',
    '## Timeline',
    '',
    ...timeline.map((r) => `- **${utc(r.at)}** — ${r.title}${r.detail ? `: ${r.detail}` : ''}`),
    '',
    '## Evidence',
    '',
    ...(evidence.length
      ? evidence.map((e) => `- ${e.label} (${e.kind}${e.service ? `, ${e.service}` : ''}) — ${e.entries} entries, ${e.errors} errors`)
      : ['- No evidence attached']),
    '',
    '## Hypotheses reviewed',
    '',
    ...(hypotheses.length
      ? hypotheses.map((h) => `- [${h.status}] ${h.title} (${h.confidence} confidence)`)
      : ['- None recorded']),
    '',
    '## Resolution',
    '',
    report.resolution,
    '',
    '## Follow-up actions',
    '',
    ...(report.followUps.length ? report.followUps.map((f) => `- [ ] ${f}`) : ['- None']),
    '',
    `_Generated by SignalDesk (${report.engine === 'ai' ? 'AI draft' : 'rule-based draft'}), ${utc(report.generatedAt)}. Reviewed and edited by the incident team._`,
    '',
  ]
  return lines.join('\n')
}
