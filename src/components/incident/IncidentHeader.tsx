import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthProfileReady, useMutations, type RecordData } from 'deepspace'
import { ArrowLeft, Clock, MoreHorizontal, Server, Trash2 } from 'lucide-react'
import {
  Button,
  ConfirmModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from '@/components/ui'
import { callAction } from '@/lib/actions-client'
import { formatDateTime, formatDuration } from '@/lib/format'
import { INCIDENT_STATUSES, type Incident, type IncidentStatus } from '@/lib/incident-types'
import { SeverityBadge, StatusPill, statusLabel } from './badges'

export function IncidentHeader({ incident }: { incident: RecordData<Incident> }) {
  const { ready, put } = useMutations<Incident>('incidents')
  const { data } = incident
  const endedAt = data.status === 'resolved' && data.resolvedAt ? data.resolvedAt : new Date().toISOString()

  const changeStatus = (next: IncidentStatus) => {
    if (next === data.status) return
    put(incident.recordId, {
      status: next,
      resolvedAt: next === 'resolved' ? new Date().toISOString() : '',
    })
  }

  return (
    <header className="border-b border-border bg-card/40">
      <div className="mx-auto max-w-6xl px-4 pb-4 pt-5 sm:px-6">
        <Link
          to="/home"
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          All incidents
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <SeverityBadge severity={data.severity} />
              <StatusPill status={data.status} />
            </div>
            <h1 className="mt-2 text-xl font-semibold tracking-tight" data-testid="incident-title">
              {data.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {data.service && (
                <span className="inline-flex items-center gap-1 font-mono">
                  <Server className="size-3.5" aria-hidden />
                  {data.service}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden />
                Started {formatDateTime(data.startedAt)}
              </span>
              <span>
                {data.status === 'resolved' ? 'Lasted' : 'Open for'}{' '}
                {formatDuration(data.startedAt, endedAt)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-44">
              <Select value={data.status} onValueChange={(v) => changeStatus(v as IncidentStatus)} disabled={!ready}>
                <SelectTrigger aria-label="Incident status" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INCIDENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <IncidentMenu incident={incident} />
          </div>
        </div>
      </div>
    </header>
  )
}

function IncidentMenu({ incident }: { incident: RecordData<Incident> }) {
  const { user } = useAuthProfileReady({ requireUser: true })
  const navigate = useNavigate()
  const { error, success } = useToast()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const canDelete = !!user && (user.id === incident.createdBy || user.role === 'admin')
  if (!canDelete) return null

  const destroy = async () => {
    setDeleting(true)
    try {
      await callAction('deleteIncident', { incidentId: incident.recordId })
      success('Incident deleted')
      navigate('/home')
    } catch (err) {
      error('Could not delete the incident', err instanceof Error ? err.message : String(err))
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" className="size-9" aria-label="Incident actions">
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setConfirming(true)} className="text-[#ff8a80]">
            <Trash2 aria-hidden />
            Delete incident
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmModal
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={destroy}
        loading={deleting}
        title="Delete this incident?"
        description="The incident, its evidence, hypotheses, notes, timeline and conversation are permanently removed for everyone."
        confirmText="Delete incident"
      />
    </>
  )
}
