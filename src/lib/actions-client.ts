import { getAuthToken } from 'deepspace'

export async function callAction<T = unknown>(name: string, params: Record<string, unknown>): Promise<T> {
  const token = await getAuthToken()
  if (!token) throw new Error('You need to sign in again')
  const res = await fetch(`/api/actions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  })
  const body = (await res.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; error: string }
    | null
  if (!res.ok || !body) throw new Error(`Request failed (${res.status})`)
  if (!body.success) throw new Error(body.error)
  return body.data
}
