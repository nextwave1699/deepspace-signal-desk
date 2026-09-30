import { generateText, Output } from 'ai'
import type { z } from 'zod'
import { createDeepSpaceAI, DEEPSPACE_AI_DEFAULTS, loggableError, resolveAppRole } from 'deepspace/worker'
import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  ANALYSIS_INSTRUCTIONS,
  analysisOutputSchema,
  buildEvidenceDigest,
  heuristicAnalysis,
  parseAnalysisResponse,
  QA_INSTRUCTIONS,
  searchEvidenceAnswer,
  type AnalysisResult,
} from '../lib/analysis'
import type {
  Evidence,
  Hypothesis,
  Incident,
  IncidentMessage,
  IncidentReport,
  Note,
  TimelineEvent,
} from '../lib/incident-types'
import { buildDemoIncident } from '../lib/demo-data'
import { heuristicReport, parseReportResponse, REPORT_INSTRUCTIONS, reportOutputSchema } from '../lib/report'
import { parseEvidenceSources } from '../lib/signals'

type Row<T> = { recordId: string; data: T; createdBy?: string }

const MODEL_TIMEOUT_MS = 90_000

export async function requireWriter(env: Env, userId: string): Promise<string | null> {
  const role = await resolveAppRole(env, userId)
  return role === 'member' || role === 'admin' ? null : 'Only team members can run incident analysis'
}

export async function loadIncident(tools: ActionTools, incidentId: unknown): Promise<Row<Incident> | string> {
  if (typeof incidentId !== 'string' || !incidentId) return 'incidentId is required'
  const res = await tools.get('incidents', incidentId)
  if (!res.success) return 'Incident not found'
  return res.data.record as unknown as Row<Incident>
}

export async function queryByIncident<T>(tools: ActionTools, collection: string, incidentId: string): Promise<Row<T>[]> {
  const res = await tools.query(collection, { where: { incidentId }, orderBy: 'createdAt', orderDir: 'asc' })
  return res.success ? (res.data.records as unknown as Row<T>[]) : []
}

export function patchIncident(tools: ActionTools, incidentId: string, patch: Partial<Incident>) {
  return tools.update('incidents', incidentId, patch as Record<string, unknown>)
}

/**
 * Incident analysis is team infrastructure, so model calls bill the app owner
 * rather than whichever on-call engineer clicked the button. requireWriter
 * keeps that spend limited to team members.
 */
export async function generateWithModel(env: Env, instructions: string, prompt: string): Promise<string> {
  const ai = createDeepSpaceAI(env, 'anthropic')
  const { text } = await generateText({
    model: ai(DEEPSPACE_AI_DEFAULTS.directGeneration),
    instructions,
    prompt,
    maxOutputTokens: 6000,
    abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  })
  return text
}

/** Like generateWithModel, but the provider enforces the given JSON schema. */
export async function generateStructured<T>(
  env: Env,
  instructions: string,
  prompt: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const ai = createDeepSpaceAI(env, 'anthropic')
  const { output } = await generateText({
    model: ai(DEEPSPACE_AI_DEFAULTS.directGeneration),
    instructions,
    prompt,
    output: Output.object({ schema }),
    maxOutputTokens: 8000,
    abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  })
  return output
}

function describeFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/credit|balance|402|payment/i.test(message)) return 'AI credits are exhausted'
  if (/timeout|aborted/i.test(message)) return 'The AI model timed out'
  return 'The AI model could not be reached'
}

export const analyzeIncident: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const denied = await requireWriter(env, userId)
  if (denied) return { success: false, error: denied }

  const incident = await loadIncident(tools, params.incidentId)
  if (typeof incident === 'string') return { success: false, error: incident }
  const incidentId = incident.recordId

  await patchIncident(tools, incidentId, { analysisStatus: 'running', analysisError: '' })

  try {
    const [evidence, hypotheses, timeline] = await Promise.all([
      queryByIncident<Evidence>(tools, 'evidence', incidentId),
      queryByIncident<Hypothesis>(tools, 'hypotheses', incidentId),
      queryByIncident<TimelineEvent>(tools, 'timeline-events', incidentId),
    ])
    const sources = evidence.map((e) => ({ id: e.recordId, ...e.data }))
    const entries = parseEvidenceSources(sources, incident.data.startedAt)

    let result: AnalysisResult
    if (entries.length === 0 && !incident.data.description) {
      result = heuristicAnalysis(incident.data, entries, 'Add evidence to get an AI analysis.')
    } else {
      try {
        const digest = buildEvidenceDigest(incident.data, sources, entries, hypotheses.map((h) => h.data))
        const raw = await generateStructured(env, ANALYSIS_INSTRUCTIONS, digest, analysisOutputSchema)
        result = parseAnalysisResponse(raw)
      } catch (err) {
        console.warn(`[analyzeIncident] falling back to rule-based analysis: ${loggableError(err)}`)
        result = heuristicAnalysis(
          incident.data,
          entries,
          `${describeFailure(err)}, so this is a rule-based analysis. Re-run to try the AI again.`,
        )
      }
    }

    await replaceAiArtifacts(tools, incidentId, result, hypotheses, timeline)
    await patchIncident(tools, incidentId, {
      analysis: result.analysis,
      analysisStatus: 'idle',
      analyzedAt: new Date().toISOString(),
    })
    return { success: true, data: { engine: result.analysis.engine, hypotheses: result.hypotheses.length } }
  } catch (err) {
    console.error(`[analyzeIncident] failed: ${loggableError(err)}`)
    await patchIncident(tools, incidentId, {
      analysisStatus: 'failed',
      analysisError: 'Analysis failed. Try again in a moment.',
    })
    return { success: false, error: 'Analysis failed' }
  }
}

