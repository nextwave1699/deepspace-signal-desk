import type { EvidenceKind } from './incident-types'

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug'

export const LOG_LEVELS: LogLevel[] = ['fatal', 'error', 'warn', 'info', 'debug']

export const LEVEL_RANK: Record<LogLevel, number> = { fatal: 4, error: 3, warn: 2, info: 1, debug: 0 }

export interface LogEntry {
  line: number
  timestamp: string | null
  level: LogLevel
  service: string | null
  message: string
  raw: string
  latencyMs: number | null
  evidenceId?: string
  evidenceLabel?: string
}

export interface ParseOptions {
  defaultService?: string
  /** ISO date used to anchor time-only stamps such as `14:32:07`. */
  referenceDate?: string
}

export interface EvidenceSource {
  id: string
  kind: EvidenceKind
  label: string
  service: string
  content: string
}

const ISO_RE =
  /(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:[.,](\d{1,9}))?\s?(Z|[+-]\d{2}:?\d{2}|UTC)?/
const TIME_ONLY_RE = /\b(\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,6}))?\b/
const LEVEL_RE =
  /\b(FATAL|CRIT(?:ICAL)?|EMERG(?:ENCY)?|PANIC|ERROR|ERR|SEVERE|WARN(?:ING)?|INFO|NOTICE|DEBUG|TRACE)\b/i
