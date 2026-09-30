import { useEffect, useState } from 'react'
import { useMutations, type RecordData } from 'deepspace'
import { Pencil } from 'lucide-react'
import { Button, Textarea } from '@/components/ui'
import type { Incident } from '@/lib/incident-types'

export function OverviewPanel({ incident }: { incident: RecordData<Incident> }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <DescriptionCard incident={incident} />
      </div>
    </div>
  )
}

function DescriptionCard({ incident }: { incident: RecordData<Incident> }) {
  const { ready, put } = useMutations<Incident>('incidents')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(incident.data.description ?? '')

  useEffect(() => {
    if (!editing) setDraft(incident.data.description ?? '')
  }, [incident.data.description, editing])

  const save = () => {
    put(incident.recordId, { description: draft.trim() })
    setEditing(false)
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Description</h2>
        {!editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} disabled={!ready}>
            <Pencil aria-hidden />
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={save}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {incident.data.description || 'No description yet.'}
        </p>
      )}
    </section>
  )
}
