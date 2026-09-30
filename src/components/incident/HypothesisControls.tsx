import { useState, type FormEvent } from 'react'
import { useMutations, type RecordData } from 'deepspace'
import { Plus } from 'lucide-react'
import {
  Button,
  Input,
  Label,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Confidence, Hypothesis, HypothesisStatus, Incident, Note, TimelineEvent } from '@/lib/incident-types'

const ACTIONS: { status: HypothesisStatus; label: string; active: string }[] = [
  { status: 'investigating', label: 'Investigating', active: 'border-[#60a5fa]/60 bg-[#60a5fa]/15 text-[#93c5fd]' },
  { status: 'confirmed', label: 'Confirm', active: 'border-[#34d399]/60 bg-[#34d399]/15 text-[#6ee7b7]' },
  { status: 'rejected', label: 'Reject', active: 'border-border bg-secondary text-muted-foreground' },
]

export function HypothesisControls({
  incident,
  hypothesis,
  notes,
}: {
  incident: RecordData<Incident>
  hypothesis: RecordData<Hypothesis>
  notes: RecordData<Note>[]
}) {
  const hypotheses = useMutations<Hypothesis>('hypotheses')
  const incidents = useMutations<Incident>('incidents')
  const timeline = useMutations<TimelineEvent>('timeline-events')
  const current = hypothesis.data.status

  const setStatus = (status: HypothesisStatus) => {
    const next = current === status ? 'open' : status
    hypotheses.put(hypothesis.recordId, { status: next })
    if (next === 'confirmed') {
      timeline.create({
        incidentId: incident.recordId,
        at: new Date().toISOString(),
        title: `Root cause confirmed: ${hypothesis.data.title}`,
        detail: '',
        kind: 'milestone',
        source: 'user',
      })
      if (incident.data.status === 'investigating') {
        incidents.put(incident.recordId, { status: 'identified' })
      }
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Review ${hypothesis.data.title}`}>
        {ACTIONS.map((a) => (
          <button
            key={a.status}
            type="button"
            disabled={!hypotheses.ready}
            aria-pressed={current === a.status}
            onClick={() => setStatus(a.status)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
              current === a.status ? a.active : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {a.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {hypothesis.data.source === 'ai' ? 'Suggested by AI' : 'Added by team'}
        </span>
      </div>
      {notes.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {notes.slice(-3).map((n) => (
            <li key={n.recordId} className="rounded-md bg-background px-2.5 py-1.5 text-xs text-muted-foreground">
              {n.data.body}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function AddHypothesisButton({ incidentId }: { incidentId: string }) {
  const { ready, create } = useMutations<Hypothesis>('hypotheses')
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [rationale, setRationale] = useState('')
  const [confidence, setConfidence] = useState<Confidence>('low')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    create({
      incidentId,
      title: title.trim(),
      rationale: rationale.trim(),
      supporting: [],
      contradicting: [],
      nextSteps: [],
      confidence,
      status: 'investigating',
      source: 'user',
    })
    setTitle('')
    setRationale('')
    setConfidence('low')
    setOpen(false)
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} disabled={!ready}>
        <Plus aria-hidden />
        Add hypothesis
      </Button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <Modal.Header>
            <Modal.Title>Add a hypothesis</Modal.Title>
            <Modal.Description>Track a theory the team wants to test alongside the AI's suggestions.</Modal.Description>
          </Modal.Header>
          <Modal.Body className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="hypothesis-title">Hypothesis</Label>
              <Input
                id="hypothesis-title"
                autoFocus
                placeholder="Cache stampede after the redis failover"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hypothesis-rationale">Why we think so</Label>
              <Textarea id="hypothesis-rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Confidence</Label>
              <Select value={confidence} onValueChange={(v) => setConfidence(v as Confidence)}>
                <SelectTrigger aria-label="Confidence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              Add hypothesis
            </Button>
          </Modal.Footer>
        </form>
      </Modal>
    </>
  )
}
