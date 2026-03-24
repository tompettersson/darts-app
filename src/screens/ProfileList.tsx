import React, { useMemo, useState } from 'react'
import { getProfiles, renameProfile, deleteProfile, updateProfileColor, type Profile } from '../storage'
import { getThemedUI, PROFILE_COLORS } from '../ui'
import { useTheme } from '../ThemeProvider'
import { useAuth } from '../auth/AuthContext'
import { changePassword } from '../auth/api'
import { showToast } from '../components/Toast'

// Beispiel-Chart zur Farbvorschau
function ColorPreviewChart({ playerColor, bgColor }: { playerColor: string; bgColor: string }) {
  const opponent1 = '#64748b'
  const opponent2 = '#78716c'

  const data = [
    { p1: 501, p2: 501, p3: 501 },
    { p1: 441, p2: 461, p3: 421 },
    { p1: 341, p2: 401, p3: 321 },
    { p1: 241, p2: 321, p3: 221 },
    { p1: 161, p2: 261, p3: 141 },
    { p1: 101, p2: 181, p3: 81 },
    { p1: 41, p2: 121, p3: 41 },
    { p1: 0, p2: 61, p3: 9 },
  ]

  const width = 280
  const height = 100
  const padding = { left: 8, right: 8, top: 8, bottom: 8 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const xScale = (i: number) => padding.left + (i / (data.length - 1)) * chartWidth
  const yScale = (score: number) => padding.top + ((501 - score) / 501) * chartHeight

  const makePath = (key: 'p1' | 'p2' | 'p3') => {
    return data.map((d, i) => {
      const x = xScale(i)
      const y = yScale(d[key])
      return i === 0 ? `M${x},${y}` : `L${x},${y}`
    }).join(' ')
  }

  return (
    <svg width={width} height={height} style={{ display: 'block', margin: '0 auto' }}>
      <rect x={0} y={0} width={width} height={height} fill={bgColor} rx={8} />
      {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
        <line key={i} x1={padding.left} x2={width - padding.right}
          y1={padding.top + pct * chartHeight} y2={padding.top + pct * chartHeight}
          stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
      ))}
      <path d={makePath('p2')} fill="none" stroke={opponent1} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" opacity={0.5} />
      <path d={makePath('p3')} fill="none" stroke={opponent2} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" opacity={0.5} />
      <path d={makePath('p1')} fill="none" stroke={playerColor} strokeWidth={3}
        strokeLinecap="round" strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 4px ${playerColor})` }} />
      <circle cx={xScale(data.length - 1)} cy={yScale(0)} r={5} fill={playerColor} stroke="#fff" strokeWidth={2} />
      <text x={padding.left + 4} y={padding.top + 14} fill={playerColor} fontSize={11} fontWeight={700}>Du</text>
      <text x={width - padding.right - 4} y={yScale(61) - 4} fill={opponent1} fontSize={9} textAnchor="end" opacity={0.7}>Spieler 2</text>
      <text x={width - padding.right - 4} y={yScale(9) + 12} fill={opponent2} fontSize={9} textAnchor="end" opacity={0.7}>Spieler 3</text>
    </svg>
  )
}

export default function ProfileList({ onBack }: { onBack: () => void }) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])
  const auth = useAuth()

  // Eigenes Profil aus der Liste finden
  const myProfile = useMemo(() => {
    const profiles = getProfiles()
    return profiles.find(p => p.id === auth.user?.profileId) || null
  }, [auth.user?.profileId])

  const allProfiles = useMemo(() => getProfiles(), [])

  // States
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(myProfile?.name || '')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [previewColor, setPreviewColor] = useState<string | null>(null)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)
  const [busy, setBusy] = useState(false)
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(myProfile)

  // Welche Farben sind bereits von anderen vergeben?
  const usedColors = useMemo(() =>
    allProfiles.filter(p => p.color && p.id !== myProfile?.id).map(p => p.color!),
  [allProfiles, myProfile?.id])

  async function handleRename() {
    if (!nameValue.trim() || !myProfile) return
    setBusy(true)
    await renameProfile(myProfile.id, nameValue.trim())
    setCurrentProfile({ ...myProfile, name: nameValue.trim() })
    setEditingName(false)
    setBusy(false)
    showToast('Name geändert')
  }

  async function handleColorChange(color: string | null) {
    if (!myProfile) return
    setBusy(true)
    await updateProfileColor(myProfile.id, color)
    setCurrentProfile({ ...myProfile, color: color ?? undefined })
    setShowColorPicker(false)
    setBusy(false)
    showToast(color ? 'Farbe geändert' : 'Farbe entfernt')
  }

  async function handlePasswordChange() {
    if (newPw !== confirmPw) { setPwError('Passwörter stimmen nicht überein'); return }
    if (newPw.length < 2) { setPwError('Passwort zu kurz'); return }
    if (!myProfile) return
    setBusy(true); setPwError('')
    try {
      const result = await changePassword(myProfile.id, oldPw, newPw)
      if (result.success) {
        setPwSuccess(true)
        setOldPw(''); setNewPw(''); setConfirmPw('')
        showToast('Passwort geändert')
      } else {
        setPwError(result.error || 'Fehler beim Ändern')
      }
    } catch (e: any) {
      setPwError(e.message)
    }
    setBusy(false)
  }

  async function handleDelete() {
    if (!myProfile) return
    if (!confirm('Profil wirklich löschen? Alle Stats und Highscores gehen verloren. Du wirst abgemeldet.')) return
    setBusy(true)
    await deleteProfile(myProfile.id)
    setBusy(false)
    showToast('Profil gelöscht')
    auth.logout()
  }

  const profile = currentProfile || myProfile

  const s = useMemo(() => ({
    headerRow: { ...styles.headerRow },
    backBtn: { ...styles.backBtn },
    h1: { margin: 0, color: colors.fg } as React.CSSProperties,
    card: { ...styles.card },
    centerPage: { ...styles.centerPage },
    centerInner: { ...styles.centerInner },
    page: { ...styles.page },
    input: {
      width: '100%', padding: '10px 12px', borderRadius: 8,
      border: `1px solid ${colors.border}`, background: colors.bgInput,
      color: colors.fg, fontSize: 15, outline: 'none', boxSizing: 'border-box' as const,
    },
    btn: {
      padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`,
      background: colors.bgMuted, color: colors.fg, cursor: 'pointer', fontSize: 14, fontWeight: 600,
    } as React.CSSProperties,
    btnPrimary: {
      padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.accent}`,
      background: colors.accent, color: isArcade ? '#0a0a0a' : '#fff',
      cursor: 'pointer', fontSize: 14, fontWeight: 700,
    } as React.CSSProperties,
    btnDanger: {
      padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.error}`,
      background: 'transparent', color: colors.error,
      cursor: 'pointer', fontSize: 14, fontWeight: 600,
    } as React.CSSProperties,
    section: {
      padding: '14px 16px', borderRadius: 12, background: colors.bgCard,
      boxShadow: isArcade ? '0 1px 4px rgba(0,0,0,0.4)' : '0 1px 4px rgba(0,0,0,0.08)',
      cursor: 'pointer',
    } as React.CSSProperties,
    sectionTitle: {
      fontSize: 15, fontWeight: 700, color: colors.fg, margin: 0,
    } as React.CSSProperties,
    sectionSub: {
      fontSize: 12, color: colors.fgMuted, marginTop: 2,
    } as React.CSSProperties,
    colorPickerGrid: {
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))',
      gap: 8, padding: 12, background: colors.bgMuted, borderRadius: 12, marginTop: 10,
    } as React.CSSProperties,
    colorOption: (color: string, isUsed: boolean, isSelected: boolean) => ({
      width: 36, height: 36, borderRadius: 8, background: color,
      opacity: isUsed ? 0.3 : 1, cursor: isUsed ? 'not-allowed' : 'pointer',
      border: isSelected ? `3px solid ${colors.fg}` : '2px solid transparent',
      transition: 'transform 0.12s ease, opacity 0.12s ease',
    }),
    colorDot: (color?: string) => ({
      width: 24, height: 24, borderRadius: 9999, background: color || colors.fgDim,
      boxShadow: `0 0 0 2px ${colors.bgCard}, 0 0 0 4px ${color || colors.fgDim}`,
      flexShrink: 0,
    }),
  }), [styles, colors, isArcade])

  if (!profile) {
    return (
      <div style={s.page}>
        <div style={s.headerRow}>
          <h2 style={s.h1}>Profil bearbeiten</h2>
          <button style={s.backBtn} onClick={onBack}>← Zurück</button>
        </div>
        <div style={s.centerPage}>
          <div style={s.centerInner}>
            <div style={s.card}>
              <div style={{ color: colors.fgMuted, textAlign: 'center' }}>Kein Profil gefunden.</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.headerRow}>
        <h2 style={s.h1}>Profil bearbeiten</h2>
        <button style={s.backBtn} onClick={onBack}>← Zurück</button>
      </div>

      <div style={s.centerPage}>
        <div style={s.centerInner}>

          {/* Profil-Header mit Name & Farbe */}
          <div style={{ ...s.card, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={s.colorDot(profile.color)} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: colors.fg }}>{profile.name}</div>
              <div style={{ fontSize: 12, color: colors.fgMuted }}>
                {auth.isAdmin ? 'Admin' : 'Spieler'}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>

            {/* 1. Umbenennen */}
            <div style={s.section} onClick={() => !editingName && setEditingName(true)}>
              <div style={s.sectionTitle}>Umbenennen</div>
              <div style={s.sectionSub}>Anzeigename ändern</div>
              {editingName && (
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }} onClick={e => e.stopPropagation()}>
                  <input
                    autoFocus
                    value={nameValue}
                    onChange={e => setNameValue(e.target.value)}
                    placeholder="Neuer Name"
                    style={s.input}
                    onKeyDown={e => e.key === 'Enter' && handleRename()}
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setEditingName(false); setNameValue(profile.name) }} style={s.btn}>Abbrechen</button>
                    <button onClick={handleRename} disabled={busy || !nameValue.trim()} style={s.btnPrimary}>
                      {busy ? 'Speichere...' : 'Speichern'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Farbe ändern */}
            <div style={s.section} onClick={() => setShowColorPicker(!showColorPicker)}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={s.sectionTitle}>Farbe ändern</div>
                  <div style={s.sectionSub}>Profilfarbe für Charts & Spielerkennung</div>
                </div>
                {profile.color && (
                  <span style={{ width: 20, height: 20, borderRadius: 6, background: profile.color }} />
                )}
              </div>
              {showColorPicker && (
                <div style={s.colorPickerGrid} onClick={e => e.stopPropagation()}>
                  {PROFILE_COLORS.map(color => {
                    const isUsedByOther = usedColors.includes(color)
                    const isSelected = profile.color === color
                    return (
                      <button
                        key={color}
                        disabled={isUsedByOther || busy}
                        onClick={() => !isUsedByOther && handleColorChange(color)}
                        onMouseEnter={() => !isUsedByOther && setPreviewColor(color)}
                        onMouseLeave={() => setPreviewColor(null)}
                        style={s.colorOption(color, isUsedByOther, isSelected)}
                        title={isUsedByOther ? 'Diese Farbe ist bereits vergeben' : color}
                      />
                    )
                  })}
                  {profile.color && (
                    <button
                      style={{
                        gridColumn: '1 / -1', padding: '8px 12px', borderRadius: 8,
                        border: `1px dashed ${colors.border}`, background: 'transparent',
                        color: colors.fgMuted, fontSize: 13, cursor: 'pointer', marginTop: 4,
                      }}
                      onClick={() => handleColorChange(null)}
                      disabled={busy}
                    >
                      Farbe entfernen
                    </button>
                  )}
                  <div style={{ gridColumn: '1 / -1', marginTop: 8, padding: 8, background: colors.bgSoft, borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: colors.fgMuted, marginBottom: 6, textAlign: 'center' }}>
                      Vorschau im Chart
                    </div>
                    <ColorPreviewChart
                      playerColor={previewColor || profile.color || colors.fgDim}
                      bgColor={colors.bg}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. Passwort ändern */}
            <div style={s.section} onClick={() => !showPasswordForm && setShowPasswordForm(true)}>
              <div style={s.sectionTitle}>Passwort ändern</div>
              <div style={s.sectionSub}>Eigenes Passwort ändern</div>
              {showPasswordForm && (
                <div style={{ marginTop: 10, display: 'grid', gap: 10 }} onClick={e => e.stopPropagation()}>
                  <input type="password" value={oldPw} onChange={e => { setOldPw(e.target.value); setPwError('') }}
                    placeholder="Altes Passwort" style={s.input} />
                  <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                    placeholder="Neues Passwort" style={s.input} />
                  <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handlePasswordChange()}
                    placeholder="Neues Passwort bestätigen" style={s.input} />
                  {pwError && <div style={{ color: colors.error, fontSize: 13, fontWeight: 600 }}>{pwError}</div>}
                  {pwSuccess && <div style={{ color: colors.success, fontSize: 13, fontWeight: 600 }}>Passwort geändert!</div>}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setShowPasswordForm(false); setOldPw(''); setNewPw(''); setConfirmPw(''); setPwError(''); setPwSuccess(false) }} style={s.btn}>Abbrechen</button>
                    <button onClick={handlePasswordChange} disabled={busy || !oldPw || !newPw || !confirmPw} style={s.btnPrimary}>
                      {busy ? 'Wird geändert...' : 'Ändern'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Profil löschen */}
            <div style={{ ...s.section, cursor: 'pointer', marginTop: 8 }} onClick={handleDelete}>
              <div style={{ ...s.sectionTitle, color: colors.error }}>Profil löschen</div>
              <div style={s.sectionSub}>Profil, Stats & Highscores unwiderruflich löschen</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
