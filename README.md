# SignalDesk — AI Incident Intelligence

SignalDesk helps engineering teams investigate production incidents. Declare an
incident, paste or upload the logs, errors and stack traces you have, and
SignalDesk turns them into ranked root-cause hypotheses — each with the evidence
that supports it, the evidence that contradicts it, and a confidence level.
The team reviews hypotheses, asks follow-up questions, records milestones on a
shared timeline, and finishes with an editable post-incident report.

Built on [DeepSpace](https://docs.deep.space) (React + Cloudflare Workers +
Durable Objects) with Claude for analysis.

## Features

| Area | What it does |
|---|---|
| **Incidents** | Declare with title, severity (SEV1–4), service, start time and description. Status flow: investigating → identified → monitoring → resolved. |
| **Evidence** | Paste or upload plain logs, error output, stack traces, JSON / NDJSON and CSV (≤512 KB each). The format is auto-detected with a live parse preview. |
| **Evidence explorer** | Every parsed entry across sources, filterable by text, level, service, source and time window. |
| **AI analysis** | Summary, impact, observed signals, 2–4 hypotheses, related errors, key events, an investigation checklist and open questions, with overall and per-hypothesis confidence. |
| **Evidence → Reasoning** | Observed signals sit next to each hypothesis, with *Supporting · n* and *Contradicting · n* evidence lists and a confidence meter. |
| **Hypothesis tracking** | Mark hypotheses Investigating / Confirmed / Rejected and add your own. Confirming records a timeline milestone and moves the incident to *identified*. Reviewed hypotheses survive re-analysis. |
| **Q&A** | A shared per-incident conversation grounded in the evidence, analysis, hypothesis reviews, notes and milestones. |
| **Timeline** | Log-activity chart (errors / warnings / other over time) plus a unified timeline of declaration, first detected error, AI key events, team milestones and resolution. |
| **Notes** | Shared investigation notes, optionally linked to a hypothesis. |
| **Report** | AI-drafted summary, root cause, impact, resolution and follow-ups; every section is editable. Copy or download it as Markdown, including the timeline, evidence inventory and reviewed hypotheses. |
| **Dashboard** | Active incidents, active SEV1–2, resolved in 30 days, median time to resolve; search and filter by severity, status and service (kept in the URL). |
| **Demo** | *Load demo incident* seeds a realistic outage: a deploy that shrank a DB connection pool, with app logs, load-balancer JSON, a Sentry stack trace and misleading noise. |

Everything is real-time: two engineers on the same incident see each other's
evidence, hypothesis reviews, notes and chat as they happen.

## Architecture

```
Browser (React 19, Tailwind, Base UI)
  │  useQuery / useMutations  ── WebSocket ──►  RecordRoom Durable Object (SQLite, RBAC, live sync)
  │  src/lib/signals.ts parses evidence client-side for the explorer and charts
  │
  └─ POST /api/actions/:name  ──►  Worker (Hono)
                                    └─ src/actions/incident-actions.ts
                                         ├─ reads/writes records through action tools
                                         ├─ src/lib/signals.ts   deterministic parsing and statistics
                                         ├─ src/lib/analysis.ts  evidence digest, prompts, rule-based fallback
                                         └─ Claude via the DeepSpace AI proxy (structured output)
```

- **Data model** (`src/schemas/incident-schemas.ts`): `incidents`, `evidence`,
  `hypotheses`, `timeline-events`, `notes`, `incident-messages`. Child records
  point at their incident with `incidentId`. Every team member can read and
  contribute; only a record's author or an admin can delete it.
- **Server actions** (`src/actions`): `analyzeIncident`, `askIncident`,
  `generateReport`, `seedDemoIncident`, `deleteIncident`. Actions run with
  row-level RBAC off, so each one checks the caller's app role itself, and
  `deleteIncident` checks ownership before cascading.
- **Shared domain code** (`src/lib`) is plain TypeScript used by both the
  browser and the worker, so the explorer, the charts and the AI digest all
  see the same parsed evidence.

### How the AI step works

