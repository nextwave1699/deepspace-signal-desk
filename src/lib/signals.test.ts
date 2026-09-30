import { describe, expect, it } from 'vitest'
import {
  bucketize,
  detectEvidenceKind,
  extractSignals,
  parseCsvEvents,
  parseEvidenceSources,
  parseJsonEvents,
  parseStackTrace,
  parseTextLog,
  parseTimestamp,
  signatureOf,
  summarizeEntries,
} from './signals'

const APP_LOG = `2026-09-28T14:30:02.118Z INFO  [checkout-api] GET /cart 200 latency=84ms
2026-09-28T14:31:10.004Z INFO  [checkout-api] GET /cart 200 latency=92ms
2026-09-28T14:32:07.550Z ERROR [checkout-api] DB connection timeout after 5000ms (pool=primary, active=50/50)
    at Pool.acquire (pool.js:212:11)
    at async CartRepo.load (cart.js:40:5)
2026-09-28T14:32:09.901Z WARN  [checkout-api] retrying request 7f3a9c2e-1b4d-4c8e-9a1f-2d3e4f5a6b7c
2026-09-28T14:32:11.310Z ERROR [checkout-api] DB connection timeout after 5000ms (pool=primary, active=50/50)
2026-09-28T14:32:30.000Z INFO  [checkout-api] GET /cart 503 latency=5120ms`

describe('parseTimestamp', () => {
  it('reads ISO stamps and treats zone-less stamps as UTC', () => {
    expect(parseTimestamp('2026-09-28 14:32:07 ERROR x')?.iso).toBe('2026-09-28T14:32:07.000Z')
    expect(parseTimestamp('2026-09-28T14:32:07+02:00 x')?.iso).toBe('2026-09-28T12:32:07.000Z')
  })

  it('anchors time-only stamps to the reference date', () => {
    expect(parseTimestamp('14:32:07 ERROR x', '2026-09-28T10:00:00Z')?.iso).toBe('2026-09-28T14:32:07.000Z')
    expect(parseTimestamp('14:32:07 ERROR x')).toBeNull()
  })
})

describe('parseTextLog', () => {
  const entries = parseTextLog(APP_LOG)

  it('parses one entry per log line and folds stack frames into the previous entry', () => {
    expect(entries).toHaveLength(6)
    expect(entries[2].raw).toContain('Pool.acquire')
  })

  it('extracts level, service, message and latency', () => {
    expect(entries[2]).toMatchObject({
      level: 'error',
      service: 'checkout-api',
      timestamp: '2026-09-28T14:32:07.550Z',
    })
    expect(entries[2].message).toMatch(/^DB connection timeout/)
    expect(entries[0].latencyMs).toBe(84)
    expect(entries[5].latencyMs).toBe(5120)
  })

  it('infers error level from wording when no level token is present', () => {
    const [entry] = parseTextLog('upstream connection refused by 10.0.0.12:5432')
    expect(entry.level).toBe('error')
  })
})

describe('structured evidence', () => {
  it('parses a JSON array with common field names', () => {
    const entries = parseJsonEvents(
      JSON.stringify([
        { '@timestamp': '2026-09-28T14:32:00Z', severity: 'ERROR', service: 'payments', msg: 'card declined', duration_ms: 812 },
        { time: 1790606000, level: 'info', message: 'ok' },
      ]),
    )
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ level: 'error', service: 'payments', message: 'card declined', latencyMs: 812 })
    expect(entries[1].timestamp).toBe(new Date(1790606000 * 1000).toISOString())
  })

  it('parses newline-delimited JSON and nested event arrays', () => {
    expect(parseJsonEvents('{"level":"warn","msg":"a"}\n{"level":"error","msg":"b"}')).toHaveLength(2)
    expect(parseJsonEvents('{"events":[{"msg":"a"},{"msg":"b"},{"msg":"c"}]}')).toHaveLength(3)
  })

  it('parses CSV with quoted fields', () => {
    const entries = parseCsvEvents(
      'timestamp,level,service,message\n2026-09-28T14:32:00Z,error,api,"timeout, retrying ""primary"""\n',
    )
    expect(entries).toHaveLength(1)
    expect(entries[0].message).toBe('timeout, retrying "primary"')
    expect(entries[0].level).toBe('error')
  })

  it('treats a stack trace as a single error headed by its exception', () => {
    const [entry] = parseStackTrace(
      'java.lang.IllegalStateException: Pool exhausted\n\tat com.acme.Pool.get(Pool.java:88)\n\tat com.acme.Api.handle(Api.java:12)',
    )
    expect(entry.level).toBe('error')
    expect(entry.message).toBe('java.lang.IllegalStateException: Pool exhausted')
  })
})

describe('detectEvidenceKind', () => {
  it('recognises each supported format', () => {
    expect(detectEvidenceKind('[{"a":1}]')).toBe('json')
    expect(detectEvidenceKind('time,level,message\n1,error,x')).toBe('csv')
    expect(detectEvidenceKind('x', 'events.csv')).toBe('csv')
    expect(detectEvidenceKind('Error: boom\n    at a (a.js:1)\n    at b (b.js:2)')).toBe('stacktrace')
    expect(detectEvidenceKind(APP_LOG)).toBe('log')
  })
})

describe('signals', () => {
  it('normalises volatile tokens so repeated errors share a signature', () => {
    expect(signatureOf('user 1234 failed after 5000ms from 10.1.2.3')).toBe(
      signatureOf('user 98 failed after 300ms from 10.9.9.9'),
    )
  })

  it('groups warn+ entries into ranked signals', () => {
    const signals = extractSignals(parseTextLog(APP_LOG))
    expect(signals[0]).toMatchObject({ level: 'error', count: 2, services: ['checkout-api'] })
    expect(signals[0].firstSeen).toBe('2026-09-28T14:32:07.550Z')
    expect(signals[0].lastSeen).toBe('2026-09-28T14:32:11.310Z')
    expect(signals).toHaveLength(2)
  })

  it('summarises levels, window, first error and the latency shift', () => {
    const summary = summarizeEntries(parseTextLog(APP_LOG))
    expect(summary.byLevel).toMatchObject({ error: 2, warn: 1, info: 3 })
    expect(summary.firstError?.timestamp).toBe('2026-09-28T14:32:07.550Z')
    expect(summary.window).toEqual({ start: '2026-09-28T14:30:02.118Z', end: '2026-09-28T14:32:30.000Z' })
    expect(summary.latency).toMatchObject({ baselineMs: 88, peakMs: 5120 })
    expect(summary.latency?.ratio).toBeGreaterThan(50)
  })

  it('buckets entries over time with error counts', () => {
    const buckets = bucketize(parseTextLog(APP_LOG), 10)
    expect(buckets).toHaveLength(10)
    expect(buckets.reduce((n, b) => n + b.total, 0)).toBe(6)
    expect(buckets.reduce((n, b) => n + b.errors, 0)).toBe(2)
  })

  it('tags entries with the evidence they came from', () => {
    const entries = parseEvidenceSources([
      { id: 'ev1', kind: 'log', label: 'api.log', service: 'fallback-svc', content: 'ERROR boom' },
    ])
    expect(entries[0]).toMatchObject({ evidenceId: 'ev1', evidenceLabel: 'api.log', service: 'fallback-svc' })
  })
})
