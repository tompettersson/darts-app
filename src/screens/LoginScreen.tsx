// src/screens/LoginScreen.tsx
import React, { useState, useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { getAuthProfiles, type AuthProfile } from '../auth/api'
import { useTheme } from '../ThemeProvider'
import { getThemedUI } from '../ui'

export default function LoginScreen() {
  const { login, loginAsGuest } = useAuth()
  const { colors, isArcade } = useTheme()
  const styles = getThemedUI(colors, isArcade)
  const [profiles, setProfiles] = useState<AuthProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getAuthProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false))
  }, [])

  async function handleLogin() {
    if (!selectedId || !password) return
    const profile = profiles.find(p => p.id === selectedId)
    if (!profile) return

    setBusy(true)
    setError('')
    const success = await login(selectedId, profile.name, password, profile.isAdmin)
    setBusy(false)

    if (!success) {
      setError('Falsches Passwort')
      setPassword('')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleLogin()
  }

  const s = {
    page: {
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: colors.bg,
      color: colors.fg,
      gap: 24,
    },
    title: {
      fontSize: 28,
      fontWeight: 900,
      textAlign: 'center' as const,
    },
    subtitle: {
      fontSize: 14,
      color: colors.fgMuted,
      textAlign: 'center' as const,
    },
    card: {
      ...styles.card,
      width: 'min(400px, 92vw)',
      padding: 20,
    },
    profileBtn: (isSelected: boolean, color?: string | null) => ({
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      width: '100%',
      padding: '12px 14px',
      borderRadius: 10,
      border: isSelected ? `2px solid ${color || colors.accent}` : `1px solid ${colors.border}`,
      background: isSelected ? `${color || colors.accent}15` : colors.bgCard,
      cursor: 'pointer',
      fontSize: 15,
      fontWeight: 600,
      color: colors.fg,
      textAlign: 'left' as const,
    }),
    dot: (color?: string | null) => ({
      width: 12,
      height: 12,
      borderRadius: 9999,
      background: color || colors.fgDim,
      flexShrink: 0,
    }),
    passwordRow: {
      display: 'flex',
      gap: 8,
      marginTop: 8,
    },
    input: {
      flex: 1,
      padding: '10px 12px',
      borderRadius: 8,
      border: `1px solid ${error ? colors.error : colors.border}`,
      background: colors.bgInput,
      color: colors.fg,
      fontSize: 15,
      outline: 'none',
    },
    loginBtn: {
      padding: '10px 18px',
      borderRadius: 8,
      border: 'none',
      background: colors.accent,
      color: isArcade ? '#0a0a0a' : '#fff',
      fontWeight: 700,
      fontSize: 15,
      cursor: 'pointer',
      opacity: busy ? 0.6 : 1,
    },
    guestBtn: {
      padding: '12px 24px',
      borderRadius: 10,
      border: `1px solid ${colors.border}`,
      background: 'transparent',
      color: colors.fgMuted,
      fontWeight: 600,
      fontSize: 14,
      cursor: 'pointer',
      width: 'min(400px, 92vw)',
    },
    error: {
      color: colors.error,
      fontSize: 13,
      fontWeight: 600,
      marginTop: 4,
    },
  }

  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.title}>Darts</div>
        <div style={s.subtitle}>Lade...</div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.title}>Darts</div>
      <div style={s.subtitle}>Wähle deinen Spieler und melde dich an</div>

      <div style={s.card}>
        <div style={{ display: 'grid', gap: 8 }}>
          {profiles.map(p => (
            <div key={p.id}>
              <button
                style={s.profileBtn(selectedId === p.id, p.color)}
                onClick={() => {
                  setSelectedId(selectedId === p.id ? null : p.id)
                  setPassword('')
                  setError('')
                }}
              >
                <span style={s.dot(p.color)} />
                {p.name}
                {p.isAdmin && <span style={{ marginLeft: 'auto', fontSize: 11, color: colors.fgMuted }}>Admin</span>}
              </button>

              {selectedId === p.id && (
                <div style={s.passwordRow}>
                  <input
                    type="password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    onKeyDown={handleKeyDown}
                    placeholder="Passwort"
                    style={s.input}
                    autoFocus
                    disabled={busy}
                  />
                  <button
                    style={s.loginBtn}
                    onClick={handleLogin}
                    disabled={busy || !password}
                  >
                    {busy ? '...' : 'Anmelden'}
                  </button>
                </div>
              )}

              {selectedId === p.id && error && (
                <div style={s.error}>{error}</div>
              )}
            </div>
          ))}

          {profiles.length === 0 && (
            <div style={{ color: colors.fgMuted, textAlign: 'center', padding: 20 }}>
              Keine Profile gefunden. Starte als Gast.
            </div>
          )}
        </div>
      </div>

      <button style={s.guestBtn} onClick={loginAsGuest}>
        Als Gast fortfahren
      </button>
    </div>
  )
}