1. **Parse deterministically first.** `signals.ts` extracts timestamps, levels,
   services and latency; folds stack frames into their log line; normalises
   volatile tokens (ids, IPs, numbers) into error signatures; and computes
   level counts, the first error and latency shifts.
2. **Build a bounded digest.** `buildEvidenceDigest` combines incident
   metadata, the computed statistics, the top signatures, hypotheses the team
   has already reviewed, and excerpts from each source. Long sources keep their
   start and end, every change event (deploys, rollbacks, config) and a sample
   of each distinct error, capped at about 32k characters.
3. **Ask for structured output.** The model receives a zod schema through the
   AI SDK, so the response is validated JSON, not free text. The prompt requires
   concrete citations, honest confidence, and a list of unknowns.
4. **Merge without clobbering the team.** Re-analysis replaces AI hypotheses
   that nobody has touched and AI key events; hypotheses marked investigating,
   confirmed or rejected are kept.
5. **Degrade gracefully.** If the model is unavailable (credits, timeout,
   provider error), a conservative pattern-based analyzer produces hypotheses
   (never above *medium* confidence) and says so in a banner. Q&A falls back to
   a keyword search of the evidence, and reports fall back to a template built
   from confirmed hypotheses and milestones.

## Design decisions and tradeoffs

- **User-supplied evidence rather than live integrations.** Pulling from
  Datadog, Grafana or CloudWatch would need per-vendor auth and query
  languages. Pasted and uploaded evidence goes through the same parser, digest
  and schema that an integration would feed, so adding a connector means
  writing one more `EvidenceSource` producer.
- **Deterministic statistics, LLM reasoning.** Counts, time windows and
  latency ratios are computed, not generated, which keeps the numbers in the UI
  trustworthy and lets the model spend its effort on causality.
- **Owner-billed AI.** Analysis is team infrastructure, so model calls bill
  the app owner instead of whichever engineer is on call. Only team members
  (role `member` or `admin`) can trigger them.
- **Evidence stored as text records (≤512 KB).** This is simple, syncs in real
  time and is enough for an incident window. Multi-GB log archives would belong
  in object storage with server-side parsing.
- **Timestamps without a zone are read as UTC**, which matches most server
  logs. Time-only stamps (`14:32:07`) are anchored to the incident's date.
- **Parsing runs in the browser.** This keeps the explorer instant while
  filtering. The worker re-parses the same text for the AI digest.

## Running locally

Requires Node 22.15+ (or 24 / 26) and npm 11.6+.

```sh
npm install
npx deepspace auth login     # once
npm run dev                  # http://localhost:5173
```

Sign in, open **Incidents**, and click **Load demo incident**, then
**Analyze incident**.

## Tests

```sh
npm run test:unit            # parser, analysis, report and demo-data unit tests (vitest)
npx deepspace test run       # smoke + API specs (Playwright)
npx deepspace test run e2e   # end-to-end incident workflows; needs a test account:
                             #   npx deepspace test accounts create --email you@deepspace.test --name "You" --password-stdin
npm run validate             # type-check + unit tests
```

`tests/incidents.spec.ts` covers declaring incidents, evidence ingestion and
filtering, the timeline, AI analysis, Q&A, hypothesis review and notes, report
drafting and export, dashboard filtering, and the demo-plus-delete flow.

## Project layout

```
src/
  actions/            server actions (analysis, Q&A, report, demo seed, delete)
  components/incident incident UI: dashboard pieces, evidence, analysis, timeline, investigate, report
  hooks/              incident data hooks
  lib/                shared domain logic — signals, analysis, report, timeline, demo data (+ tests)
  pages/              routes: / (landing), /home (dashboard), /incidents/:id (workspace)
  schemas/            collection schemas and RBAC
tests/                Playwright specs
worker.ts             Cloudflare Worker entry and Durable Object wiring
```

## What's next

- Connectors that pull evidence straight from observability tools.
- Grouping evidence across incidents to spot recurring failure signatures.
- Streaming analysis progress and token-level Q&A streaming.
- Server-side parsing for large archives stored in R2.
