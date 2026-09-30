import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useMutations } from 'deepspace'
import { FileUp } from 'lucide-react'
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
import { EVIDENCE_KINDS, type Evidence, type EvidenceKind } from '@/lib/incident-types'
import { detectEvidenceKind, parseEvidence } from '@/lib/signals'

const MAX_EVIDENCE_BYTES = 512 * 1024

export const KIND_LABELS: Record<EvidenceKind, string> = {
  log: 'Application log',
  error: 'Error messages',
  stacktrace: 'Stack trace',
  json: 'JSON / NDJSON events',
  csv: 'CSV events',
}

interface Props {
  open: boolean
  onClose: () => void
  incidentId: string
  defaultService: string
  referenceDate: string
}

export function AddEvidenceDialog({ open, onClose, incidentId, defaultService, referenceDate }: Props) {
  const { ready, createConfirmed } = useMutations<Evidence>('evidence')
  const { error, success } = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [content, setContent] = useState('')
  const [label, setLabel] = useState('')
  const [service, setService] = useState(defaultService)
  const [kind, setKind] = useState<EvidenceKind>('log')
  const [kindTouched, setKindTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  const tooLarge = new Blob([content]).size > MAX_EVIDENCE_BYTES
  const preview = content.trim() ? parseEvidence(kind, content, { referenceDate }) : []
  const previewErrors = preview.filter((e) => e.level === 'error' || e.level === 'fatal').length

  const reset = () => {
    setContent('')
    setLabel('')
    setService(defaultService)
    setKind('log')
    setKindTouched(false)
  }

  const updateContent = (text: string, fileName = '') => {
    setContent(text)
    if (!kindTouched) setKind(detectEvidenceKind(text, fileName))
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_EVIDENCE_BYTES) {
      error('File too large', 'Evidence files are limited to 512 KB. Trim it to the incident window.')
      return
    }
    const text = await file.text()
    updateContent(text, file.name)
    if (!label) setLabel(file.name)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!content.trim() || tooLarge) return
    setSaving(true)
    try {
      await createConfirmed({
        incidentId,
        kind,
        label: label.trim() || `${KIND_LABELS[kind]} (${new Date().toLocaleTimeString()})`,
        service: service.trim(),
        content,
      })
      success('Evidence added', `${preview.length} entries parsed`)
      reset()
      onClose()
    } catch (err) {
      error('Could not add evidence', err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <form onSubmit={submit} className="flex min-h-0 flex-col">
        <Modal.Header>
          <Modal.Title>Add evidence</Modal.Title>
          <Modal.Description>
            Paste logs, error output, a stack trace, or upload JSON/CSV event exports.
          </Modal.Description>
        </Modal.Header>
        <Modal.Body className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="evidence-label">Label</Label>
              <Input
                id="evidence-label"
                placeholder="checkout-api pod logs"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="evidence-service">Service</Label>
              <Input
                id="evidence-service"
                placeholder="checkout-api"
                value={service}
                onChange={(e) => setService(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Format</Label>
              <Select
                value={kind}
                onValueChange={(v) => {
                  setKind(v as EvidenceKind)
                  setKindTouched(true)
                }}
              >
                <SelectTrigger aria-label="Evidence format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVIDENCE_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="evidence-content">Content</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
                <FileUp aria-hidden />
                Upload file
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".log,.txt,.json,.ndjson,.jsonl,.csv,text/*,application/json"
                className="hidden"
                onChange={onFile}
                data-testid="evidence-file-input"
              />
            </div>
            <Textarea
              id="evidence-content"
              rows={12}
              spellCheck={false}
              className="font-mono text-xs"
              placeholder={'2026-09-28T14:32:07Z ERROR [checkout-api] DB connection timeout after 5000ms'}
              value={content}
              onChange={(e) => updateContent(e.target.value)}
            />
            <p className="text-xs text-muted-foreground" data-testid="evidence-preview">
              {tooLarge
                ? 'Content exceeds 512 KB — trim it to the incident window.'
                : content.trim()
                  ? `Parsed ${preview.length} entries · ${previewErrors} errors · detected as ${KIND_LABELS[kind].toLowerCase()}`
                  : 'Timestamps without a timezone are read as UTC.'}
            </p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!ready || !content.trim() || tooLarge} loading={saving}>
            Add evidence
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}
