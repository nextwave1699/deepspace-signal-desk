import { useMemo } from 'react'
import { useQuery } from 'deepspace'
import type { Evidence, Incident } from '@/lib/incident-types'
import { parseEvidenceSources } from '@/lib/signals'

export function useIncident(incidentId: string) {
  const { records, status, error } = useQuery<Incident>('incidents')
  const incident = records.find((r) => r.recordId === incidentId) ?? null
  return { incident, status, error }
}

export function useEvidence(incidentId: string, referenceDate?: string) {
  const { records, status } = useQuery<Evidence>('evidence', {
    where: { incidentId },
    orderBy: 'createdAt',
    orderDir: 'asc',
  })
  const entries = useMemo(
    () =>
      parseEvidenceSources(
        records.map((r) => ({ id: r.recordId, ...r.data })),
        referenceDate,
      ),
    [records, referenceDate],
  )
  return { evidence: records, entries, status }
}
