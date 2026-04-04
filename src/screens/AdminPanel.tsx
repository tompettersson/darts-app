// src/screens/AdminPanel.tsx
import React, { useState, useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { getAuthProfiles, adminResetPassword, createProfileWithPassword, type AuthProfile } from '../auth/api'
import { deleteProfile, getProfiles, countOpenMatches, deleteAllOpenMatches } from '../storage'
import { useTheme } from '../ThemeProvider'
import { getThemedUI } from '../ui'
import { showToast } from '../components/Toast'

export default function AdminPanel({ onBack }: { onBack: () => void }) {
  const { user } = useAuth()
  const { colors, isArcade } = useTheme()
  const styles = getThemedUI(colors, isArcade)
  const [profiles, setProfiles] = useState<AuthProfile[]>([])
  const [loading, setLoading] = useState(true)

  // Reset password state
  const [resetTarget, setResetTarget] = useState<string | null>(null)
  const [newPw, setNewPw] = useState('')
  const [adminPw, setAdminPw] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [resetError, setResetError] = useState('')

  // Create profile state
  const [createName, setCreateName] = useState('')
  const [createPw, setCreatePw] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => {
    loadProfiles()
  }, [])

  async function loadProfiles() {
    setLoading(true)
    try {
      const p = await getAuthProfiles()
      setProfiles(p)
    } catch {}
    setLoading(false)
  }

  async function handleResetPassword() {
    if (!resetTarget || !newPw || !adminPw || !user) return
    setResetBusy(true)
    setResetError('')
    try {
      const result = await adminResetPassword(user.profileId, adminPw, resetTarget, newPw)
      if (result.success) {
        showToast('Passwort zurückgesetzt')
        setResetTarget(null)
        setNewPw('')
        setAdminPw('')
      } else {
        setResetError(result.error || 'Fehler')
      }
    } catch (e: any) {
      setResetError(e.message || 'Fehler')
    }
    setResetBusy(false)
  }

  async function handleCreateProfile() {
    if (!createName.trim()) return
    setCreateBusy(true)
    setCreateError('')
    try {
      // Default password: Name + "1" (can be changed in settings)
      const defaultPw = createName.trim() + '1'
      const result = await createProfileWithPassword(createName.trim(), defaultPw)
      if (result.success) {
        showToast(`Profil "${result.name}" erstellt (Passwort: ${defaultPw})`)
        setCreateName('')
        setCreatePw('')
        await loadProfiles()
      } else {
        setCreateError(result.error || 'Fehler')
      }
    } catch (e: any) {
      setCreateError(e.message || 'Fehler')
    }
    setCreateBusy(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Profil wirklich löschen? Stats & Highscores werden gelöscht.')) return
    await deleteProfile(id)
    showToast('Profil gelöscht')
    setDeleteTarget(null)
    await loadProfiles()
  }

  const s = {
    page: { ...styles.page },
    headerRow: { ...styles.headerRow },
    backBtn: { ...styles.backBtn },
    card: { ...styles.card, marginBottom: 12 },
    cardTitle: { fontSize: 14, fontWeight: 700, color: colors.fg, marginBottom: 10 },
    row: {
      display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0',
      borderBottom: `1px solid ${colors.border}`,
      flexWrap: 'wrap' as const,
    },
    dot: (color?: string | null) => ({
      width: 10, height: 10, borderRadius: 9999,
      background: color || colors.fgDim,
      flexShrink: 0,
    }),
    name: {
      flex: 1, fontWeight: 600, color: colors.fg, fontSize: 14,
      minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
    },
    btn: {
      padding: '5px 10px', borderRadius: 8,
      border: `1px solid ${colors.border}`,
      background: colors.bgMuted, color: colors.fg,
      cursor: 'pointer', fontSize: 12, fontWeight: 600,
    },
    btnDanger: {
      padding: '5px 10px', borderRadius: 8,
      border: `1px solid ${colors.error}`,
      background: colors.error, color: '#fff',
      cursor: 'pointer', fontSize: 12, fontWeight: 600,
    },
    input: {
      width: '100%', padding: '8px 10px', borderRadius: 8,
      border: `1px solid ${colors.border}`,
      background: colors.bgInput, color: colors.fg,
      fontSize: 14, outline: 'none', boxSizing: 'border-box' as const,
    },
    inputRow: { display: 'grid', gap: 8, marginTop: 8 },
    error: { color: colors.error, fontSize: 13, fontWeight: 600, marginTop: 4 },
    btnPrimary: {
      padding: '10px 14px', borderRadius: 8, border: 'none',
      background: colors.accent, color: isArcade ? '#0a0a0a' : '#fff',
      fontWeight: 700, fontSize: 14, cursor: 'pointer', width: '100%',
    },
  }

  return (
    <div style={s.page}>
      <div style={s.headerRow}>
        <h2 style={{ margin: 0, color: colors.fg }}>Admin</h2>
        <button style={s.backBtn} onClick={onBack}>← Zurück</button>
      </div>
      <div style={{ maxWidth: 500, margin: '0 auto', width: '100%' }}>

      {/* Create new profile */}
      <div style={s.card}>
        <div style={s.cardTitle}>Neues Profil erstellen</div>
        <div style={{ fontSize: 12, color: colors.fgMuted, marginBottom: 6 }}>
          Passwort wird automatisch auf Name+1 gesetzt (z.B. "Tim1")
        </div>
        <div style={s.inputRow}>
          <input
            value={createName}
            onChange={e => setCreateName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateProfile() }}
            placeholder="Name"
            style={s.input}
          />
          <button
            style={s.btnPrimary}
            onClick={handleCreateProfile}
            disabled={createBusy || !createName.trim()}
          >
            {createBusy ? '...' : 'Profil erstellen'}
          </button>
        </div>
        {createError && <div style={s.error}>{createError}</div>}
      </div>

      {/* Player list with reset/delete */}
      <div style={s.card}>
        <div style={s.cardTitle}>Spieler verwalten</div>
        {loading ? (
          <div style={{ color: colors.fgMuted }}>Lade...</div>
        ) : (
          profiles.map(p => (
            <div key={p.id}>
              <div style={s.row}>
                <span style={s.dot(p.color)} />
                <span style={s.name}>
                  {p.name}
                  {p.isAdmin && <span style={{ fontSize: 11, color: colors.fgMuted, marginLeft: 6 }}>Admin</span>}
                </span>
                <button
                  style={s.btn}
                  onClick={() => { setResetTarget(resetTarget === p.id ? null : p.id); setNewPw(''); setAdminPw(''); setResetError('') }}
                >
                  PW Reset
                </button>
                {!p.isAdmin && (
                  <button style={s.btnDanger} onClick={() => handleDelete(p.id)}>
                    Löschen
                  </button>
                )}
              </div>

              {resetTarget === p.id && (
                <div style={{ padding: '8px 0 8px 18px' }}>
                  <div style={s.inputRow}>
                    <input
                      type="password"
                      value={newPw}
                      onChange={e => setNewPw(e.target.value)}
                      placeholder="Neues Passwort"
                      style={s.input}
                    />
                  </div>
                  <div style={s.inputRow}>
                    <input
                      type="password"
                      value={adminPw}
                      onChange={e => { setAdminPw(e.target.value); setResetError('') }}
                      placeholder="Dein Admin-Passwort"
                      style={s.input}
                    />
                    <button
                      style={s.btnPrimary}
                      onClick={handleResetPassword}
                      disabled={resetBusy || !newPw || !adminPw}
                    >
                      {resetBusy ? '...' : 'Zurücksetzen'}
                    </button>
                  </div>
                  {resetError && <div style={s.error}>{resetError}</div>}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Offene Spiele aufräumen */}
      <div style={s.card}>
        <div style={{ fontWeight: 700, fontSize: 14, color: colors.fg, marginBottom: 8 }}>Wartung</div>
        <button
          style={{
            ...s.btnPrimary,
            background: colors.error,
            border: `1px solid ${colors.error}`,
            width: '100%',
          }}
          onClick={async () => {
            const openCount = countOpenMatches()
            if (openCount === 0) {
              showToast('Keine offenen Spiele vorhanden')
              return
            }
            if (!confirm(`${openCount} offene(s) Spiel(e) löschen? Diese wurden nicht beendet und gehen nicht in die Statistik ein.`)) return
            const deleted = await deleteAllOpenMatches()
            showToast(`${deleted} offene(s) Spiel(e) gelöscht`)
          }}
        >
          Offene Spiele aufräumen ({countOpenMatches()})
        </button>
        <div style={{ fontSize: 11, color: colors.fgMuted, marginTop: 4 }}>
          Löscht alle nicht-beendeten Matches aus allen Spielmodi.
        </div>
      </div>
      </div>{/* end centering container */}
    </div>
  )
}
