import { describe, expect, it } from 'vitest'
import { buildEvidenceDigest, heuristicAnalysis, parseAnalysisResponse } from './analysis'
import type { Incident } from './incident-types'
import { parseTextLog } from './signals'

const incident: Incident = {
  title: 'Checkout failing',
  severity: 'SEV1',
  service: 'checkout-api',
  description: 'Customers cannot complete checkout',
  startedAt: '2026-09-28T14:30:00Z',
  status: 'investigating',
}

const LOG = `2026-09-28T14:30:02Z INFO [checkout-api] GET /cart 200 latency=80ms
2026-09-28T14:30:40Z INFO [checkout-api] GET /cart 200 latency=90ms
2026-09-28T14:31:55Z INFO [deployer] deployed checkout-api v2.14.0
2026-09-28T14:32:07Z ERROR [checkout-api] DB connection timeout: could not acquire connection from pool after 5000ms
2026-09-28T14:32:08Z ERROR [checkout-api] DB connection timeout: could not acquire connection from pool after 5000ms
2026-09-28T14:32:09Z ERROR [checkout-api] DB connection timeout: could not acquire connection from pool after 5000ms
2026-09-28T14:32:30Z WARN [checkout-api] GET /cart 503 latency=5200ms`

describe('parseAnalysisResponse', () => {
  it('accepts fenced JSON and fills defaults for missing fields', () => {
    const result = parseAnalysisResponse(
      'Here you go:\n```json\n{"summary":"Pool exhausted","hypotheses":[{"title":"Pool exhaustion","confidence":"high"}],"keyEvents":[{"at":"2026-09-28T14:32:07Z","title":"First timeout","detail":""},{"at":"not a date","title":"bad","detail":""}]}\n```',
    )
    expect(result.analysis.summary).toBe('Pool exhausted')
    expect(result.analysis.engine).toBe('ai')
    expect(result.analysis.overallConfidence).toBe('low')
    expect(result.hypotheses[0]).toMatchObject({ title: 'Pool exhaustion', confidence: 'high', supporting: [] })
    expect(result.keyEvents).toEqual([{ at: '2026-09-28T14:32:07.000Z', title: 'First timeout', detail: '' }])
  })

  it('coerces invalid enum values instead of failing', () => {
    const result = parseAnalysisResponse('{"summary":"x","overallConfidence":"certain","hypotheses":[{"title":"a","confidence":"very"}]}')
    expect(result.analysis.overallConfidence).toBe('low')
    expect(result.hypotheses[0].confidence).toBe('low')
  })

  it('rejects responses without JSON or without a summary', () => {
    expect(() => parseAnalysisResponse('I cannot help')).toThrow()
    expect(() => parseAnalysisResponse('{"impact":"x"}')).toThrow()
  })
})

describe('heuristicAnalysis', () => {
  const result = heuristicAnalysis(incident, parseTextLog(LOG), 'AI unavailable')

  it('ranks the connection pool hypothesis first with supporting evidence', () => {
    expect(result.hypotheses[0].title).toBe('Database connection pool exhaustion')
    expect(result.hypotheses[0].supporting[0]).toMatch(/×3/)
    expect(result.hypotheses[0].confidence).toBe('medium')
  })

  it('never claims high confidence and flags itself as rule-based', () => {
    expect(result.analysis.engine).toBe('heuristic')
    expect(result.analysis.notice).toBe('AI unavailable')
    expect(result.hypotheses.every((h) => h.confidence !== 'high')).toBe(true)
  })

  it('surfaces the deploy and the latency shift', () => {
    expect(result.hypotheses.map((h) => h.title)).toContain('Recent deploy or configuration change')
    expect(result.analysis.signals[0].label).toMatch(/^Latency increased/)
    expect(result.keyEvents[0]).toMatchObject({ at: '2026-09-28T14:32:07.000Z', title: 'First error observed' })
  })

  it('handles an incident with no evidence', () => {
    const empty = heuristicAnalysis(incident, [])
    expect(empty.hypotheses).toEqual([])
    expect(empty.analysis.uncertainty).toContain('No evidence has been added yet.')
  })
})

describe('buildEvidenceDigest', () => {
  it('includes metadata, computed statistics, signatures and excerpts', () => {
    const digest = buildEvidenceDigest(
      incident,
      [{ id: 'e1', incidentId: 'i1', kind: 'log', label: 'api.log', service: 'checkout-api', content: LOG }],
      parseTextLog(LOG),
      [{ incidentId: 'i1', title: 'Bad deploy', status: 'rejected' } as never],
    )
    expect(digest).toContain('Severity: SEV1')
    expect(digest).toContain('error=3')
    expect(digest).toMatch(/could not acquire connection.*×3/)
    expect(digest).toContain('[rejected] Bad deploy')
    expect(digest).toContain('### api.log (log, checkout-api, 7 lines)')
  })
})
