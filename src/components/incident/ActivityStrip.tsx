import { useMemo, useState } from 'react'
import { formatTime } from '@/lib/format'
import { bucketize, type LogEntry } from '@/lib/signals'

const COLORS = {
  errors: '#f0564a',
  warns: '#f5a524',
  other: '#3a4656',
}

interface Marker {
  at: string
  label: string
}

export function ActivityStrip({ entries, markers = [] }: { entries: LogEntry[]; markers?: Marker[] }) {
  const buckets = useMemo(() => bucketize(entries, 40), [entries])
  const [hover, setHover] = useState<number | null>(null)

  if (buckets.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
        Add timestamped evidence to see error activity over time.
      </p>
    )
  }

  const max = Math.max(...buckets.map((b) => b.total), 1)
  const start = new Date(buckets[0].start).getTime()
  const end = new Date(buckets[buckets.length - 1].end).getTime()
  const span = Math.max(end - start, 1)
  const active = hover !== null ? buckets[hover] : null

  return (
    <figure className="rounded-lg border border-border bg-card p-4">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">Log activity</span>
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          <LegendSwatch color={COLORS.errors} label="Errors" />
          <LegendSwatch color={COLORS.warns} label="Warnings" />
          <LegendSwatch color={COLORS.other} label="Other" />
        </span>
      </figcaption>
      <div className="relative">
        <div className="flex h-28 items-end gap-0.5" onMouseLeave={() => setHover(null)} role="img"
          aria-label={`Log activity from ${formatTime(buckets[0].start)} to ${formatTime(buckets[buckets.length - 1].end)}`}>
          {buckets.map((b, i) => {
            const other = b.total - b.errors - b.warns
            return (
              <div
                key={b.start}
                className="flex h-full flex-1 cursor-default flex-col justify-end"
                onMouseEnter={() => setHover(i)}
              >
                <div
                  className="flex flex-col justify-end gap-0.5 overflow-hidden rounded-t"
                  style={{ height: `${(b.total / max) * 100}%`, opacity: hover === null || hover === i ? 1 : 0.55 }}
                >
                  {b.errors > 0 && <div style={{ flexGrow: b.errors, background: COLORS.errors, minHeight: 2 }} />}
                  {b.warns > 0 && <div style={{ flexGrow: b.warns, background: COLORS.warns, minHeight: 2 }} />}
                  {other > 0 && <div style={{ flexGrow: other, background: COLORS.other, minHeight: 2 }} />}
                </div>
              </div>
            )
          })}
        </div>
        {markers.length > 0 && (
          <div className="relative mt-1 h-3">
            {markers.map((m) => {
              const pos = ((new Date(m.at).getTime() - start) / span) * 100
              if (pos < 0 || pos > 100) return null
              return (
                <span
                  key={`${m.at}-${m.label}`}
                  title={`${formatTime(m.at)} · ${m.label}`}
                  className="absolute top-0 h-3 w-0.5 -translate-x-1/2 rounded bg-primary"
                  style={{ left: `${pos}%` }}
                />
              )
            })}
          </div>
        )}
        {active && hover !== null && (
          <div
            className="pointer-events-none absolute -top-2 z-10 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={{ left: `${((hover + 0.5) / buckets.length) * 100}%`, transform: 'translate(-50%, -100%)' }}
          >
            <p className="font-mono text-muted-foreground">
              {formatTime(active.start)} – {formatTime(active.end)}
            </p>
            <p>
              <span className="font-medium">{active.errors}</span> errors ·{' '}
              <span className="font-medium">{active.warns}</span> warnings ·{' '}
              <span className="font-medium">{active.total}</span> total
            </p>
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[11px] text-muted-foreground">
        <span>{formatTime(buckets[0].start)}</span>
        <span>{formatTime(buckets[buckets.length - 1].end)}</span>
      </div>
    </figure>
  )
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm" style={{ background: color }} aria-hidden />
      {label}
    </span>
  )
}
