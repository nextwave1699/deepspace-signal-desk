import { useQuery } from 'deepspace'
import type { Incident } from '@/lib/incident-types'

export function useIncident(incidentId: string) {
  const { records, status, error } = useQuery<Incident>('incidents')
  const incident = records.find((r) => r.recordId === incidentId) ?? null
  return { incident, status, error }
}
