import { describe, expect, it } from 'vitest'
import type { Hypothesis, Incident } from './incident-types'
import { heuristicReport, parseReportResponse, reportToMarkdown } from './report'

const incident: Incident = {
  title: 'Checkout failing',
  severity: 'SEV1',
  service: 'checkout-api',
  description: 'Customers cannot pay',
  startedAt: '2026-09-28T14:30:00.000Z',
  status: 'resolved',
  resolvedAt: '2026-09-28T15:12:00.000Z',
}

const hypothesis = (patch: Partial<Hypothesis>): Hypothesis => ({
  incidentId: 'i1',
  title: 'Pool exhaustion',
  rationale: 'Pool saturated.',
  supporting: ['DB timeout ×37'],
  contradicting: [],
  nextSteps: ['Raise pool size alarm'],
  confidence: 'medium',
  status: 'open',
  source: 'ai',
  ...patch,
})

describe('parseReportResponse', () => {
  it('parses a model report and stamps it', () => {
    const report = parseReportResponse(
      '{"summary":"s","rootCause":"r","impact":"i","resolution":"x","followUps":["a",""]}',
      new Date('2026-09-28T16:00:00Z'),
    )
    expect(report).toEqual({
      summary: 's',
      rootCause: 'r',
      impact: 'i',
      resolution: 'x',
      followUps: ['a'],
      engine: 'ai',
      generatedAt: '2026-09-28T16:00:00.000Z',
    })
  })

  it('rejects a report without a root cause', () => {
    expect(() => parseReportResponse('{"summary":"s"}')).toThrow()
  })
})

describe('heuristicReport', () => {
  it('uses confirmed hypotheses as the root cause', () => {
    const report = heuristicReport(incident, [hypothesis({ status: 'confirmed' })], [
      { at: '2026-09-28T14:50:00.000Z', title: 'Raised pool size', detail: '' },
    ])
    expect(report.rootCause).toMatch(/^Pool exhaustion\. Pool saturated\. Evidence: DB timeout ×37/)
    expect(report.resolution).toBe('2026-09-28 14:50 UTC — Raised pool size')
    expect(report.followUps).toContain('Raise pool size alarm')
  })

  it('names the leading candidate when nothing is confirmed', () => {
    const report = heuristicReport(incident, [hypothesis({ confidence: 'high', title: 'Bad deploy' }), hypothesis({})], [])
    expect(report.rootCause).toBe('Not yet confirmed. Leading hypothesis: Bad deploy (high confidence).')
  })
})

describe('reportToMarkdown', () => {
  it('renders every report section', () => {
    const report = heuristicReport(incident, [hypothesis({ status: 'confirmed' })], [])
    const md = reportToMarkdown({
      incident,
      report,
      timeline: [{ id: 'start', at: incident.startedAt, title: 'Incident started', detail: '', tone: 'start' }],
      evidence: [{ incidentId: 'i1', kind: 'log', label: 'api.log', service: 'checkout-api', content: '', entries: 10, errors: 4 }],
      hypotheses: [hypothesis({ status: 'confirmed' })],
    })
    for (const heading of ['Summary', 'Root cause', 'Impact', 'Timeline', 'Evidence', 'Resolution', 'Follow-up actions']) {
      expect(md).toContain(`## ${heading}`)
    }
    expect(md).toContain('| Duration | 42 minutes |')
    expect(md).toContain('- **2026-09-28 14:30 UTC** — Incident started')
    expect(md).toContain('- api.log (log, checkout-api) — 10 entries, 4 errors')
    expect(md).toContain('- [confirmed] Pool exhaustion (medium confidence)')
  })
})
