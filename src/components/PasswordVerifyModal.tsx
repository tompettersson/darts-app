// src/components/PasswordVerifyModal.tsx
// Sequential password verification for multi-player game start
import React, { useState, useEffect, useRef } from 'react'
import { verifyPassword } from '../auth/api'
import { useAuth } from '../auth/AuthContext'
import { useTheme } from '../ThemeProvider'

type PlayerToVerify = {
  id: string
  name: string
  color?: string
}

type Props = {
  players: PlayerToVerify[]
  skipPlayerId?: string // Currently logged-in player (already verified)
  onSuccess: () => void
  onCancel: () => void
}

export default function PasswordVerifyModal({ players, skipPlayerId, onSuccess, onCancel }: Props) {
  const { colors, isArcade } = useTheme()
  const { isPlayerVerified, addVerifiedPlayer } = useAuth()
  // Filter: skip logged-in user, guests, and already-verified players on this device
  const toVerify = players.filter(p =>
    p.id !== skipPlayerId &&
    !p.id.startsWith('guest-') &&
    !p.id.startsWith('temp-') &&
    !isPlayerVerified(p.id)
  )

  const [currentIndex, setCurrentIndex] = useState(0)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // If nothing to verify, succeed immediately
    if (toVerify.length === 0) {
      onSuccess()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    inputRef.current?.focus()
  }, [currentIndex])

  if (toVerify.length === 0) return null

  const current = toVerify[currentIndex]
  if (!current) return null

  async function handleVerify() {
    if (!password) return
    setBusy(true)
    setError('')

    try {
      const result = await verifyPassword(current.id, password)
      if (result.valid) {
        // Add to verified players on this device (won't need password again)
        addVerifiedPlayer({ profileId: current.id, name: current.name, color: current.color })
        setPassword('')
        if (currentIndex + 1 >= toVerify.length) {
          onSuccess()
        } else {
          setCurrentIndex(i => i + 1)
        }
      } else {
        setError('Falsches Passwort')
        setPassword('')
      }
    } catch {
      setError('Verbindungsfehler')
    } finally {
      setBusy(false)
    }
  }

  const s = {
    overlay: {
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'grid',
      placeItems: 'center',
      zIndex: 9999,
      padding: 20,
    },
    modal: {
      background: colors.bgCard,
      borderRadius: 16,
      padding: 24,
      width: 'min(380px, 90vw)',
      boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      color: colors.fg,
    },
    title: {
      fontSize: 18,
      fontWeight: 800,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 13,
      color: colors.fgMuted,
      marginBottom: 16,
    },
    playerName: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 20,
      fontWeight: 800,
      marginBottom: 16,
    },
    dot: {
      width: 14,
      height: 14,
      borderRadius: 9999,
      background: current.color || colors.fgDim,
    },
    input: {
      width: '100%',
      padding: '12px 14px',
      borderRadius: 10,
      border: `1.5px solid ${error ? colors.error : colors.border}`,
      background: colors.bgInput,
      color: colors.fg,
      fontSize: 16,
      outline: 'none',
      boxSizing: 'border-box' as const,
    },
    error: {
      color: colors.error,
      fontSize: 13,
      fontWeight: 600,
      marginTop: 6,
    },
    buttons: {
      display: 'flex',
      gap: 8,
      marginTop: 16,
    },
    btnPrimary: {
      flex: 1,
      padding: '12px 16px',
      borderRadius: 10,
      border: 'none',
      background: colors.accent,
      color: isArcade ? '#0a0a0a' : '#fff',
      fontWeight: 700,
      fontSize: 15,
      cursor: 'pointer',
      opacity: busy ? 0.6 : 1,
    },
    btnCancel: {
      padding: '12px 16px',
      borderRadius: 10,
      border: `1px solid ${colors.border}`,
      background: 'transparent',
      color: colors.fgMuted,
      fontWeight: 600,
      fontSize: 15,
      cursor: 'pointer',
    },
    progress: {
      fontSize: 12,
      color: colors.fgMuted,
      textAlign: 'center' as const,
      marginTop: 12,
    },
  }

  return (
    <div style={s.overlay} onClick={onCancel}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.title}>Spieler bestätigen</div>
        <div style={s.subtitle}>Jeder Spieler muss sein Passwort eingeben</div>

        <div style={s.playerName}>
          <span style={s.dot} />
          {current.name}
        </div>

        <input
          ref={inputRef}
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleVerify()}
          placeholder={`Passwort für ${current.name}`}
          style={s.input}
          disabled={busy}
          autoFocus
        />

        {error && <div style={s.error}>{error}</div>}

        <div style={s.buttons}>
          <button style={s.btnCancel} onClick={onCancel}>Abbrechen</button>
          <button style={s.btnPrimary} onClick={handleVerify} disabled={busy || !password}>
            {busy ? 'Prüfe...' : 'Bestätigen'}
          </button>
        </div>

        {toVerify.length > 1 && (
          <div style={s.progress}>
            Spieler {currentIndex + 1} von {toVerify.length}
          </div>
        )}
      </div>
    </div>
  )
}