const SERVICE_KV_RE = /\b(?:service|svc|app|component)[=:]\s*"?([\w./-]+)/i
const BRACKET_RE = /\[([A-Za-z][\w.-]*[A-Za-z0-9])\]/g
const LATENCY_RE =
  /\b(?:latency|duration|took|elapsed|response[_ ]?time|p99|p95|rt)(?:_ms)?["']?\s*[=:]?\s*(\d+(?:\.\d+)?)\s*(ms|s)?\b/i
const IN_MS_RE = /\bin (\d+(?:\.\d+)?)\s*(ms|s)\b/i
const ERROR_WORDS_RE =
  /\b(exception|error|failed|failure|fatal|timeout|timed out|refused|panic|traceback|unavailable|denied|crash(?:ed)?|oom|killed)\b/i
const CONTINUATION_RE = /^(\s+at\s|\s+\.\.\.\s*\d+ more|\s*Caused by:|\s+File "|\s{2,}\S|\t)/

const LEVEL_WORDS = new Set([
  'fatal', 'crit', 'critical', 'emerg', 'emergency', 'panic', 'error', 'err', 'severe',
  'warn', 'warning', 'info', 'notice', 'debug', 'trace',
])

export function normalizeLevel(value: string | null | undefined): LogLevel | null {
  if (!value) return null
  const v = String(value).trim().toLowerCase()
  if (['fatal', 'crit', 'critical', 'emerg', 'emergency', 'panic', 'alert'].includes(v)) return 'fatal'
  if (['error', 'err', 'severe', 'e'].includes(v)) return 'error'
  if (['warn', 'warning', 'w'].includes(v)) return 'warn'
  if (['info', 'notice', 'information', 'i'].includes(v)) return 'info'
  if (['debug', 'trace', 'verbose', 'd'].includes(v)) return 'debug'
  const n = Number(v)
  if (Number.isFinite(n) && v !== '') {
    if (n >= 500) return 'error'
    if (n >= 400) return 'warn'
    return 'info'
  }
  return null
}

function toIso(datePart: string, timePart: string, fraction?: string, zone?: string): string | null {
  const ms = fraction ? `.${fraction.slice(0, 3).padEnd(3, '0')}` : ''
  let tz = zone && zone !== 'UTC' ? zone : 'Z'
  if (/^[+-]\d{4}$/.test(tz)) tz = `${tz.slice(0, 3)}:${tz.slice(3)}`
  const d = new Date(`${datePart}T${timePart}${ms}${tz}`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Finds the first timestamp in a line. Stamps without a zone are read as UTC,
 * which is what nearly every server and cloud log emits.
 */
export function parseTimestamp(text: string, referenceDate?: string): { iso: string; match: string } | null {
  const iso = ISO_RE.exec(text)
  if (iso) {
    const value = toIso(iso[1], iso[2], iso[3], iso[4])
    if (value) return { iso: value, match: iso[0] }
  }
  if (referenceDate) {
    const t = TIME_ONLY_RE.exec(text)
    const ref = new Date(referenceDate)
    if (t && !Number.isNaN(ref.getTime())) {
      const datePart = ref.toISOString().slice(0, 10)
      const value = toIso(datePart, `${t[1]}:${t[2]}:${t[3]}`, t[4])
      if (value) return { iso: value, match: t[0] }
    }
  }
  return null
}

export function coerceTimestamp(value: unknown, referenceDate?: string): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'number' || /^\d{10,13}(\.\d+)?$/.test(String(value))) {
    const n = Number(value)
    const ms = n > 1e12 ? n : n * 1000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const parsed = parseTimestamp(String(value), referenceDate)
  if (parsed) return parsed.iso
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function extractLatency(text: string): number | null {
  const m = LATENCY_RE.exec(text) ?? IN_MS_RE.exec(text)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  return m[2]?.toLowerCase() === 's' ? n * 1000 : n
}

function extractService(text: string): { service: string; match: string } | null {
  const kv = SERVICE_KV_RE.exec(text)
  if (kv) return { service: kv[1], match: '' }
  for (const m of text.matchAll(BRACKET_RE)) {
    if (!LEVEL_WORDS.has(m[1].toLowerCase())) return { service: m[1], match: m[0] }
  }
  return null
}

function inferLevel(message: string, fallback: LogLevel): LogLevel {
  return ERROR_WORDS_RE.test(message) ? 'error' : fallback
}

function parseTextLine(raw: string, line: number, options: ParseOptions, fallbackLevel: LogLevel): LogEntry {
  let rest = raw
  const ts = parseTimestamp(raw, options.referenceDate)
  if (ts) rest = rest.replace(ts.match, ' ')

  let level: LogLevel | null = null
  const lvl = LEVEL_RE.exec(rest)
  if (lvl) {
    level = normalizeLevel(lvl[1])
    rest = rest.replace(lvl[0], ' ')
  }

  const svc = extractService(rest)
  if (svc?.match) rest = rest.replace(svc.match, ' ')

  const message = rest
    .replace(/\blevel[=:]\s*/i, '')
    .replace(/^[\s\-|:[\]]+/, '')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    line,
    timestamp: ts?.iso ?? null,
    level: level ?? inferLevel(message, fallbackLevel),
    service: svc?.service ?? options.defaultService ?? null,
    message: message || raw.trim(),
    raw,
    latencyMs: extractLatency(raw),
  }
}

export function parseTextLog(content: string, options: ParseOptions = {}, fallbackLevel: LogLevel = 'info'): LogEntry[] {
  const entries: LogEntry[] = []
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  lines.forEach((raw, i) => {
    if (!raw.trim()) return
    const prev = entries[entries.length - 1]
    const isContinuation =
      prev && CONTINUATION_RE.test(raw) && !parseTimestamp(raw.trim().slice(0, 40), options.referenceDate)
    if (isContinuation) {
      prev.raw += `\n${raw}`
      if (/Caused by:/.test(raw) && LEVEL_RANK[prev.level] < LEVEL_RANK.error) prev.level = 'error'
      return
    }
    entries.push(parseTextLine(raw, i + 1, options, fallbackLevel))
  })
  return entries
}

function pickField(obj: Record<string, unknown>, names: string[]): unknown {
  const keys = Object.keys(obj)
  for (const name of names) {
    const key = keys.find((k) => k.toLowerCase() === name)
    if (key !== undefined && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key]
  }
  return undefined
}

const TIME_FIELDS = ['timestamp', '@timestamp', 'time', 'ts', 'datetime', 'date', 'eventtime', 'event_time', 'created_at']
const LEVEL_FIELDS = ['level', 'severity', 'lvl', 'loglevel', 'log_level', 'status', 'status_code']
const SERVICE_FIELDS = ['service', 'service_name', 'app', 'application', 'component', 'source', 'logger', 'host']
const MESSAGE_FIELDS = ['message', 'msg', 'error', 'err', 'event', 'description', 'text', 'log']
const LATENCY_FIELD_RE = /latency|duration|elapsed|response_?time|took/i

export function parseStructuredRecord(
  obj: Record<string, unknown>,
  line: number,
  options: ParseOptions,
): LogEntry {
  const rawMessage = pickField(obj, MESSAGE_FIELDS)
  const message =
    typeof rawMessage === 'string'
      ? rawMessage
      : rawMessage !== undefined
        ? JSON.stringify(rawMessage)
        : JSON.stringify(obj).slice(0, 300)

  let latencyMs: number | null = null
  for (const [key, value] of Object.entries(obj)) {
    if (LATENCY_FIELD_RE.test(key) && Number.isFinite(Number(value))) {
      const n = Number(value)
      latencyMs = /(^|_)s(ec)?$/i.test(key) ? n * 1000 : n
      break
    }
  }

  const service = pickField(obj, SERVICE_FIELDS)
  const level = normalizeLevel(pickField(obj, LEVEL_FIELDS) as string | undefined)
  return {
    line,
    timestamp: coerceTimestamp(pickField(obj, TIME_FIELDS), options.referenceDate),
    level: level ?? inferLevel(message, 'info'),
    service: service !== undefined ? String(service) : options.defaultService ?? null,
    message,
    raw: JSON.stringify(obj),
    latencyMs: latencyMs ?? extractLatency(message),
  }
}

function asRecordArray(value: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(value)) return value.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    for (const key of ['events', 'logs', 'records', 'data', 'items', 'entries', 'results']) {
      if (Array.isArray(obj[key])) return asRecordArray(obj[key])
    }
    return [obj]
  }
  return null
}

export function parseJsonEvents(content: string, options: ParseOptions = {}): LogEntry[] {
  const trimmed = content.trim()
  if (!trimmed) return []
  try {
    const records = asRecordArray(JSON.parse(trimmed))
    if (records) return records.map((r, i) => parseStructuredRecord(r, i + 1, options))
  } catch {
    // Not a single JSON document; fall through to newline-delimited JSON.
  }
  const entries: LogEntry[] = []
  trimmed.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return
    try {
      const parsed = JSON.parse(line)
      if (parsed && typeof parsed === 'object') {
        entries.push(parseStructuredRecord(parsed as Record<string, unknown>, i + 1, options))
        return
      }
    } catch {
      // A non-JSON line inside NDJSON is kept as plain text below.
    }
    entries.push(parseTextLine(line, i + 1, options, 'info'))
  })
  return entries
}

