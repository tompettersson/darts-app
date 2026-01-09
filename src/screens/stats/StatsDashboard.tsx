// src/screens/stats/StatsDashboard.tsx
import React, { useState } from 'react'
import PlayersOverview from './PlayersOverview'
import CricketStatsView from './CricketStatsView'
import X01QuickTiles from '././X01QuickTiles' // ← NEU
import { ui } from '../../ui'
import CricketHitMaps from './CricketHitMaps'

type Props = {
  onBack: () => void
  onShowPlayer?: (playerId: string) => void
  onOpenMatch?: (matchId: string) => void
  onOpenCricketMatch?: (matchId: string) => void
  onOpenHallOfFame?: () => void
}

/**
 * Zentraler Stats-Hub.
 * Tabs:
 *  - X01     -> QuickTiles (Sparklines) + PlayersOverview
 *  - Cricket -> CricketStatsView
 */
export default function StatsDashboard({
  onBack,
  onShowPlayer,
  onOpenHallOfFame,
}: Props) {
  const [tab, setTab] = useState<'x01' | 'cricket'>('x01')

  // Styles für Tab-Buttons
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid ' + (active ? '#0ea5e9' : 'transparent'),
    background: active ? '#e0f2fe' : 'transparent',
    color: active ? '#0369a1' : '#0f172a',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
    lineHeight: 1.2,
  })

  return (
    <div style={ui.page}>
      {/* Header-Card inkl. Tabs + Actions */}
      <div style={ui.card}>
        <div style={{ ...ui.headerRow, flexWrap: 'wrap', rowGap: 8 }}>
          {/* Left side: Titel + Subtitle */}
          <div style={{ minWidth: 0, flexGrow: 1 }}>
            <h2 style={{ margin: 0 }}>Statistiken</h2>
            <div style={ui.sub}>Langzeit-Leistungen, Bestwerte & Trends</div>
          </div>

          {/* Right side: Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {onOpenHallOfFame && (
              <button
                style={{
                  ...ui.backBtn,
                  borderColor: '#111827',
                  background: '#111827',
                  color: '#fff',
                  fontWeight: 700,
                }}
                onClick={onOpenHallOfFame}
              >
                Hall of Fame →
              </button>
            )}

            <button style={ui.backBtn} onClick={onBack}>
              ← Menü
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            background: '#f8fafc',
            borderRadius: 10,
            padding: 4,
            flexWrap: 'wrap',
            marginTop: 12,
          }}
        >
          <button
            style={tabBtn(tab === 'x01')}
            onClick={() => setTab('x01')}
          >
            X01
          </button>

          <button
            style={tabBtn(tab === 'cricket')}
            onClick={() => setTab('cricket')}
          >
            Cricket
          </button>
        </div>
      </div>

      {/* Content */}
      {tab === 'x01' && (
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          {/* NEU: Schnellüberblick-Kacheln mit Sparklines */}
          <X01QuickTiles onShowPlayer={(pid) => onShowPlayer?.(pid)} />

          {/* Bestehende Übersicht */}
          <PlayersOverview onSelectPlayer={(pid) => onShowPlayer?.(pid)} />
        </div>
      )}

      {tab === 'cricket' && (
        <div style={{ marginTop: 12 }}>
          <CricketStatsView />
          {/* unten drunter */}
<div style={{ marginTop: 12 }}>
  <CricketHitMaps />
</div>

        </div>
      )}
    </div>
  )
}
