// src/auth/api.ts
// Client-side helpers for auth API calls

const AUTH_URL = '/api/auth'
const API_KEY = 'darts-2024-local'

async function authRequest<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

export async function verifyPassword(profileId: string, password: string): Promise<{ valid: boolean; sessionToken?: string }> {
  return authRequest<{ valid: boolean; sessionToken?: string }>({ type: 'verify', profileId, password })
}

export async function validateSession(sessionToken: string): Promise<boolean> {
  const result = await authRequest<{ valid: boolean }>({ type: 'validate-session', sessionToken })
  return result.valid
}

export async function logoutSession(sessionToken: string): Promise<void> {
  await authRequest({ type: 'logout', sessionToken })
}

export async function verifyMultiplePlayers(
  players: Array<{ profileId: string; password: string }>
): Promise<Map<string, boolean>> {
  const result = await authRequest<{ results: Array<{ profileId: string; valid: boolean }> }>({
    type: 'verify-multi',
    players,
  })
  return new Map(result.results.map(r => [r.profileId, r.valid]))
}

export async function changePassword(
  profileId: string,
  oldPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  return authRequest({ type: 'change-password', profileId, oldPassword, newPassword })
}

export async function adminResetPassword(
  adminId: string,
  adminPassword: string,
  targetProfileId: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  return authRequest({ type: 'admin-reset-password', adminId, adminPassword, targetProfileId, newPassword })
}

export async function createProfileWithPassword(
  name: string,
  password: string,
  color?: string
): Promise<{ success: boolean; id?: string; name?: string; error?: string }> {
  return authRequest({ type: 'create-profile', name, password, color })
}

export async function migratePasswords(): Promise<{ migrated: boolean; count?: number }> {
  return authRequest({ type: 'migrate-passwords' })
}

export type AuthProfile = {
  id: string
  name: string
  color: string | null
  isAdmin: boolean
}

export async function getAuthProfiles(): Promise<AuthProfile[]> {
  const result = await authRequest<{ profiles: AuthProfile[] }>({ type: 'get-auth-profiles' })
  return result.profiles
}