export function parseCsvRows(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const text = content.replace(/\r\n?/g, '\n')
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  return rows
}

export function parseCsvEvents(content: string, options: ParseOptions = {}): LogEntry[] {
  const [header, ...rows] = parseCsvRows(content)
  if (!header) return []
  const keys = header.map((h) => h.trim())
  return rows.map((cells, i) => {
    const obj: Record<string, unknown> = {}
    keys.forEach((k, j) => {
      obj[k] = cells[j]?.trim() ?? ''
    })
    return parseStructuredRecord(obj, i + 2, options)
  })
}

export function parseStackTrace(content: string, options: ParseOptions = {}): LogEntry[] {
  const text = content.replace(/\r\n?/g, '\n').trim()
  if (!text) return []
  const lines = text.split('\n')
  const headline =
    lines.find((l) => /(Exception|Error|panic|Traceback)/.test(l) && !/^\s+at\s/.test(l))?.trim() ??
    lines[0].trim()
  const ts = parseTimestamp(text, options.referenceDate)
  return [
    {
      line: 1,
      timestamp: ts?.iso ?? null,
      level: 'error',
      service: extractService(text)?.service ?? options.defaultService ?? null,
      message: headline.replace(ts?.match ?? '', '').trim(),
      raw: text,
      latencyMs: null,
    },
  ]
}

export function parseEvidence(kind: EvidenceKind, content: string, options: ParseOptions = {}): LogEntry[] {
  switch (kind) {
    case 'json':
      return parseJsonEvents(content, options)
    case 'csv':
      return parseCsvEvents(content, options)
    case 'stacktrace':
      return parseStackTrace(content, options)
    case 'error':
      return parseTextLog(content, options, 'error')
    default:
      return parseTextLog(content, options, 'info')
  }
}

export function parseEvidenceSources(sources: EvidenceSource[], referenceDate?: string): LogEntry[] {
  return sources.flatMap((source) =>
    parseEvidence(source.kind, source.content, {
      defaultService: source.service || undefined,
      referenceDate,
    }).map((entry) => ({ ...entry, evidenceId: source.id, evidenceLabel: source.label })),
  )
}

