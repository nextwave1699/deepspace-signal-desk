import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { analyzeIncident, askIncident } from './incident-actions'

export const actions: Record<string, ActionHandler<Env>> = {
  analyzeIncident,
  askIncident,
}
