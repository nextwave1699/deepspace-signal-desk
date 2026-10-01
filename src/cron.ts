import type { CronTask } from 'deepspace/worker'

export const tasks: CronTask[] = []

export async function runTask(_name: string, _env: unknown): Promise<void> {}
