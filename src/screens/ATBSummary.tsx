// src/screens/ATBSummary.tsx
// Zusammenfassung für Around the Block

import React, { useMemo } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getATBMatchById } from '../storage'
import {
  applyATBEvents,
  formatDuration,
  getModeLabel,
  getDirectionLabel,
  DEFAULT_ATB_CONFIG,
} from '../dartsAroundTheBlock'
import { computeATBMatchStats } from '../stats/computeATBStats'
import ATBDartboard from '../components/ATBDartboard'

// Spielerfarben (satte Farben, konsistent mit GameATB)
const PLAYER_COLORS = [
  '#3b82f6', // Blau (500))
  '#22c55e', // Grün (500))
  '#f97316', // Orange (500))
  '#ef4444', // Rot (500))
  '#a855f7', // Violett (500))
  '#14b8a6', // Türkis (500))
  '#eab308', // Gelb (500))
  '#ec4899', // Pink (500))
]

type Props = {
  matchId: string
  onBackToMenu: () => void
  onRematch: (matchId: string) => void
}

export default function ATBSummary({ matchId, onBackToMenu, onRematch }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const storedMatch = getATBMatchById(matchId)

  if (!storedMatch) {
    return (
      <div style={styles.page}>
        <p>Match nicht gefunden.</p>
        <button style={styles.backBtn} onClick={onBackToMenu}>← Zurück</button>
      </div>
    )
  }

  const state = applyATBEvents(storedMatch.events)
  const match = state.match

  if (!match) {
    return (
      <div style={styles.page}>
        <p>Match-Daten nicht verfügbar.</p>
        <button style={styles.backBtn} onClick={onBackToMenu}>← Zurück</button>
      </div>
    )
  }

  const winner = match.players.find(p => p.playerId === storedMatch.winnerId)
  const totalFields = match.sequence.length
  const matchStats = computeATBMatchStats(storedMatch)
  const config = match.config ?? DEFAULT_ATB_CONFIG
  const isPirate = config.gameMode === 'pirate'

  // Spieler nach Fortschritt sortieren (Gewinner zuerst)
  const sortedPlayers = [...match.players].sort((a, b) => {
    const progressA = state.currentIndexByPlayer[a.playerId] ?? 0
    const progressB = state.currentIndexByPlayer[b.playerId] ?? 0
    return progressB - progressA
  })

  // Piratenmodus: Spieler nach gewonnenen Feldern sortieren
  const pirateSortedPlayers = useMemo(() => {
    if (!isPirate || !state.pirateState) return []

    return [...match.players].sort((a, b) => {
      const fieldsA = Object.values(state.pirateState!.fieldWinners).filter(w => w === a.playerId).length
      const fieldsB = Object.values(state.pirateState!.fieldWinners).filter(w => w === b.playerId).length
      if (fieldsB !== fieldsA) return fieldsB - fieldsA
      // Tiebreaker: Gesamtpunkte
      const pointsA = state.pirateState!.totalScoreByPlayer[a.playerId] ?? 0
      const pointsB = state.pirateState!.totalScoreByPlayer[b.playerId] ?? 0
      return pointsB - pointsA
    })
  }, [isPirate, state.pirateState, match.players])

  // Piratenmodus: Feld-Besitzer für Dartboard
  const fieldOwners = useMemo(() => {
    if (!isPirate || !state.pirateState) return undefined

    const owners: Record<string, { playerId: string; color: string } | 'tie'> = {}
    const fieldWinners = state.pirateState.fieldWinners

    for (const [fieldKey, winnerId] of Object.entries(fieldWinners)) {
      if (winnerId === null) {
        owners[fieldKey] = 'tie'
      } else {
        const playerIndex = match.players.findIndex(p => p.playerId === winnerId)
        owners[fieldKey] = {
          playerId: winnerId,
          color: PLAYER_COLORS[playerIndex >= 0 ? playerIndex % PLAYER_COLORS.length : 0],
        }
      }
    }

    return owners
  }, [isPirate, state.pirateState, match.players])

  // Piratenmodus: Statistik pro Spieler
  const pirateStats = useMemo(() => {
    if (!isPirate || !state.pirateState) return []

    return match.players.map(p => {
      const fieldsWon = Object.values(state.pirateState!.fieldWinners).filter(w => w === p.playerId).length
      const ties = Object.values(state.pirateState!.fieldWinners).filter(w => w === null).length
      const totalScore = state.pirateState!.totalScoreByPlayer[p.playerId] ?? 0
      const isWinner = p.playerId === storedMatch.winnerId

      return {
        ...p,
        fieldsWon,
        ties,
        totalScore,
        isWinner,
        color: PLAYER_COLORS[match.players.findIndex(pl => pl.playerId === p.playerId) % PLAYER_COLORS.length],
      }
    }).sort((a, b) => {
      if (b.fieldsWon !== a.fieldsWon) return b.fieldsWon - a.fieldsWon
      return b.totalScore - a.totalScore
    })
  }, [isPirate, state.pirateState, match.players, storedMatch.winnerId])

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0 }}>Around the Block</h2>
        <button style={styles.backBtn} onClick={onBackToMenu}>
          ← Menü
        </button>
      </div>

      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, maxWidth: 500 }}>
          {/* Modus-Info */}
          <div style={{ ...styles.card, marginBottom: 16, padding: '10px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>
                {getModeLabel(match.mode)} · {getDirectionLabel(match.direction)}
              </span>
              {isPirate && (
                <span style={{
                  background: colors.accent,
                  color: colors.bg,
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                }}>
                  🏴‍☠️ Piratenmodus
                </span>
              )}
            </div>
          </div>

          {/* Gewinner */}
          {winner && !isPirate && (
            <div style={{ ...styles.card, marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: colors.fgMuted, marginBottom: 4 }}>
                Gewinner
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, color: colors.success, marginBottom: 8 }}>
                {winner.name}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: colors.accent }}>
                    {storedMatch.winnerDarts}
                  </div>
                  <div style={{ fontSize: 11, color: colors.fgMuted }}>Darts</div>
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: colors.warning }}>
                    {formatDuration(storedMatch.durationMs ?? 0)}
                  </div>
                  <div style={{ fontSize: 11, color: colors.fgMuted }}>Zeit</div>
                </div>
              </div>
            </div>
          )}

          {/* Piratenmodus: Gewinner mit Feldern */}
          {winner && isPirate && pirateStats.length > 0 && (
            <div style={{ ...styles.card, marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: colors.fgMuted, marginBottom: 4 }}>
                🏴‍☠️ Piratenmodus - Gewinner
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, color: colors.success, marginBottom: 8 }}>
                {winner.name}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: colors.accent }}>
                    {pirateStats.find(p => p.isWinner)?.fieldsWon ?? 0}
                  </div>
                  <div style={{ fontSize: 11, color: colors.fgMuted }}>Felder gewonnen</div>
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: colors.warning }}>
                    {pirateStats.find(p => p.isWinner)?.totalScore ?? 0}
                  </div>
                  <div style={{ fontSize: 11, color: colors.fgMuted }}>Punkte</div>
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: colors.fgDim }}>
                    {formatDuration(storedMatch.durationMs ?? 0)}
                  </div>
                  <div style={{ fontSize: 11, color: colors.fgMuted }}>Zeit</div>
                </div>
              </div>
            </div>
          )}

          {/* Piratenmodus: Dartboard mit Feldfarben */}
          {isPirate && fieldOwners && (
            <div style={{ ...styles.card, marginBottom: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ ...styles.sub, marginBottom: 12 }}>Feldverteilung</div>
              <ATBDartboard
                currentTarget={null}
                players={[]}
                size={280}
                fieldOwners={fieldOwners}
              />
              <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                {pirateStats.map(p => (
                  <div key={p.playerId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, background: p.color, opacity: 0.75 }} />
                    <span style={{ color: p.color, fontWeight: 600 }}>{p.name}: {p.fieldsWon}</span>
                  </div>
                ))}
                {(() => {
                  const ties = Object.values(state.pirateState?.fieldWinners ?? {}).filter(w => w === null).length
                  return ties > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 2, background: '#888', opacity: 0.75 }} />
                      <span style={{ color: '#888', fontWeight: 600 }}>Unentschieden: {ties}</span>
                    </div>
                  ) : null
                })()}
              </div>
            </div>
          )}

          {/* Spieler-Übersicht (klassischer Modus) */}
          {!isPirate && (
            <div style={{ ...styles.card, marginBottom: 16 }}>
              <div style={{ ...styles.sub, marginBottom: 8 }}>Ergebnisse</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {sortedPlayers.map((p, i) => {
                  const isWinner = p.playerId === storedMatch.winnerId
                  const progress = state.currentIndexByPlayer[p.playerId] ?? 0
                  const darts = state.dartsUsedByPlayer[p.playerId] ?? 0
                  const percent = (progress / totalFields) * 100

                  return (
                    <div
                      key={p.playerId}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: isWinner ? colors.successBg : colors.bgMuted,
                        border: isWinner ? `2px solid ${colors.success}` : `1px solid ${colors.border}`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontWeight: isWinner ? 700 : 500, color: isWinner ? colors.success : colors.fg }}>
                          {i + 1}. {p.name} {isWinner && '🏆'}
                        </span>
                        <span style={{ fontSize: 12, color: colors.fgMuted }}>
                          {darts} Darts
                        </span>
                      </div>
                      {/* Progress Bar */}
                      <div style={{ height: 6, background: colors.bgSoft, borderRadius: 3, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${percent}%`,
                            background: isWinner ? colors.success : colors.fgDim,
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 11, color: colors.fgMuted, marginTop: 4 }}>
                        {progress} / {totalFields} Felder
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Spieler-Übersicht (Piratenmodus) */}
          {isPirate && pirateStats.length > 0 && (
            <div style={{ ...styles.card, marginBottom: 16 }}>
              <div style={{ ...styles.sub, marginBottom: 8 }}>Rangliste</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {pirateStats.map((p, i) => {
                  const percent = (p.fieldsWon / totalFields) * 100

                  return (
                    <div
                      key={p.playerId}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: p.isWinner ? colors.successBg : colors.bgMuted,
                        border: p.isWinner ? `2px solid ${colors.success}` : `1px solid ${colors.border}`,
                        borderLeft: `4px solid ${p.color}`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontWeight: p.isWinner ? 700 : 500, color: p.isWinner ? colors.success : colors.fg }}>
                          {i + 1}. {p.name} {p.isWinner && '🏆'}
                        </span>
                        <span style={{ fontSize: 12, color: colors.fgMuted }}>
                          {p.totalScore} Punkte
                        </span>
                      </div>
                      {/* Felder-Bar */}
                      <div style={{ height: 6, background: colors.bgSoft, borderRadius: 3, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${percent}%`,
                            background: p.color,
                            opacity: 0.8,
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 11, color: colors.fgMuted, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                        <span>{p.fieldsWon} von {totalFields} Feldern</span>
                        <span>{(percent).toFixed(0)}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Match-Statistik */}
          {matchStats.length > 0 && (
            <div style={{ ...styles.card, marginBottom: 16, overflowX: 'auto' }}>
              <div style={{ ...styles.sub, marginBottom: 8 }}>Match-Statistik</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, color: colors.fgMuted, fontWeight: 600 }}>
                      Stat
                    </th>
                    {matchStats.map(s => (
                      <th
                        key={s.playerId}
                        style={{
                          textAlign: 'right',
                          padding: '6px 8px',
                          borderBottom: `1px solid ${colors.border}`,
                          color: s.isWinner ? colors.success : colors.fg,
                          fontWeight: 600,
                        }}
                      >
                        {s.playerName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, color: colors.fgMuted }}>Total Darts</td>
                    {matchStats.map(s => (
                      <td key={s.playerId} style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, fontWeight: 600 }}>
                        {s.totalDarts}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, color: colors.fgMuted }}>Triples</td>
                    {matchStats.map(s => (
                      <td key={s.playerId} style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, color: colors.warning, fontWeight: 600 }}>
                        {s.triples}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, color: colors.fgMuted }}>Doubles</td>
                    {matchStats.map(s => (
                      <td key={s.playerId} style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, color: colors.accent, fontWeight: 600 }}>
                        {s.doubles}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, color: colors.fgMuted }}>Singles</td>
                    {matchStats.map(s => (
                      <td key={s.playerId} style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `1px solid ${colors.border}` }}>
                        {s.singles}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, color: colors.fgMuted }}>Misses</td>
                    {matchStats.map(s => (
                      <td key={s.playerId} style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, color: colors.error }}>
                        {s.misses}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, color: colors.fgMuted }}>Hit Rate</td>
                    {matchStats.map(s => (
                      <td key={s.playerId} style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, color: colors.success, fontWeight: 600 }}>
                        {s.hitRate.toFixed(1)}%
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 8px', color: colors.fgMuted }}>Ø Darts/Feld</td>
                    {matchStats.map(s => (
                      <td key={s.playerId} style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>
                        {s.avgDartsPerField.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Aktionen */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onRematch(matchId)}
              style={{ ...styles.pill, flex: 1 }}
            >
              Rematch
            </button>
            <button
              onClick={onBackToMenu}
              style={{ ...styles.backBtn, flex: 1 }}
            >
              Menü
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
