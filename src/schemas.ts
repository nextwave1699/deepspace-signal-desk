import type { CollectionSchema } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { incidentSchemas } from './schemas/incident-schemas'

export const schemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  ...incidentSchemas,
]
