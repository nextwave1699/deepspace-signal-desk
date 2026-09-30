import type { CollectionSchema } from 'deepspace/schema'

type Permissions = CollectionSchema['permissions']

// Incidents are a shared team workspace: every member can read and contribute,
// but only the author (or an admin) can delete what they created.
const teamPermissions: Permissions = {
  viewer: { read: true, create: false, update: false, delete: false },
  member: { read: true, create: true, update: true, delete: 'own' },
  admin: { read: true, create: true, update: true, delete: true },
}

const json = { kind: 'json' } as const

export const incidentsSchema: CollectionSchema = {
  name: 'incidents',
  columns: [
    { name: 'title', storage: 'text', interpretation: 'plain', required: true },
    { name: 'severity', storage: 'text', interpretation: 'plain', required: true },
    { name: 'service', storage: 'text', interpretation: 'plain' },
    { name: 'description', storage: 'text', interpretation: 'plain' },
    { name: 'startedAt', storage: 'text', interpretation: 'plain' },
    { name: 'status', storage: 'text', interpretation: 'plain' },
    { name: 'resolvedAt', storage: 'text', interpretation: 'plain' },
    { name: 'analysis', storage: 'text', interpretation: json },
    { name: 'analysisStatus', storage: 'text', interpretation: 'plain' },
    { name: 'analysisError', storage: 'text', interpretation: 'plain' },
    { name: 'analyzedAt', storage: 'text', interpretation: 'plain' },
    { name: 'checklistDone', storage: 'text', interpretation: json },
    { name: 'report', storage: 'text', interpretation: json },
  ],
  permissions: teamPermissions,
}

export const evidenceSchema: CollectionSchema = {
  name: 'evidence',
  columns: [
    { name: 'incidentId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'kind', storage: 'text', interpretation: 'plain' },
    { name: 'label', storage: 'text', interpretation: 'plain' },
    { name: 'service', storage: 'text', interpretation: 'plain' },
    { name: 'content', storage: 'text', interpretation: 'plain' },
  ],
  permissions: teamPermissions,
}

export const hypothesesSchema: CollectionSchema = {
  name: 'hypotheses',
  columns: [
    { name: 'incidentId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'title', storage: 'text', interpretation: 'plain' },
    { name: 'rationale', storage: 'text', interpretation: 'plain' },
    { name: 'supporting', storage: 'text', interpretation: json },
    { name: 'contradicting', storage: 'text', interpretation: json },
    { name: 'nextSteps', storage: 'text', interpretation: json },
    { name: 'confidence', storage: 'text', interpretation: 'plain' },
    { name: 'status', storage: 'text', interpretation: 'plain' },
    { name: 'source', storage: 'text', interpretation: 'plain' },
  ],
  permissions: teamPermissions,
}

export const timelineEventsSchema: CollectionSchema = {
  name: 'timeline-events',
  columns: [
    { name: 'incidentId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'at', storage: 'text', interpretation: 'plain' },
    { name: 'title', storage: 'text', interpretation: 'plain' },
    { name: 'detail', storage: 'text', interpretation: 'plain' },
    { name: 'kind', storage: 'text', interpretation: 'plain' },
    { name: 'source', storage: 'text', interpretation: 'plain' },
  ],
  permissions: teamPermissions,
}

export const notesSchema: CollectionSchema = {
  name: 'notes',
  columns: [
    { name: 'incidentId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'body', storage: 'text', interpretation: 'plain' },
    { name: 'hypothesisId', storage: 'text', interpretation: 'plain' },
  ],
  permissions: teamPermissions,
}

export const incidentMessagesSchema: CollectionSchema = {
  name: 'incident-messages',
  columns: [
    { name: 'incidentId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'role', storage: 'text', interpretation: 'plain' },
    { name: 'content', storage: 'text', interpretation: 'plain' },
  ],
  permissions: teamPermissions,
}

export const incidentSchemas: CollectionSchema[] = [
  incidentsSchema,
  evidenceSchema,
  hypothesesSchema,
  timelineEventsSchema,
  notesSchema,
  incidentMessagesSchema,
]
