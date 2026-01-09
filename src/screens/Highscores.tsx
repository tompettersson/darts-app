import React from 'react'
import { ui } from '../ui'
import { useNav } from '../nav'

export default function Highscores() {
  const nav = useNav()
  return (
    <div style={ui.page}>
      <div style={ui.card}>
        <div style={ui.headerRow}>
          <div>
            <h2 style={{ margin: 0 }}>Highscores</h2>
            <div style={ui.sub}>Platzhalter – Inhalte als nächster Schritt</div>
          </div>
          <button style={ui.backBtn} onClick={() => nav.pop()}>
            ← Zurück
          </button>
        </div>
      </div>

      <div style={ui.card}>
        <div style={{ opacity: 0.8 }}>Hier kommen Leaderboards/Bestleistungen rein.</div>
      </div>
    </div>
  )
}