export function detectEvidenceKind(content: string, fileName = ''): EvidenceKind {
  const name = fileName.toLowerCase()
  if (name.endsWith('.csv')) return 'csv'
  if (name.endsWith('.json') || name.endsWith('.ndjson') || name.endsWith('.jsonl')) return 'json'
  const text = content.trim()
  if (/^[[{]/.test(text)) return 'json'
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  if (firstLine.includes(',') && /time|timestamp|level|message|service/i.test(firstLine) && !ISO_RE.test(firstLine)) {
    return 'csv'
  }
  const lines = text.split(/\r?\n/)
  const frames = lines.filter((l) => /^\s+at\s|^\s+File "/.test(l)).length
  if (frames >= 2 && frames >= lines.length / 3) return 'stacktrace'
  return 'log'
}

export function signatureOf(message: string): string {
  return message
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '<ip>')
    .replace(/\b0x[0-9a-f]+\b/gi, '<hex>')
    .replace(/"[^"]*"|'[^']*'/g, '<str>')
    .replace(/\b\d+(?:\.\d+)?(?:ms|s|%|kb|mb|gb)?\b/gi, '<n>')
    .replace(/\b(?=[\w-]*\d)[\w-]{6,}\b/g, '<id>')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

export interface Signal {
  signature: string
  level: LogLevel
  count: number
  firstSeen: string | null
  lastSeen: string | null
  services: string[]
  sample: string
}

export function extractSignals(entries: LogEntry[], minLevel: LogLevel = 'warn'): Signal[] {
  const groups = new Map<string, Signal>()
  for (const entry of entries) {
    if (LEVEL_RANK[entry.level] < LEVEL_RANK[minLevel]) continue
    const signature = signatureOf(entry.message)
    const key = `${LEVEL_RANK[entry.level] >= LEVEL_RANK.error ? 'error' : entry.level}|${signature}`
    let group = groups.get(key)
    if (!group) {
      group = {
        signature,
        level: entry.level,
        count: 0,
        firstSeen: null,
        lastSeen: null,
        services: [],
        sample: entry.message,
      }
      groups.set(key, group)
    }
    group.count++
    if (LEVEL_RANK[entry.level] > LEVEL_RANK[group.level]) group.level = entry.level
    if (entry.service && !group.services.includes(entry.service)) group.services.push(entry.service)
    if (entry.timestamp) {
      if (!group.firstSeen || entry.timestamp < group.firstSeen) group.firstSeen = entry.timestamp
      if (!group.lastSeen || entry.timestamp > group.lastSeen) group.lastSeen = entry.timestamp
    }
  }
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || LEVEL_RANK[b.level] - LEVEL_RANK[a.level],
  )
}

export interface LatencyShift {
  baselineMs: number
  peakMs: number
  ratio: number
  peakAt: string | null
  samples: number
}

export interface EvidenceSummary {
  total: number
  byLevel: Record<LogLevel, number>
  services: string[]
  firstError: LogEntry | null
  window: { start: string; end: string } | null
  latency: LatencyShift | null
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function detectLatencyShift(entries: LogEntry[], firstErrorAt: string | null): LatencyShift | null {
  const samples = entries
    .filter((e): e is LogEntry & { latencyMs: number } => e.latencyMs !== null)
    .sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''))
  if (samples.length < 3) return null
  let baselinePool = firstErrorAt ? samples.filter((s) => s.timestamp && s.timestamp < firstErrorAt) : []
  if (baselinePool.length < 2) baselinePool = samples.slice(0, Math.max(1, Math.floor(samples.length / 3)))
  const baselineMs = median(baselinePool.map((s) => s.latencyMs))
  const peak = samples.reduce((max, s) => (s.latencyMs > max.latencyMs ? s : max), samples[0])
  if (baselineMs <= 0) return null
  return {
    baselineMs: Math.round(baselineMs),
    peakMs: Math.round(peak.latencyMs),
    ratio: Math.round((peak.latencyMs / baselineMs) * 10) / 10,
    peakAt: peak.timestamp,
    samples: samples.length,
  }
}

export function summarizeEntries(entries: LogEntry[]): EvidenceSummary {
  const byLevel: Record<LogLevel, number> = { fatal: 0, error: 0, warn: 0, info: 0, debug: 0 }
  const services = new Set<string>()
  let firstError: LogEntry | null = null
  let start: string | null = null
  let end: string | null = null
  for (const e of entries) {
    byLevel[e.level]++
    if (e.service) services.add(e.service)
    if (e.timestamp) {
      if (!start || e.timestamp < start) start = e.timestamp
      if (!end || e.timestamp > end) end = e.timestamp
    }
    if (LEVEL_RANK[e.level] >= LEVEL_RANK.error) {
      if (!firstError || (e.timestamp && (!firstError.timestamp || e.timestamp < firstError.timestamp))) {
        firstError = e
      }
    }
  }
  return {
    total: entries.length,
    byLevel,
    services: [...services].sort(),
    firstError,
    window: start && end ? { start, end } : null,
    latency: detectLatencyShift(entries, firstError?.timestamp ?? null),
  }
}

export interface Bucket {
  start: string
  end: string
  total: number
  errors: number
  warns: number
}

export function bucketize(entries: LogEntry[], bucketCount = 30): Bucket[] {
  const times = entries
    .filter((e) => e.timestamp)
    .map((e) => ({ t: new Date(e.timestamp as string).getTime(), level: e.level }))
  if (times.length === 0) return []
  const min = Math.min(...times.map((x) => x.t))
  const max = Math.max(...times.map((x) => x.t))
  const span = Math.max(max - min, 1000)
  const size = span / bucketCount
  const buckets: Bucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    start: new Date(min + i * size).toISOString(),
    end: new Date(min + (i + 1) * size).toISOString(),
    total: 0,
    errors: 0,
    warns: 0,
  }))
  for (const { t, level } of times) {
    const idx = Math.min(bucketCount - 1, Math.floor((t - min) / size))
    buckets[idx].total++
    if (LEVEL_RANK[level] >= LEVEL_RANK.error) buckets[idx].errors++
    else if (level === 'warn') buckets[idx].warns++
  }
  return buckets
}
