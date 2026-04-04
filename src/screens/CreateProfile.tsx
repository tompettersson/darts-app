// src/screens/CreateProfile.tsx
import React, { useMemo, useState, useRef, useEffect } from 'react'
import { getProfiles, saveProfiles } from '../storage'
import { createProfileWithPassword } from '../auth/api'
import { ui } from '../ui'
import { showToast } from '../components/Toast'

type Props = {
  onDone?: () => void
  onCancel?: () => void
}

export default function CreateProfile({ onDone, onCancel }: Props) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const profiles = getProfiles()
  const exists = useMemo(
    () => profiles.some(p => p.name.trim().toLowerCase() === name.trim().toLowerCase()),
    [profiles, name]
  )

  const tooShort = name.trim().length < 2
  const tooLong = name.trim().length > 24
  const invalid = tooShort || tooLong
  const canSave = !saving && !invalid && !exists

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError('')
    const defaultPw = `${name.trim()}1`
    try {
      const result = await createProfileWithPassword(name.trim(), defaultPw)
      if (result.success && result.id) {
        const list = getProfiles()
        if (!list.some(p => p.id === result.id)) {
          const ts = new Date().toISOString()
          list.push({ id: result.id, name: result.name || name.trim(), createdAt: ts, updatedAt: ts })
          saveProfiles(list)
        }
        showToast(`Profil "${result.name || name.trim()}" erstellt (Passwort: ${defaultPw})`)
        onDone?.()
      } else {
        setError(result.error || 'Fehler beim Erstellen')
        setSaving(false)
      }
    } catch (e: any) {
      setError(e.message || 'Fehler beim Erstellen')
      setSaving(false)
    }
  }

  return (
    <div style={ui.page}>
      <div style={ui.headerRow}>
        <h2 style={{ margin: 0 }}>Neues Profil erstellen</h2>
        {onCancel ? <button style={ui.backBtn} onClick={onCancel}>← Zurück</button> : null}
      </div>

      <div style={ui.centerPage}>
        <div style={ui.centerInner}>
          <div style={ui.card}>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={ui.sub}>Name</span>
                <input
                  ref={inputRef}
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder="z. B. Leo"
                  maxLength={32}
                  style={{
                    height: 40,
                    borderRadius: 10,
                    border: '1px solid #e5e7eb',
                    padding: '8px 12px',
                    fontSize: 14,
                  }}
                />
              </label>

              <div style={{ fontSize: 12, color: '#6b7280' }}>
                Passwort wird automatisch auf {name.trim() ? `"${name.trim()}1"` : '"Name1"'} gesetzt.
                Kann später in den Einstellungen geändert werden.
              </div>

              {exists && (
                <div style={{ fontSize: 12, color: '#b91c1c' }}>
                  Es gibt bereits ein Profil mit diesem Namen.
                </div>
              )}
              {tooShort && name.length > 0 && (
                <div style={{ fontSize: 12, color: '#b91c1c' }}>Name ist zu kurz (min. 2 Zeichen).</div>
              )}
              {tooLong && (
                <div style={{ fontSize: 12, color: '#b91c1c' }}>Name ist zu lang (max. 24 Zeichen).</div>
              )}
              {error && (
                <div style={{ fontSize: 12, color: '#b91c1c' }}>{error}</div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                {onCancel ? <button style={ui.backBtn} onClick={onCancel}>Abbrechen</button> : null}
                <button
                  onClick={handleSave}
                  disabled={!canSave}
                  style={{
                    ...ui.backBtn,
                    ...(canSave ? { borderColor: '#111827', background: '#111827', color: '#fff', fontWeight: 700 } : {}),
                  }}
                >
                  {saving ? 'Wird erstellt...' : 'Erstellen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
