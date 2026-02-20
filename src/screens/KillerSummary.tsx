// src/screens/KillerSummary.tsx
// Match-Zusammenfassung fuer Killer Darts

import React, { useMemo, useState, useEffect } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getKillerMatchById } from '../storage'
import { applyKillerEvents, formatDuration, formatDart } from '../dartsKiller'
import { computeKillerMatchStats } from '../stats/computeKillerStats'
import type { KillerStoredMatch, KillerLogEntry } from '../types/killer'

// Spielerfarben (konsistent mit anderen Screens)
const PLAYER_COLORS = [
  '#3b82f6', // Blau
  '#22c55e', // Gruen
  '#f97316', // Orange
  '#ef4444', // Rot
  '#a855f7', // Violett
  '#14b8a6', // Tuerkis
  '#eab308', // Gelb
  '#ec4899', // Pink
]

// Medaillen fuer Top 3
const MEDALS = ['\u{1F947}', '\u{1F948}', '\u{1F949}']

// Log-Farben (konsistent mit GameKiller)
const LOG_COLORS: Record<KillerLogEntry['type'], string> = {
  qualifying: '#3b82f6', // Blau
  hit: '#f97316',        // Orange
  kill: '#ef4444',       // Rot
  heal: '#22c55e',       // Gruen
  info: '#9ca3af',       // Grau
}

type Props = {
  matchId: string
  onRematch?: () => void
  onBack: () => void
  readOnly?: boolean
}

export default function KillerSummary({ matchId, onRematch, onBack, readOnly }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const storedMatch = useMemo(() => getKillerMatchById(matchId) ?? null, [matchId])
  const [logExpanded, setLogExpanded] = useState(false)

  if (!storedMatch) {
    return (
      <div style={styles.page}>
        <div style={styles.centerPage}>
          <div style={styles.centerInner}>
            <p>Match nicht gefunden.</p>
            <button style={styles.backBtn} onClick={onBack}>\u2190 Zurueck</button>
          </div>
        </div>
      </div>
    )
  }

  return <KillerSummaryContent match={storedMatch} onRematch={onRematch} onBack={onBack} readOnly={readOnly} />
}

// ============================================================================
// Inner Content (nach Laden)
// ============================================================================

