import { describe, expect, it } from 'vitest'
import { buildDemoIncident } from './demo-data'
import { extractSignals, parseEvidence, summarizeEntries } from './signals'

describe('buildDemoIncident', () => {
  const demo = buildDemoIncident(Date.parse('2026-09-30T15:00:00Z'))
  const [appLog, lbEvents, stack] = demo.evidence
  const referenceDate = demo.incident.startedAt

  it('produces deterministic evidence in every supported shape', () => {
    expect(buildDemoIncident(Date.parse('2026-09-30T15:00:00Z'))).toEqual(demo)
    expect(demo.evidence.map((e) => e.kind)).toEqual(['log', 'json', 'stacktrace'])
  })

  it('makes pool exhaustion the dominant, timestamped signal', () => {
    const entries = parseEvidence(appLog.kind, appLog.content, { referenceDate })
    const [top] = extractSignals(entries)
    expect(top.sample).toMatch(/DB connection pool timeout/)
    expect(top.count).toBeGreaterThan(20)
    const summary = summarizeEntries(entries)
    expect(summary.latency?.ratio).toBeGreaterThan(4)
    expect(summary.firstError?.timestamp && summary.firstError.timestamp < demo.incident.startedAt).toBe(true)
  })

  it('parses the load balancer JSON and the stack trace', () => {
    expect(parseEvidence(lbEvents.kind, lbEvents.content).some((e) => e.level === 'error')).toBe(true)
    expect(parseEvidence(stack.kind, stack.content)[0].message).toMatch(/^TimeoutError/)
  })
})
