import type { Evidence, Incident, TimelineEvent } from './incident-types'

export interface DemoIncident {
  incident: Incident
  evidence: Omit<Evidence, 'incidentId'>[]
  milestones: Omit<TimelineEvent, 'incidentId'>[]
}

function prng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const iso = (ms: number) => new Date(ms).toISOString()

/**
 * A checkout outage caused by a deploy that shrank the database connection
 * pool, with realistic noise: an unrelated cache warning and a few payment
 * provider 429s that contradict the obvious "upstream" story.
 */
export function buildDemoIncident(now = Date.now()): DemoIncident {
  const rand = prng(20260928)
  const minute = 60_000
  const t0 = Math.floor((now - 55 * minute) / 1000) * 1000
  const deployAt = t0 + 8 * minute
  const firstErrorAt = deployAt + 3 * minute + 12_000
  const mitigatedAt = firstErrorAt + 24 * minute
  const startedAt = firstErrorAt + 2 * minute

  const appLog: string[] = []
  const lbEvents: Record<string, unknown>[] = []
  const requestId = () => Math.floor(rand() * 0xffffffff).toString(16).padStart(8, '0')

  for (let t = t0; t < t0 + 50 * minute; t += 20_000 + Math.floor(rand() * 15_000)) {
    const degraded = t >= firstErrorAt && t < mitigatedAt
    const baseLatency = 70 + Math.floor(rand() * 40)
    const latency = degraded ? 1800 + Math.floor(rand() * 3600) : baseLatency
    const status = degraded && rand() < 0.55 ? 503 : 200

    if (degraded && rand() < 0.8) {
      const active = 10
      appLog.push(
        `${iso(t)} ERROR [checkout-api] DB connection pool timeout: could not acquire connection after 5000ms (pool=orders-primary active=${active}/${active} waiting=${40 + Math.floor(rand() * 80)}) req=${requestId()}`,
      )
    }
    appLog.push(
      `${iso(t + 150)} ${status >= 500 ? 'WARN ' : 'INFO '} [checkout-api] POST /v1/checkout ${status} latency=${latency}ms req=${requestId()}`,
    )
    lbEvents.push({
      timestamp: iso(t + 200),
      service: 'edge-lb',
      level: status >= 500 ? 'error' : 'info',
      message: `upstream checkout-api responded ${status}`,
      status,
      latency_ms: latency + 12,
    })
    if (rand() < 0.08) {
      appLog.push(`${iso(t + 400)} WARN  [checkout-api] cache hit ratio 71% below target 80% (catalog-cache)`)
    }
    if (degraded && rand() < 0.12) {
      appLog.push(`${iso(t + 600)} WARN  [checkout-api] payment-gateway responded 429 Too Many Requests, retrying in 200ms`)
    }
  }

  appLog.push(`${iso(deployAt)} INFO  [deployer] deployed checkout-api v2.14.0 (config: db.pool.max 50 -> 10, orders query batching enabled)`)
  appLog.push(`${iso(mitigatedAt - 60_000)} INFO  [deployer] rolled back checkout-api to v2.13.4`)
  appLog.sort()

  const stack = [
    `${iso(firstErrorAt + 5_000)} ERROR [checkout-api] Unhandled rejection in POST /v1/checkout`,
    'TimeoutError: Timed out while waiting for an open slot in the pool (orders-primary, max=10)',
    '    at Pool._acquire (/app/node_modules/pg-pool/index.js:171:17)',
    '    at async OrdersRepository.reserveInventory (/app/src/orders/repository.ts:88:20)',
    '    at async CheckoutService.placeOrder (/app/src/checkout/service.ts:142:5)',
    '    at async /app/src/http/routes/checkout.ts:37:22',
  ].join('\n')

  return {
    incident: {
      title: 'Checkout API returning 503s after v2.14.0 deploy',
      severity: 'SEV2',
      service: 'checkout-api',
      description:
        'PagerDuty alert "checkout-api 5xx > 5%" fired. Customers report checkout spinning and failing at the payment step. Support has ~40 tickets.',
      startedAt: iso(startedAt),
      status: 'investigating',
      analysisStatus: 'idle',
    },
    evidence: [
      { kind: 'log', label: 'checkout-api pod logs', service: 'checkout-api', content: appLog.join('\n') },
      { kind: 'json', label: 'edge load balancer events', service: 'edge-lb', content: JSON.stringify(lbEvents, null, 1) },
      { kind: 'stacktrace', label: 'Sentry: unhandled TimeoutError', service: 'checkout-api', content: stack },
    ],
    milestones: [
      {
        at: iso(startedAt + 3 * minute),
        title: 'Incident declared, on-call paged',
        detail: 'Alert: checkout-api 5xx rate 38% over 5 minutes',
        kind: 'milestone',
        source: 'user',
      },
    ],
  }
}
