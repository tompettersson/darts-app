// src/multiplayer/ConnectionBadge.tsx
// Small badge showing multiplayer connection status during a game.

import React from 'react'
import type { ConnectionStatus } from './useMultiplayerRoom'

type Props = {
  status: ConnectionStatus
  playerCount: number
}

export default function ConnectionBadge({ status, playerCount }: Props) {
  const colors: Record<ConnectionStatus, string> = {
    connected: '#16a34a',
    connecting: '#eab308',
    disconnected: '#dc2626',
    error: '#dc2626',
  }

  const labels: Record<ConnectionStatus, string> = {
    connected: 'Online',
    connecting: 'Verbinde...',
    disconnected: 'Offline',
    error: 'Fehler',
  }

  const color = colors[status]

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: 99,
      background: `${color}15`,
      border: `1px solid ${color}30`,
      fontSize: 12,
      fontWeight: 600,
      color,
    }}>
      <div style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        animation: status === 'connecting' ? 'pulse 1.5s infinite' : undefined,
      }} />
      {labels[status]}
      {status === 'connected' && (
        <span style={{ color: '#64748b', marginLeft: 2 }}>
          {playerCount} Spieler
        </span>
      )}
    </div>
  )
}
