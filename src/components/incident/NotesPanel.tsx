import { useState, type FormEvent } from 'react'
import { useAuthUser, useMutations, useQuery, useUserLookup, type RecordData } from 'deepspace'
import { NotebookPen, Trash2 } from 'lucide-react'
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/ui'
import { relativeTime } from '@/lib/format'
import type { Hypothesis, Note } from '@/lib/incident-types'

export function useNotes(incidentId: string) {
  return useQuery<Note>('notes', { where: { incidentId }, orderBy: 'createdAt', orderDir: 'asc' })
}

const GENERAL = 'general'

export function NotesPanel({
  incidentId,
  hypotheses,
}: {
  incidentId: string
  hypotheses: RecordData<Hypothesis>[]
}) {
  const { records: notes } = useNotes(incidentId)
  const { ready, create, remove } = useMutations<Note>('notes')
  const { getName } = useUserLookup()
  const { user } = useAuthUser()
  const [body, setBody] = useState('')
  const [link, setLink] = useState(GENERAL)

  const titles = new Map(hypotheses.map((h) => [h.recordId, h.data.title]))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!body.trim()) return
    create({ incidentId, body: body.trim(), hypothesisId: link === GENERAL ? '' : link })
    setBody('')
  }

  return (
    <section className="flex h-fit flex-col rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <NotebookPen className="size-4 text-muted-foreground" aria-hidden />
          Investigation notes
        </h2>
      </header>
      <form onSubmit={submit} className="space-y-2 border-b border-border p-3">
        <Textarea
          aria-label="New note"
          rows={3}
          placeholder="Checked RDS metrics: connections flat at 500/500 since 14:31"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex gap-2">
          <Select value={link} onValueChange={setLink}>
            <SelectTrigger aria-label="Link note to" className="h-9 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GENERAL}>General note</SelectItem>
              {hypotheses.map((h) => (
                <SelectItem key={h.recordId} value={h.recordId}>
                  {h.data.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" size="sm" className="h-9" disabled={!ready || !body.trim()}>
            Add note
          </Button>
        </div>
      </form>
      <ul className="max-h-[440px] space-y-3 overflow-y-auto p-3" data-testid="notes-list">
        {notes.length === 0 && <li className="py-4 text-center text-xs text-muted-foreground">No notes yet.</li>}
        {[...notes].reverse().map((n) => (
          <li key={n.recordId} className="group text-sm">
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{n.data.body}</p>
              {user?.id === n.createdBy && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label="Delete note"
                  onClick={() => remove(n.recordId)}
                >
                  <Trash2 className="size-3" />
                </Button>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {getName(n.createdBy) ?? 'Teammate'} · {relativeTime(n.createdAt)}
              {n.data.hypothesisId && titles.has(n.data.hypothesisId) && (
                <span className="text-primary/80"> · re: {titles.get(n.data.hypothesisId)}</span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
