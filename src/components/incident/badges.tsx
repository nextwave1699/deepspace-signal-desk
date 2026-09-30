import { cn } from '@/lib/utils'
import type { Confidence, HypothesisStatus, IncidentStatus, Severity } from '@/lib/incident-types'

const SEVERITY_STYLES: Record<Severity, string> = {
  SEV1: 'bg-[#f0564a]/15 text-[#ff8a80] ring-[#f0564a]/40',
  SEV2: 'bg-[#f59e0b]/15 text-[#fbbf5a] ring-[#f59e0b]/40',
  SEV3: 'bg-[#eab308]/10 text-[#e5d06a] ring-[#eab308]/30',
  SEV4: 'bg-[#64748b]/15 text-[#a8b3c2] ring-[#64748b]/40',
}

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-medium ring-1 ring-inset',
        SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.SEV4,
        className,
      )}
    >
      {severity}
    </span>
  )
}

const STATUS_STYLES: Record<IncidentStatus, { dot: string; label: string }> = {
  investigating: { dot: 'bg-[#f0564a] animate-pulse', label: 'Investigating' },
  identified: { dot: 'bg-[#f59e0b]', label: 'Identified' },
  monitoring: { dot: 'bg-[#60a5fa]', label: 'Monitoring' },
  resolved: { dot: 'bg-[#34d399]', label: 'Resolved' },
}

export function StatusPill({ status, className }: { status: IncidentStatus; className?: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.investigating
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <span className={cn('size-1.5 rounded-full', style.dot)} aria-hidden />
      {style.label}
    </span>
  )
}

export function statusLabel(status: IncidentStatus): string {
  return STATUS_STYLES[status]?.label ?? status
}

const CONFIDENCE_STYLES: Record<Confidence, { bars: number; className: string }> = {
  low: { bars: 1, className: 'text-[#fbbf5a]' },
  medium: { bars: 2, className: 'text-[#7dd3fc]' },
  high: { bars: 3, className: 'text-primary' },
}

export function ConfidenceMeter({ confidence, className }: { confidence: Confidence; className?: string }) {
  const style = CONFIDENCE_STYLES[confidence] ?? CONFIDENCE_STYLES.low
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs font-medium capitalize', style.className, className)}
      title={`${confidence} confidence`}
    >
      <span className="flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={cn('w-1 rounded-sm', n <= style.bars ? 'bg-current' : 'bg-muted-foreground/25')}
            style={{ height: 4 + n * 3 }}
          />
        ))}
      </span>
      {confidence}
    </span>
  )
}

const HYPOTHESIS_STYLES: Record<HypothesisStatus, string> = {
  open: 'border-border text-muted-foreground',
  investigating: 'border-[#60a5fa]/50 text-[#93c5fd]',
  confirmed: 'border-[#34d399]/50 text-[#6ee7b7]',
  rejected: 'border-border text-muted-foreground/70 line-through',
}

export function HypothesisStatusTag({ status }: { status: HypothesisStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium capitalize',
        HYPOTHESIS_STYLES[status],
      )}
    >
      {status}
    </span>
  )
}