function KillerSummaryContent({
  match: storedMatch,
  onRematch,
  onBack,
  readOnly,
}: {
  match: KillerStoredMatch
  onRematch?: () => void
  onBack: () => void
  readOnly?: boolean
}) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])
  const [logExpanded, setLogExpanded] = useState(false)

  const state = useMemo(() => applyKillerEvents(storedMatch.events), [storedMatch.events])

  const startEvt = storedMatch.events.find(e => e.type === 'KillerMatchStarted')
  const players = startEvt?.type === 'KillerMatchStarted' ? startEvt.players : storedMatch.players
  const winnerId = storedMatch.winnerId ?? state.winnerId
  const winner = players.find(p => p.playerId === winnerId)

  // Final standings aus MatchFinished oder storedMatch
  const finalStandings = useMemo(() => {
    const finEvt = storedMatch.events.find(e => e.type === 'KillerMatchFinished')
    if (finEvt?.type === 'KillerMatchFinished') return finEvt.finalStandings
    return storedMatch.finalStandings ?? []
  }, [storedMatch])

  // Per-player Stats berechnen
  const playerStats = useMemo(() => {
    return players.map((p, idx) => {
      const stats = computeKillerMatchStats(storedMatch, p.playerId)
      const standing = finalStandings.find(s => s.playerId === p.playerId)
      const ps = state.players.find(ps => ps.playerId === p.playerId)
      return {
        playerId: p.playerId,
        name: p.name,
        color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
        stats,
        position: standing?.position ?? stats?.finalPosition ?? 0,
        livesRemaining: standing?.lives ?? ps?.lives ?? 0,
        targetNumber: ps?.targetNumber ?? stats?.targetNumber ?? null,
        isKiller: ps?.isKiller ?? stats?.isKiller ?? false,
        isEliminated: ps?.isEliminated ?? false,
        isWinner: p.playerId === winnerId,
      }
    }).sort((a, b) => {
      // Sortiere nach Position (1. zuerst), 0 ans Ende
      if (a.position === 0 && b.position === 0) return 0
      if (a.position === 0) return 1
      if (b.position === 0) return -1
      return a.position - b.position
    })
  }, [players, storedMatch, state, finalStandings, winnerId])

  // Gesamt-Darts
  const totalDartsAll = Object.values(state.dartsUsedByPlayer).reduce((a, b) => a + b, 0)
  const durationMs = storedMatch.durationMs ?? 0

  // Config-Info
  const config = state.config
  const qualifyingLabel = config.qualifyingRing === 'TRIPLE' ? 'Triple' : 'Double'

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0 }}>Killer</h2>
        <button style={styles.backBtn} onClick={onBack}>
          \u2190 Menu
        </button>
      </div>

      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, maxWidth: 500 }}>

          {/* Modus-Badge */}
          <div style={{ ...styles.card, marginBottom: 16, padding: '10px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>
                Killer \u2013 Ergebnis
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{
                  background: colors.accent,
                  color: colors.bg,
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                }}>
                  {qualifyingLabel} | {config.startingLives} Leben
                </span>
                {storedMatch.structure && storedMatch.structure.kind === 'legs' && storedMatch.structure.bestOfLegs > 1 && (
                  <span style={{
                    background: colors.warningBg,
                    color: colors.warning,
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                  }}>
                    Best of {storedMatch.structure.bestOfLegs} Legs
                  </span>
                )}
                {storedMatch.structure && storedMatch.structure.kind === 'sets' && (
                  <span style={{
                    background: colors.warningBg,
                    color: colors.warning,
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                  }}>
                    Bo{storedMatch.structure.bestOfSets}S / Bo{storedMatch.structure.legsPerSet}L
                  </span>
                )}
              </div>
            </div>

            {/* Leg/Set Wins */}
            {storedMatch.legWins && Object.values(storedMatch.legWins).some(v => v > 0) && (
              <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {players.map((p, idx) => {
                  const legW = storedMatch.legWins?.[p.playerId] ?? 0
                  const setW = storedMatch.setWins?.[p.playerId] ?? 0
                  return (
                    <span key={p.playerId} style={{ fontSize: 12, color: PLAYER_COLORS[idx % PLAYER_COLORS.length] }}>
                      {p.name}: {legW}L{storedMatch.structure?.kind === 'sets' ? ` / ${setW}S` : ''}
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {/* ============================================================ */}
          {/* 1. Winner Banner */}
          {/* ============================================================ */}
          {winnerId && winner ? (
            <div style={{ ...styles.card, marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: colors.fgMuted, marginBottom: 4 }}>
                Gewinner
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, color: colors.success, marginBottom: 8 }}>
                {'\u{1F3C6}'} {winner.name} gewinnt!
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: colors.fgDim }}>
                    {formatDuration(durationMs)}
                  </div>
                  <div style={{ fontSize: 11, color: colors.fgMuted }}>Dauer</div>
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: colors.accent }}>
                    {totalDartsAll}
                  </div>
                  <div style={{ fontSize: 11, color: colors.fgMuted }}>Darts gesamt</div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ ...styles.card, marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: colors.fgMuted, marginBottom: 4 }}>
                Ergebnis
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#888', marginBottom: 8 }}>
                Unentschieden!
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: colors.fgDim }}>
                    {formatDuration(durationMs)}
                  </div>
                  <div style={{ fontSize: 11, color: colors.fgMuted }}>Dauer</div>
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: colors.accent }}>
                    {totalDartsAll}
                  </div>
                  <div style={{ fontSize: 11, color: colors.fgMuted }}>Darts gesamt</div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* 2. Final Standings */}
          {/* ============================================================ */}
          <div style={{ ...styles.card, marginBottom: 16 }}>
            <div style={{ ...styles.sub, marginBottom: 8 }}>Endplatzierung</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: colors.fgMuted }}>#</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: colors.fgMuted }}>Spieler</th>
                    <th style={{ textAlign: 'center', padding: '6px 8px', color: colors.fgMuted }}>Zahl</th>
                    <th style={{ textAlign: 'center', padding: '6px 8px', color: colors.fgMuted }}>Leben</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: colors.fgMuted }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {playerStats.map((p) => {
                    const medal = p.position >= 1 && p.position <= 3 ? MEDALS[p.position - 1] : null
                    return (
                      <tr
                        key={p.playerId}
                        style={{
                          borderBottom: `1px solid ${colors.border}`,
                          background: p.isWinner ? colors.successBg : undefined,
                        }}
                      >
                        <td style={{ padding: '8px 8px', fontWeight: 600 }}>
                          {medal ?? `${p.position}.`}
                        </td>
                        <td style={{
                          padding: '8px 8px',
                          fontWeight: p.isWinner ? 700 : 500,
                          color: p.isWinner ? colors.success : p.color,
                        }}>
                          {p.name}
                        </td>
                        <td style={{ textAlign: 'center', padding: '8px 8px', fontWeight: 600 }}>
                          {p.targetNumber ?? '?'}
                        </td>
                        <td style={{ textAlign: 'center', padding: '8px 8px' }}>
                          {p.isEliminated ? (
                            <span style={{ color: colors.error }}>0</span>
                          ) : (
                            <span style={{ color: colors.success, fontWeight: 600 }}>{p.livesRemaining}</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', padding: '8px 8px' }}>
                          {p.isWinner ? (
                            <span style={{
                              background: colors.success,
                              color: '#000',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                            }}>
                              GEWINNER
                            </span>
                          ) : p.isKiller && !p.isEliminated ? (
                            <span style={{
                              background: colors.warning,
                              color: '#000',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                            }}>
                              KILLER
                            </span>
                          ) : p.isEliminated ? (
                            <span style={{
                              background: colors.errorBg,
                              color: colors.error,
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                            }}>
                              Eliminiert
                            </span>
                          ) : p.isKiller ? (
                            <span style={{
                              background: colors.warningBg,
                              color: colors.warning,
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                            }}>
                              KILLER
                            </span>
                          ) : (
                            <span style={{ color: colors.fgDim, fontSize: 11 }}>
                              Nicht qualifiziert
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ============================================================ */}
          {/* 3. Per-Player Stats Cards */}
          {/* ============================================================ */}
          <div style={{ ...styles.card, marginBottom: 16 }}>
            <div style={{ ...styles.sub, marginBottom: 12 }}>Spieler-Statistiken</div>
            <div style={{ display: 'grid', gap: 12 }}>
              {playerStats.map((p) => {
                const s = p.stats
                if (!s) return null

                return (
                  <div
                    key={p.playerId}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      background: p.isWinner ? colors.successBg : colors.bgMuted,
                      border: p.isWinner ? `2px solid ${colors.success}` : `1px solid ${colors.border}`,
                      borderLeft: `4px solid ${p.color}`,
                    }}
                  >
                    {/* Name + Position */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{
                        fontWeight: 700,
                        fontSize: 15,
                        color: p.isWinner ? colors.success : p.color,
                      }}>
                        {p.name}
                      </span>
                      <span style={{ fontSize: 12, color: colors.fgMuted }}>
                        Platz {s.finalPosition}
                      </span>
                    </div>

                    {/* Stats Grid */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '6px 16px',
                      fontSize: 12,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: colors.fgMuted }}>Zielzahl</span>
                        <span style={{ fontWeight: 600 }}>{s.targetNumber ?? '?'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: colors.fgMuted }}>Qualifiziert</span>
                        <span style={{ fontWeight: 600, color: s.qualifiedInRound ? colors.success : colors.fgDim }}>
                          {s.qualifiedInRound ? `Runde ${s.qualifiedInRound}` : '\u2013'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: colors.fgMuted }}>Total Kills</span>
                        <span style={{ fontWeight: 600, color: s.totalKills > 0 ? colors.error : colors.fgDim }}>
                          {s.totalKills}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: colors.fgMuted }}>Ueberlebte Runden</span>
                        <span style={{ fontWeight: 600 }}>{s.survivedRounds}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: colors.fgMuted }}>Geworfene Darts</span>
                        <span style={{ fontWeight: 600 }}>{s.totalDartsThrown}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: colors.fgMuted }}>Trefferquote</span>
                        <span style={{ fontWeight: 600, color: colors.accent }}>
                          {s.hitRate.toFixed(0)}%
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: colors.fgMuted }}>Leben verloren</span>
                        <span style={{ fontWeight: 600, color: s.livesLost > 0 ? colors.error : colors.fgDim }}>
                          {s.livesLost}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: colors.fgMuted }}>Leben geheilt</span>
                        <span style={{ fontWeight: 600, color: s.livesHealed > 0 ? colors.success : colors.fgDim }}>
                          {s.livesHealed}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ============================================================ */}
          {/* 4. Game Log (collapsible) */}
          {/* ============================================================ */}
          {state.log.length > 0 && (
            <div style={{ ...styles.card, marginBottom: 16 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
                onClick={() => setLogExpanded(!logExpanded)}
              >
                <span style={{ ...styles.sub, margin: 0 }}>
                  Spielprotokoll ({state.log.length} Eintraege)
                </span>
                <span style={{ fontSize: 14, color: colors.fgMuted, userSelect: 'none' }}>
                  {logExpanded ? '\u25B2' : '\u25BC'}
                </span>
              </div>

              {logExpanded && (
                <div style={{
                  maxHeight: 300,
                  overflowY: 'auto',
                  marginTop: 10,
                  display: 'grid',
                  gap: 2,
                }}>
                  {state.log.map((entry, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 12,
                        padding: '3px 6px',
                        borderRadius: 4,
                        background: colors.bgMuted,
                        color: LOG_COLORS[entry.type] ?? colors.fgMuted,
                        fontFamily: 'monospace',
                      }}
                    >
                      {entry.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* 5. Action Buttons */}
          {/* ============================================================ */}
          <div style={{ display: 'flex', gap: 8 }}>
            {onRematch && !readOnly && (
              <button
                onClick={onRematch}
                style={{
                  ...styles.pill,
                  flex: 1,
                  background: colors.success,
                  color: '#000',
                  border: `1px solid ${colors.success}`,
                  fontWeight: 700,
                  fontSize: 14,
                  padding: '10px 14px',
                }}
              >
                Rematch
              </button>
            )}
            <button
              onClick={onBack}
              style={{
                ...styles.backBtn,
                flex: 1,
              }}
            >
              Zurueck
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
