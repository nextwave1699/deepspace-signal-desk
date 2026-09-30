import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useQuery, useUserLookup, type RecordData } from 'deepspace'
import { Bot, Send } from 'lucide-react'
import { Button, Textarea, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { callAction } from '@/lib/actions-client'
import { relativeTime } from '@/lib/format'
import type { Incident, IncidentMessage } from '@/lib/incident-types'
import { useHypotheses } from './AnalysisPanel'
import { NotesPanel } from './NotesPanel'

const SUGGESTIONS = [
  'What changed right before the first error?',
  'Which errors are symptoms and which could be the cause?',
  'What evidence would confirm the top hypothesis?',
  'Summarize the customer impact so far.',
]

export function InvestigatePanel({ incident }: { incident: RecordData<Incident> }) {
  const { records: hypotheses } = useHypotheses(incident.recordId)
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <IncidentChat incident={incident} />
      <NotesPanel incidentId={incident.recordId} hypotheses={hypotheses} />
    </div>
  )
}

function IncidentChat({ incident }: { incident: RecordData<Incident> }) {
  const { records: messages } = useQuery<IncidentMessage>('incident-messages', {
    where: { incidentId: incident.recordId },
    orderBy: 'createdAt',
    orderDir: 'asc',
  })
  const { getName } = useUserLookup()
  const { error } = useToast()
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, pending])

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || pending) return
    setPending(q)
    setDraft('')
    try {
      await callAction('askIncident', { incidentId: incident.recordId, question: q })
    } catch (err) {
      setDraft(q)
      error('Could not get an answer', err instanceof Error ? err.message : String(err))
    } finally {
      setPending(null)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    ask(draft)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      ask(draft)
    }
  }

  const waitingForEcho = pending !== null && !messages.some((m) => m.data.role === 'user' && m.data.content === pending)

  return (
    <section className="flex h-[640px] flex-col rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Bot className="size-4 text-primary" aria-hidden />
          Ask about this incident
        </h2>
        <p className="text-xs text-muted-foreground">
          Answers draw on the evidence, analysis, hypothesis reviews, notes and timeline. Shared with the whole team.
        </p>
      </header>

      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto p-4" data-testid="chat-messages">
        {messages.length === 0 && !pending && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">Try asking:</p>
            <div className="flex max-w-lg flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <Message
            key={m.recordId}
            role={m.data.role}
            content={m.data.content}
            meta={`${m.data.role === 'user' ? (getName(m.createdBy) ?? 'Teammate') : 'SignalDesk'} · ${relativeTime(m.createdAt)}`}
          />
        ))}
        {waitingForEcho && <Message role="user" content={pending ?? ''} meta="You · sending" />}
        {pending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <span className="flex gap-1" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 animate-pulse rounded-full bg-primary" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </span>
            Investigating…
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-border p-3">
        <Textarea
          aria-label="Ask a question"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Why did latency spike at 14:32?"
          className="min-h-0 resize-none"
          maxLength={2000}
        />
        <Button type="submit" size="icon" aria-label="Send question" disabled={!draft.trim() || !!pending}>
          <Send />
        </Button>
      </form>
    </section>
  )
}

function Message({ role, content, meta }: { role: IncidentMessage['role']; content: string; meta: string }) {
  const mine = role === 'user'
  return (
    <div className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')} data-testid={`chat-${role}`}>
      <div
        className={cn(
          'max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm leading-relaxed',
          mine ? 'bg-primary/15 text-foreground' : 'border border-border bg-background',
        )}
      >
        {content}
      </div>
      <span className="text-[11px] text-muted-foreground">{meta}</span>
    </div>
  )
}
