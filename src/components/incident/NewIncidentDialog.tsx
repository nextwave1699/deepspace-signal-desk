import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutations } from 'deepspace'
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
  useToast,
} from '@/components/ui'
import { fromLocalInputValue, toLocalInputValue } from '@/lib/format'
import { SEVERITIES, type Incident, type Severity } from '@/lib/incident-types'

const SEVERITY_HINTS: Record<Severity, string> = {
  SEV1: 'Critical — full outage or data loss',
  SEV2: 'Major — core feature degraded',
  SEV3: 'Minor — partial or internal impact',
  SEV4: 'Low — cosmetic or no customer impact',
}

export function NewIncidentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { ready, createConfirmed } = useMutations<Incident>('incidents')
  const { error } = useToast()
  const [title, setTitle] = useState('')
  const [severity, setSeverity] = useState<Severity>('SEV2')
  const [service, setService] = useState('')
  const [description, setDescription] = useState('')
  const [startedAt, setStartedAt] = useState(() => toLocalInputValue(new Date().toISOString()))
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setTitle('')
    setSeverity('SEV2')
    setService('')
    setDescription('')
    setStartedAt(toLocalInputValue(new Date().toISOString()))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      const id = await createConfirmed({
        title: title.trim(),
        severity,
        service: service.trim(),
        description: description.trim(),
        startedAt: fromLocalInputValue(startedAt),
        status: 'investigating',
        analysisStatus: 'idle',
      })
      reset()
      onClose()
      navigate(`/incidents/${id}`)
    } catch (err) {
      error('Could not create incident', err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <form onSubmit={submit} className="flex min-h-0 flex-col">
        <Modal.Header>
          <Modal.Title>Declare an incident</Modal.Title>
          <Modal.Description>
            Capture what you know now — evidence and analysis come next.
          </Modal.Description>
        </Modal.Header>
        <Modal.Body className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="incident-title">Title</Label>
            <Input
              id="incident-title"
              autoFocus
              placeholder="Checkout API returning 5xx"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
                <SelectTrigger aria-label="Severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{SEVERITY_HINTS[severity]}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="incident-service">Primary service</Label>
              <Input
                id="incident-service"
                placeholder="checkout-api"
                value={service}
                onChange={(e) => setService(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="incident-started">Started at</Label>
            <Input
              id="incident-started"
              type="datetime-local"
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="incident-description">Description</Label>
            <Textarea
              id="incident-description"
              rows={4}
              placeholder="What are users seeing? What alerted you?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!ready || !title.trim()} loading={saving}>
            Declare incident
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}
