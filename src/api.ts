export async function submitMatch(payload: {
  id: string
  createdAt: string
  title?: string
  players: { id: string; name: string }[]
  events: any[]
  statsByPlayer: Record<string, any>
}) {
  const res = await fetch('http://localhost:3001/api/matches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  return res.json() as Promise<{ ok: true; dbId: string }>
}