/**
 * Swap in the new AI hypotheses and key events. Hypotheses the team has
 * already acted on (investigating, confirmed, rejected) are kept, and new ones
 * that duplicate them by title are skipped.
 */
async function replaceAiArtifacts(
  tools: ActionTools,
  incidentId: string,
  result: AnalysisResult,
  hypotheses: Row<Hypothesis>[],
  timeline: Row<TimelineEvent>[],
): Promise<void> {
  const stale = hypotheses.filter((h) => h.data.source === 'ai' && h.data.status === 'open')
  const kept = new Set(
    hypotheses.filter((h) => !stale.includes(h)).map((h) => h.data.title.trim().toLowerCase()),
  )
  const writes: Promise<ActionResult<unknown>>[] = [
    ...stale.map((h) => tools.remove('hypotheses', h.recordId)),
    ...timeline
      .filter((t) => t.data.source === 'ai' && t.data.kind === 'key-event')
      .map((t) => tools.remove('timeline-events', t.recordId)),
    ...result.hypotheses
      .filter((h) => !kept.has(h.title.trim().toLowerCase()))
      .map((h) =>
        tools.create('hypotheses', {
          incidentId,
          ...h,
          status: 'open',
          source: 'ai',
        }),
      ),
    ...result.keyEvents.map((e) =>
      tools.create('timeline-events', {
        incidentId,
        ...e,
        kind: 'key-event',
        source: 'ai',
      }),
    ),
  ]
  await Promise.all(writes)
}

const MAX_QUESTION_CHARS = 2000
const HISTORY_TURNS = 12

export const askIncident: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const denied = await requireWriter(env, userId)
  if (denied) return { success: false, error: denied }

  const question = typeof params.question === 'string' ? params.question.trim() : ''
  if (!question) return { success: false, error: 'question is required' }
  if (question.length > MAX_QUESTION_CHARS) return { success: false, error: 'Question is too long' }

  const incident = await loadIncident(tools, params.incidentId)
  if (typeof incident === 'string') return { success: false, error: incident }
  const incidentId = incident.recordId

  const [evidence, hypotheses, notes, timeline, history] = await Promise.all([
    queryByIncident<Evidence>(tools, 'evidence', incidentId),
    queryByIncident<Hypothesis>(tools, 'hypotheses', incidentId),
    queryByIncident<Note>(tools, 'notes', incidentId),
    queryByIncident<TimelineEvent>(tools, 'timeline-events', incidentId),
    queryByIncident<IncidentMessage>(tools, 'incident-messages', incidentId),
  ])

  await tools.create('incident-messages', { incidentId, role: 'user', content: question })

  const sources = evidence.map((e) => ({ id: e.recordId, ...e.data }))
  const entries = parseEvidenceSources(sources, incident.data.startedAt)
  const context = [
    buildEvidenceDigest(incident.data, sources, entries, hypotheses.map((h) => h.data)),
    formatInvestigationState(incident.data, hypotheses, notes, timeline),
    '## Conversation so far',
    ...history.slice(-HISTORY_TURNS).map((m) => `${m.data.role === 'user' ? 'Engineer' : 'SignalDesk'}: ${m.data.content}`),
    '',
    `## Question\n${question}`,
  ].join('\n')

  let answer: string
  try {
    answer = (await generateWithModel(env, QA_INSTRUCTIONS, context)).trim()
    if (!answer) throw new Error('empty answer')
  } catch (err) {
    console.warn(`[askIncident] falling back to evidence search: ${loggableError(err)}`)
    answer = searchEvidenceAnswer(question, entries, `${describeFailure(err)}, so I searched the evidence directly.`)
  }

  await tools.create('incident-messages', { incidentId, role: 'assistant', content: answer })
  return { success: true, data: { answer } }
}

