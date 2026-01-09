// src/screens/CreateProfile.tsx
import React, { useMemo, useState, useRef, useEffect } from 'react'
import { getProfiles, upsertProfile } from '../storage'
import { ui } from '../ui'

type Props = {
  onDone?: () => void
  onCancel?: () => void
}

export default function CreateProfile({ onDone, onCancel }: Props) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
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
  const canSave = !saving && !invalid

  const handleSave = () => {
    if (!canSave) return
    setSaving(true)
    upsertProfile(name.trim())
    setSaving(false)
    onDone?.()
  }

  return (
    <div style={ui.page}>
      <div style={ui.headerRow}>
        <h2 style={{ margin: 0 }}>Neues Profil</h2>
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
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z. B. Thomas"
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

              {/* Hinweise/Validation */}
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                2–24 Zeichen. (Gäste erstellst du später direkt im Spiel.)
              </div>
              {exists && (
                <div style={{ fontSize: 12, color: '#b91c1c' }}>
                  Es gibt bereits ein Profil mit diesem Namen – es wird aktualisiert.
                </div>
              )}
              {tooShort && name.length > 0 && (
                <div style={{ fontSize: 12, color: '#b91c1c' }}>
                  Name ist zu kurz.
                </div>
              )}
              {tooLong && (
                <div style={{ fontSize: 12, color: '#b91c1c' }}>
                  Name ist zu lang.
                </div>
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
                  Speichern
                </button>
              </div>
            </div>
          </div>

          {/* kleiner Tipp */}
          <div style={{ ...ui.sub, marginTop: 10 }}>
            Tipp: Wenn Leute ohne Profil mitspielen, nutze im Spiel die „Gast hinzufügen“-Option.
          </div>
        </div>
      </div>
    </div>
  )
}
