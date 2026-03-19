import React, { useEffect, useMemo, useState } from 'react'
import { getProfiles, renameProfile, deleteProfile, createProfile, updateProfileColor, type Profile } from '../storage'
import { ui, getThemedUI, PROFILE_COLORS } from '../ui'
import { useTheme } from '../ThemeProvider'

// Beispiel-Chart zur Farbvorschau
function ColorPreviewChart({ playerColor, bgColor }: { playerColor: string; bgColor: string }) {
  // Zwei Gegner-Farben (werden nicht vom Spieler verwendet)
  const opponent1 = '#64748b' // Slate - dezent
  const opponent2 = '#78716c' // Stone - dezent

  // Beispiel-Daten: 3 Spieler, 8 Würfe, Score geht runter von 501
  const data = [
    { p1: 501, p2: 501, p3: 501 },
    { p1: 441, p2: 461, p3: 421 }, // 60, 40, 80
    { p1: 341, p2: 401, p3: 321 }, // 100, 60, 100
    { p1: 241, p2: 321, p3: 221 }, // 100, 80, 100
    { p1: 161, p2: 261, p3: 141 }, // 80, 60, 80
    { p1: 101, p2: 181, p3: 81 },  // 60, 80, 60
    { p1: 41, p2: 121, p3: 41 },   // 60, 60, 40
    { p1: 0, p2: 61, p3: 9 },      // 41 (checkout!), 60, 32
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
      {/* Hintergrund */}
      <rect x={0} y={0} width={width} height={height} fill={bgColor} rx={8} />

      {/* Grid-Linien */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
        <line
          key={i}
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top + pct * chartHeight}
          y2={padding.top + pct * chartHeight}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={1}
        />
      ))}

      {/* Gegner 1 - dezent im Hintergrund */}
      <path
        d={makePath('p2')}
        fill="none"
        stroke={opponent1}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.5}
      />

      {/* Gegner 2 - dezent im Hintergrund */}
      <path
        d={makePath('p3')}
        fill="none"
        stroke={opponent2}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.5}
      />

      {/* Spieler-Linie - prominent */}
      <path
        d={makePath('p1')}
        fill="none"
        stroke={playerColor}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 4px ${playerColor})` }}
      />

      {/* Checkout-Punkt */}
      <circle
        cx={xScale(data.length - 1)}
        cy={yScale(0)}
        r={5}
        fill={playerColor}
        stroke="#fff"
        strokeWidth={2}
      />

      {/* Labels */}
      <text x={padding.left + 4} y={padding.top + 14} fill={playerColor} fontSize={11} fontWeight={700}>Du</text>
      <text x={width - padding.right - 4} y={yScale(61) - 4} fill={opponent1} fontSize={9} textAnchor="end" opacity={0.7}>Spieler 2</text>
      <text x={width - padding.right - 4} y={yScale(9) + 12} fill={opponent2} fontSize={9} textAnchor="end" opacity={0.7}>Spieler 3</text>
    </svg>
  )
}

export default function ProfileList({ onBack }: { onBack: () => void }) {
  // Theme System
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])
  const [profiles, setProfiles] = useState<Profile[]>(() => getProfiles())
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [colorPickerProfileId, setColorPickerProfileId] = useState<string | null>(null)
  const [previewColor, setPreviewColor] = useState<string | null>(null)

  useEffect(() => {
    setProfiles(getProfiles())
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return !q ? profiles : profiles.filter(p => p.name.toLowerCase().includes(q))
  }, [profiles, search])

  // Welche Farben sind bereits vergeben?
  const usedColors = useMemo(() =>
    profiles.filter(p => p.color).map(p => p.color!),
  [profiles])

  async function handleRename(id: string) {
    if (!editingName.trim()) return
    setBusy(id)
    await renameProfile(id, editingName.trim())
    setProfiles(getProfiles())
    setEditingId(null)
    setEditingName('')
    setBusy(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Profil wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.')) return
    setBusy(id)
    await deleteProfile(id)
    setProfiles(getProfiles())
    setBusy(null)
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setBusy('create')
    await createProfile({ name: newName.trim() })
    setProfiles(getProfiles())
    setNewName('')
    setBusy(null)
  }

  async function handleColorChange(profileId: string, color: string | null) {
    setBusy(profileId)
    await updateProfileColor(profileId, color)
    setProfiles(getProfiles())
    setColorPickerProfileId(null)
    setBusy(null)
  }

  // lokale, einfache Styles (Theme-aware)
  const s = useMemo(() => ({
    headerRow: { ...styles.headerRow },
    backBtn: { ...styles.backBtn },
    h1: { margin: 0, color: colors.fg },
    fieldRow: { display: 'flex', gap: 8, alignItems: 'center' as const },
    input: {
      flex: 1,
      padding: '8px 10px',
      borderRadius: 8,
      border: `1px solid ${colors.border}`,
      background: colors.bgInput,
      color: colors.fg,
      outline: 'none',
    },
    btn: {
      padding: '8px 10px',
      borderRadius: 8,
      border: `1px solid ${colors.border}`,
      background: colors.bgMuted,
      color: colors.fg,
      cursor: 'pointer',
    },
    btnPrimary: {
      padding: '8px 10px',
      borderRadius: 8,
      border: `1px solid ${colors.accent}`,
      background: colors.accent,
      color: isArcade ? '#0a0a0a' : '#fff',
      cursor: 'pointer',
    },
    btnDanger: {
      padding: '8px 10px',
      borderRadius: 8,
      border: `1px solid ${colors.error}`,
      background: colors.error,
      color: '#fff',
      cursor: 'pointer',
    },
    list: { display: 'grid', gap: 8 },
    row: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: 10,
      borderRadius: 12,
      background: colors.bgCard,
      boxShadow: isArcade ? '0 1px 4px rgba(0,0,0,0.4)' : '0 1px 4px rgba(0,0,0,0.08)',
    },
    nameWrap: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
      flex: 1,
    },
    colorDot: (color?: string, clickable = false) => ({
      width: clickable ? 28 : 10,
      height: clickable ? 28 : 10,
      borderRadius: 9999,
      background: color || colors.fgDim,
      boxShadow: clickable
        ? `0 0 0 2px ${colors.bgCard}, 0 0 0 4px ${color || colors.fgDim}`
        : 'inset 0 0 0 1px rgba(0,0,0,0.15)',
      cursor: clickable ? 'pointer' : 'default',
      transition: 'transform 0.15s ease',
      flexShrink: 0,
    }),
    colorPickerGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: 8,
      padding: 12,
      background: colors.bgMuted,
      borderRadius: 12,
      marginTop: 8,
    },
    colorOption: (color: string, isUsed: boolean, isSelected: boolean) => ({
      width: 36,
      height: 36,
      borderRadius: 8,
      background: color,
      opacity: isUsed ? 0.3 : 1,
      cursor: isUsed ? 'not-allowed' : 'pointer',
      border: isSelected ? `3px solid ${colors.fg}` : '2px solid transparent',
      transition: 'transform 0.12s ease, opacity 0.12s ease',
    }),
    removeColorBtn: {
      gridColumn: 'span 5',
      padding: '8px 12px',
      borderRadius: 8,
      border: `1px dashed ${colors.border}`,
      background: 'transparent',
      color: colors.fgMuted,
      fontSize: 13,
      cursor: 'pointer',
      marginTop: 4,
    },
    truncate: {
      whiteSpace: 'nowrap' as const,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      fontWeight: 500,
      color: colors.fg,
    },
    muted: { fontSize: 12, color: colors.fgMuted },
    actions: { display: 'flex', gap: 8, marginLeft: 'auto' },
    cardGap: { display: 'grid', gap: 8 },
    card: { ...styles.card },
    centerPage: { ...styles.centerPage },
    centerInner: { ...styles.centerInner },
    page: { ...styles.page },
  }), [styles, colors, isArcade])

  return (
    <div style={s.page}>
      <div style={s.headerRow}>
        <h2 style={s.h1}>Profile verwalten</h2>
        <button style={s.backBtn} onClick={onBack}>← Zurück</button>
      </div>

      <div style={s.centerPage}>
        <div style={s.centerInner}>
          {/* Suchzeile */}
          <div style={{ ...s.card, marginBottom: 12 }}>
            <div style={s.fieldRow}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Suche nach Namen…"
                style={s.input}
                aria-label="Profile durchsuchen"
              />
            </div>
          </div>

          {/* Neues Profil anlegen */}
          <div style={{ ...s.card, marginBottom: 12 }}>
            <div style={s.fieldRow}>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Neues Profil anlegen…"
                style={s.input}
                aria-label="Name für neues Profil"
              />
              <button
                disabled={busy === 'create'}
                onClick={handleCreate}
                style={s.btnPrimary}
              >
                {busy === 'create' ? 'Speichere…' : 'Anlegen'}
              </button>
            </div>
          </div>

          {/* Liste */}
          <div style={s.card}>
            <div style={s.cardGap}>
              {filtered.length === 0 && (
                <div style={s.muted}>Keine Profile gefunden.</div>
              )}

              {filtered.map(p => (
                <div key={p.id}>
                  <div style={s.row}>
                    {editingId === p.id ? (
                      <>
                        <input
                          autoFocus
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          style={s.input}
                          aria-label="Profilname bearbeiten"
                        />
                        <button
                          disabled={busy === p.id}
                          onClick={() => handleRename(p.id)}
                          style={s.btnPrimary}
                        >
                          {busy === p.id ? 'Speichere…' : 'Speichern'}
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditingName('') }}
                          style={s.btn}
                        >
                          Abbrechen
                        </button>
                      </>
                    ) : (
                      <>
                        <div style={s.nameWrap}>
                          <span
                            style={s.colorDot(p.color, true)}
                            onClick={() => {
                              setColorPickerProfileId(colorPickerProfileId === p.id ? null : p.id)
                              setPreviewColor(null)
                            }}
                            title="Farbe wählen"
                          />
                          <div style={s.truncate}>{p.name}</div>
                        </div>
                        <div style={s.actions}>
                          <button
                            onClick={() => { setEditingId(p.id); setEditingName(p.name) }}
                            style={s.btn}
                          >
                            Umbenennen
                          </button>
                          <button
                            disabled={busy === p.id}
                            onClick={() => handleDelete(p.id)}
                            style={s.btnDanger}
                          >
                            Löschen
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Color Picker */}
                  {colorPickerProfileId === p.id && (
                    <div style={s.colorPickerGrid}>
                      {PROFILE_COLORS.map(color => {
                        const isUsedByOther = usedColors.includes(color) && p.color !== color
                        const isSelected = p.color === color
                        return (
                          <button
                            key={color}
                            disabled={isUsedByOther || busy === p.id}
                            onClick={() => !isUsedByOther && handleColorChange(p.id, color)}
                            onMouseEnter={() => !isUsedByOther && setPreviewColor(color)}
                            onMouseLeave={() => setPreviewColor(null)}
                            style={s.colorOption(color, isUsedByOther, isSelected)}
                            title={isUsedByOther ? 'Diese Farbe ist bereits vergeben' : color}
                          />
                        )
                      })}
                      {p.color && (
                        <button
                          style={s.removeColorBtn}
                          onClick={() => handleColorChange(p.id, null)}
                          disabled={busy === p.id}
                        >
                          Farbe entfernen
                        </button>
                      )}

                      {/* Chart Vorschau */}
                      <div style={{
                        gridColumn: 'span 5',
                        marginTop: 8,
                        padding: 8,
                        background: colors.bgSoft,
                        borderRadius: 10,
                      }}>
                        <div style={{ fontSize: 11, color: colors.fgMuted, marginBottom: 6, textAlign: 'center' }}>
                          Vorschau im Chart
                        </div>
                        <ColorPreviewChart
                          playerColor={previewColor || p.color || colors.fgDim}
                          bgColor={colors.bg}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...s.muted, textAlign: 'center', marginTop: 8 }}>
            Gäste werden nicht gespeichert und erscheinen nicht in den Statistiken.
          </div>
        </div>
      </div>
    </div>
  )
}