function formatInvestigationState(
  incident: Incident,
  hypotheses: Row<Hypothesis>[],
  notes: Row<Note>[],
  timeline: Row<TimelineEvent>[],
): string {
  const parts: string[] = []
  if (incident.analysis) {
    parts.push('## Current analysis', incident.analysis.summary)
  }
  if (hypotheses.length) {
    parts.push('', '## Hypotheses and review status')
    for (const h of hypotheses) {
      parts.push(`- [${h.data.status}, ${h.data.confidence} confidence] ${h.data.title}: ${h.data.rationale}`)
    }
  }
  const milestones = timeline.filter((t) => t.data.source === 'user')
  if (milestones.length) {
    parts.push('', '## Team milestones')
    for (const t of milestones) parts.push(`- ${t.data.at} ${t.data.title}${t.data.detail ? ` — ${t.data.detail}` : ''}`)
  }
  if (notes.length) {
    parts.push('', '## Investigation notes')
    for (const n of notes.slice(-20)) parts.push(`- ${n.data.body.slice(0, 500)}`)
  }
  parts.push('')
  return parts.join('\n')
}

export const generateReport: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const denied = await requireWriter(env, userId)
  if (denied) return { success: false, error: denied }

  const incident = await loadIncident(tools, params.incidentId)
  if (typeof incident === 'string') return { success: false, error: incident }
  const incidentId = incident.recordId

  const [evidence, hypotheses, notes, timeline] = await Promise.all([
    queryByIncident<Evidence>(tools, 'evidence', incidentId),
    queryByIncident<Hypothesis>(tools, 'hypotheses', incidentId),
    queryByIncident<Note>(tools, 'notes', incidentId),
    queryByIncident<TimelineEvent>(tools, 'timeline-events', incidentId),
  ])
  const milestones = timeline
    .filter((t) => t.data.source === 'user')
    .map((t) => t.data)
    .sort((a, b) => a.at.localeCompare(b.at))

  let report: IncidentReport
  try {
    const sources = evidence.map((e) => ({ id: e.recordId, ...e.data }))
    const entries = parseEvidenceSources(sources, incident.data.startedAt)
    const context = [
      buildEvidenceDigest(incident.data, sources, entries, hypotheses.map((h) => h.data)),
      formatInvestigationState(incident.data, hypotheses, notes, timeline),
      `Status: ${incident.data.status}${incident.data.resolvedAt ? `, resolved at ${incident.data.resolvedAt}` : ''}`,
    ].join('\n')
    report = parseReportResponse(await generateStructured(env, REPORT_INSTRUCTIONS, context, reportOutputSchema))
  } catch (err) {
    console.warn(`[generateReport] falling back to rule-based report: ${loggableError(err)}`)
    report = heuristicReport(incident.data, hypotheses.map((h) => h.data), milestones)
  }

  await patchIncident(tools, incidentId, { report })
  return { success: true, data: { engine: report.engine } }
}

export const seedDemoIncident: ActionHandler<Env> = async ({ userId, tools, env }) => {
  const denied = await requireWriter(env, userId)
  if (denied) return { success: false, error: denied }

  const demo = buildDemoIncident()
  const created = await tools.create('incidents', demo.incident as unknown as Record<string, unknown>)
  if (!created.success) return created
  const incidentId = created.data.recordId

  await Promise.all([
    ...demo.evidence.map((e) => tools.create('evidence', { incidentId, ...e })),
    ...demo.milestones.map((m) => tools.create('timeline-events', { incidentId, ...m })),
  ])
  return { success: true, data: { incidentId } }
}

const CHILD_COLLECTIONS = ['evidence', 'hypotheses', 'timeline-events', 'notes', 'incident-messages']
const DELETE_PAGE = 500

export const deleteIncident: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const incident = await loadIncident(tools, params.incidentId)
  if (typeof incident === 'string') return { success: false, error: incident }

  if (incident.createdBy !== userId && (await resolveAppRole(env, userId)) !== 'admin') {
    return { success: false, error: 'Only the incident creator or an admin can delete it' }
  }

  for (const collection of CHILD_COLLECTIONS) {
    for (;;) {
      const res = await tools.deleteWhere(collection, { incidentId: incident.recordId }, DELETE_PAGE)
      if (!res.success) return { success: false, error: `Could not delete ${collection}` }
      if (res.data.deleted < DELETE_PAGE) break
    }
  }
  const removed = await tools.remove('incidents', incident.recordId)
  if (!removed.success) return removed
  console.info(`[deleteIncident] ${incident.recordId} deleted by ${userId}`)
  return { success: true, data: { incidentId: incident.recordId } }
}
