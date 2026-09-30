export const SEVERITIES = ['SEV1', 'SEV2', 'SEV3', 'SEV4'] as const
export type Severity = (typeof SEVERITIES)[number]

export const INCIDENT_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'] as const
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number]

export const EVIDENCE_KINDS = ['log', 'error', 'stacktrace', 'json', 'csv'] as const
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]

export const HYPOTHESIS_STATUSES = ['open', 'investigating', 'confirmed', 'rejected'] as const
export type HypothesisStatus = (typeof HYPOTHESIS_STATUSES)[number]

export type Confidence = 'low' | 'medium' | 'high'
export type AnalysisStatus = 'idle' | 'running' | 'failed'

export interface AnalysisSignal {
  label: string
  detail: string
  count: number | null
  at: string | null
  severity: 'critical' | 'warning' | 'info'
}

export interface RelatedError {
  signature: string
  count: number
  relation: string
}

export interface ChecklistItem {
  step: string
  why: string
  priority: 'now' | 'next' | 'later'
}

export interface IncidentAnalysis {
  engine: 'ai' | 'heuristic'
  summary: string
  impact: string
  signals: AnalysisSignal[]
  relatedErrors: RelatedError[]
  checklist: ChecklistItem[]
  uncertainty: string[]
  overallConfidence: Confidence
  notice?: string
}

export interface IncidentReport {
  summary: string
  rootCause: string
  impact: string
  resolution: string
  followUps: string[]
  generatedAt: string
  engine: 'ai' | 'heuristic'
}

export interface Incident {
  title: string
  severity: Severity
  service: string
  description: string
  startedAt: string
  status: IncidentStatus
  resolvedAt?: string
  analysis?: IncidentAnalysis | null
  analysisStatus?: AnalysisStatus
  analysisError?: string
  analyzedAt?: string
  checklistDone?: string[]
  report?: IncidentReport | null
}

export interface Evidence {
  incidentId: string
  kind: EvidenceKind
  label: string
  service: string
  content: string
}

export interface Hypothesis {
  incidentId: string
  title: string
  rationale: string
  supporting: string[]
  contradicting: string[]
  nextSteps: string[]
  confidence: Confidence
  status: HypothesisStatus
  source: 'ai' | 'user'
}

export type TimelineKind = 'key-event' | 'milestone'

export interface TimelineEvent {
  incidentId: string
  at: string
  title: string
  detail: string
  kind: TimelineKind
  source: 'ai' | 'user'
}

export interface Note {
  incidentId: string
  body: string
  hypothesisId?: string
}

export interface IncidentMessage {
  incidentId: string
  role: 'user' | 'assistant'
  content: string
}
