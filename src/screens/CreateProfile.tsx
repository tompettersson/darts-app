// src/screens/CreateProfile.tsx
import React, { useMemo, useState, useRef, useEffect } from 'react'
import { getProfiles, upsertProfile } from '../storage'
import { createProfileWithPassword } from '../auth/api'
import { ui } from '../ui'
import { showToast } from '../components/Toast'

type Props = {
  onDone?: () => void
  onCancel?: () => void
}

export default function CreateProfile({ onDone, onCancel }: Props) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword
  const passwordTooShort = password.length > 0 && password.length < 2
  const canSave = !saving && !invalid && !exists && !passwordMismatch && !passwordTooShort

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError('')
    // Wenn kein Passwort gesetzt → Standardpasswort: {name}1
    const finalPassword = password.length > 0 ? password : `${name.trim()}1`
    try {
      // Versuche Server-seitig mit Passwort zu erstellen
      const result = await createProfileWithPassword(name.trim(), finalPassword)
      if (result.success) {
        // Auch lokal anlegen damit das Profil sofort im Cache ist
        upsertProfile(name.trim())
        showToast(`Profil "${name.trim()}" erstellt`)
        onDone?.()
      } else {
        setError(result.error || 'Fehler beim Erstellen')
        setSaving(false)
      }
    } catch (e: any) {
      // Falls Server nicht erreichbar, nur lokal anlegen
      upsertProfile(name.trim())
      showToast(`Profil "${name.trim()}" erstellt (offline)`)
      onDone?.()
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

              <label style={{ display: 'grid', gap: 6 }}>
                <span style={ui.sub}>Passwort</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  placeholder="Passwort wählen"
                  style={{
                    height: 40,
                    borderRadius: 10,
                    border: '1px solid #e5e7eb',
                    padding: '8px 12px',
                    fontSize: 14,
                  }}
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span style={ui.sub}>Passwort bestätigen</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder="Passwort wiederholen"
                  style={{
                    height: 40,
                    borderRadius: 10,
                    border: '1px solid #e5e7eb',
                    padding: '8px 12px',
                    fontSize: 14,
                  }}
                />
              </label>

              {/* Validation-Hinweise */}
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                Name: 2–24 Zeichen. Passwort optional — ohne Eingabe wird „{name.trim() || 'Name'}1" als Standardpasswort gesetzt.
              </div>
              {exists && (
                <div style={{ fontSize: 12, color: '#b91c1c' }}>
                  Es gibt bereits ein Profil mit diesem Namen.
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
              {passwordTooShort && (
                <div style={{ fontSize: 12, color: '#b91c1c' }}>
                  Passwort ist zu kurz (min. 2 Zeichen).
                </div>
              )}
              {passwordMismatch && (
                <div style={{ fontSize: 12, color: '#b91c1c' }}>
                  Passwörter stimmen nicht überein.
                </div>
              )}
              {error && (
                <div style={{ fontSize: 12, color: '#b91c1c' }}>
                  {error}
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
                  {saving ? 'Wird erstellt...' : 'Erstellen'}
                </button>
              </div>
            </div>
          </div>

          <div style={{ ...ui.sub, marginTop: 10 }}>
            Tipp: Wenn Leute ohne Profil mitspielen, nutze im Spiel die „Gast hinzufügen"-Option.
          </div>
        </div>
      </div>
    </div>
  )
}
