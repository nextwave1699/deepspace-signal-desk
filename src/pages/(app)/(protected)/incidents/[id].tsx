import { useParams } from 'react-router-dom'
import { Radio } from 'lucide-react'
import { EmptyState, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui'
import { IncidentHeader } from '@/components/incident/IncidentHeader'
import { OverviewPanel } from '@/components/incident/OverviewPanel'
import { useIncident } from '@/hooks/useIncidentWorkspace'

export default function IncidentPage() {
  const { id = '' } = useParams()
  const { incident, status } = useIncident(id)

  if (status === 'loading') {
    return <div className="mx-auto mt-10 h-32 max-w-6xl animate-pulse rounded-lg bg-card" />
  }
  if (!incident) {
    return (
      <EmptyState
        icon={<Radio />}
        title="Incident not found"
        description="It may have been deleted, or you may not have access to it."
      />
    )
  }

  return (
    <div className="min-h-full">
      <title>{`${incident.data.title} · SignalDesk`}</title>
      <IncidentHeader incident={incident} />
      <Tabs defaultValue="overview" className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <TabsList className="mb-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewPanel incident={incident} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
