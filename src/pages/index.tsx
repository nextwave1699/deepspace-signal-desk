import { Link } from 'react-router-dom'
import { ArrowRight, Check, FileSearch, GitBranch, Radio, ScrollText, X } from 'lucide-react'
import { Seo } from '../components/Seo'
import { APP_NAME } from '../constants'
import { seo } from '../seo'

const STEPS = [
  {
    icon: FileSearch,
    title: 'Collect the evidence',
    body: 'Paste logs, error output and stack traces, or upload JSON and CSV exports. SignalDesk parses timestamps, levels, services and latency, and groups repeats into error signatures.',
  },
  {
    icon: GitBranch,
    title: 'Reason from it',
    body: 'Every hypothesis shows the signals that support it, the ones that contradict it, and how confident the analysis is. Ask follow-up questions grounded in the same evidence.',
  },
  {
    icon: ScrollText,
    title: 'Close the loop',
    body: 'Confirm or reject hypotheses as a team, log milestones on a shared timeline, and turn it all into an editable post-incident report.',
  },
]

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="min-h-screen bg-background text-foreground">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-7 items-center justify-center rounded bg-primary/15 text-primary">
              <Radio className="size-4" aria-hidden />
            </span>
            {APP_NAME}
          </span>
          <Link to="/home" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Sign in
          </Link>
        </header>

        <main>
          <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-12 lg:grid-cols-[1fr_1.05fr] lg:pt-20">
            <div>
              <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-primary">Incident intelligence</p>
              <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
                Find the signal in the middle of the outage.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">
                {APP_NAME} turns the logs, errors and stack traces your on-call team is already staring at into ranked
                root-cause hypotheses — with the evidence for and against each one in plain view.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  to="/home"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Open the incident desk
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                <span className="text-sm text-muted-foreground">Includes a demo incident to explore.</span>
              </div>
            </div>
            <ReasoningPreview />
          </section>

          <section className="border-t border-border bg-card/40">
            <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <div key={title}>
                  <div className="mb-4 flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                    <Icon className="size-5 text-primary" aria-hidden />
                  </div>
                  <h2 className="text-base font-semibold">{title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </section>
        </main>

        <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-8 text-xs text-muted-foreground">
          <span>{APP_NAME} — AI incident intelligence for engineering teams.</span>
          <span>Built on DeepSpace</span>
        </footer>
      </div>
    </>
  )
}

function ReasoningPreview() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]" aria-hidden>
      <div className="mb-4 flex items-center gap-2 text-xs">
        <span className="rounded px-1.5 py-0.5 font-mono text-[#fbbf5a] ring-1 ring-inset ring-[#f59e0b]/40">SEV2</span>
        <span className="font-medium">Checkout API returning 503s</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1.2fr]">
        <div className="space-y-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Observed evidence</p>
          {[
            ['DB connection timeout', '×37', 'bg-[#f0564a]'],
            ['API latency up 4.2×', '14:32', 'bg-[#f0564a]'],
            ['Deploy v2.14.0', '14:29', 'bg-[#f5a524]'],
            ['Payment gateway 429s', '×6', 'bg-[#60a5fa]'],
          ].map(([label, meta, dot]) => (
            <div key={label} className="flex items-center gap-2 text-xs">
              <span className={`size-1.5 rounded-full ${dot}`} />
              <span className="flex-1">{label}</span>
              <span className="font-mono text-muted-foreground">{meta}</span>
            </div>
          ))}
        </div>
        <div className="hidden items-center sm:flex">
          <ArrowRight className="size-4 text-muted-foreground" />
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">AI hypothesis</p>
          <p className="mt-1 text-sm font-medium">Database connection pool exhaustion</p>
          <div className="mt-3 space-y-1.5 text-xs">
            <p className="flex items-center gap-1.5">
              <Check className="size-3.5 text-[#6ee7b7]" /> Supporting evidence: 3 signals
            </p>
            <p className="flex items-center gap-1.5">
              <X className="size-3.5 text-[#ff8a80]" /> Contradicting evidence: 1 signal
            </p>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-[#7dd3fc]">
            <span className="flex items-end gap-0.5">
              <span className="h-[7px] w-1 rounded-sm bg-current" />
              <span className="h-[10px] w-1 rounded-sm bg-current" />
              <span className="h-[13px] w-1 rounded-sm bg-muted-foreground/25" />
            </span>
            Medium confidence
          </div>
        </div>
      </div>
    </div>
  )
}
