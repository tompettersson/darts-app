import React, { useEffect, useMemo, useState } from 'react'
import { getProfiles, renameProfile, deleteProfile, createProfile, type Profile } from '../storage'
import { ui } from '../ui'

export default function ProfileList({ onBack }: { onBack: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>(() => getProfiles())
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    setProfiles(getProfiles())
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return !q ? profiles : profiles.filter(p => p.name.toLowerCase().includes(q))
  }, [profiles, search])

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

  // lokale, einfache Styles (kompatibel zu deinem ui-Objekt)
  const s = {
    headerRow: { ...ui.headerRow },
    backBtn: { ...ui.backBtn },
    h1: { margin: 0 },
    fieldRow: { display: 'flex', gap: 8, alignItems: 'center' as const },
    input: {
      flex: 1,
      padding: '8px 10px',
      borderRadius: 8,
      border: '1px solid #ddd',
      outline: 'none',
    },
    btn: {
      padding: '8px 10px',
      borderRadius: 8,
      border: '1px solid #ddd',
      background: '#f6f6f6',
      cursor: 'pointer',
    },
    btnPrimary: {
      padding: '8px 10px',
      borderRadius: 8,
      border: '1px solid #111',
      background: '#111',
      color: '#fff',
      cursor: 'pointer',
    },
    btnDanger: {
      padding: '8px 10px',
      borderRadius: 8,
      border: '1px solid #b91c1c',
      background: '#dc2626',
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
      background: 'rgba(255,255,255,0.7)',
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    },
    nameWrap: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
      flex: 1,
    },
    colorDot: (color?: string) => ({
      width: 10, height: 10, borderRadius: 9999, background: color || '#777',
      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)',
    }),
    truncate: {
      whiteSpace: 'nowrap' as const,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      fontWeight: 500,
    },
    muted: { fontSize: 12, color: '#666' },
    actions: { display: 'flex', gap: 8, marginLeft: 'auto' },
    cardGap: { display: 'grid', gap: 8 },
    card: { ...ui.card },
    centerPage: { ...ui.centerPage },
    centerInner: { ...ui.centerInner },
    page: { ...ui.page },
  }

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
                <div key={p.id} style={s.row}>
                  {editingId === p.id ? (
                    <>
                      <input
                        autoFocus
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        style={s.input}
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
                        <span style={s.colorDot(p.color)} />
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
