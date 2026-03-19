// src/screens/KillerSummary.tsx
// Match-Zusammenfassung fuer Killer Darts

import React, { useMemo, useState, useEffect } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getKillerMatchById } from '../storage'
import { applyKillerEvents, formatDuration, formatDart } from '../dartsKiller'
import { computeKillerMatchStats } from '../stats/computeKillerStats'
import type { KillerStoredMatch, KillerLogEntry } from '../types/killer'
import { PLAYER_COLORS } from '../playerColors'

// Medaillen fuer Top 3
const MEDALS = ['\u{1F947}', '\u{1F948}', '\u{1F949}']

// Hilfsfunktion: Beste Zelle pro Zeile hervorheben
function getStatWinnerColors(
  numericValues: number[],
  playerIds: string[],
  better: 'high' | 'low',
  playerColorMap: Record<string, string>
): (string | undefined)[] {
  if (playerIds.length < 2) return playerIds.map(() => undefined)
  const allEqual = numericValues.every(v => v === numericValues[0])
  if (allEqual) return playerIds.map(() => undefined)
  const best = better === 'high' ? Math.max(...numericValues) : Math.min(...numericValues)
  return numericValues.map((v, i) => v === best ? playerColorMap[playerIds[i]] : undefined)
}

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
          {/* 3. Spieler-Statistiken (Vergleichstabelle) */}
          {/* ============================================================ */}
          {(() => {
            const validPlayers = playerStats.filter(p => p.stats != null)
            if (validPlayers.length === 0) return null

            const pIds = validPlayers.map(p => p.playerId)
            const colorMap: Record<string, string> = {}
            validPlayers.forEach(p => { colorMap[p.playerId] = p.color })

            const isSelfHealMode = config.selfHeal
            const isFriendlyFireMode = config.friendlyFire
            const hasSelfEffect = isSelfHealMode
              ? validPlayers.some(p => p.stats!.livesHealed > 0)
              : isFriendlyFireMode
                ? validPlayers.some(p => p.stats!.selfKills > 0)
                : false

            const killsWin = getStatWinnerColors(validPlayers.map(p => p.stats!.totalKills), pIds, 'high', colorMap)
            const hitsDealtWin = getStatWinnerColors(validPlayers.map(p => p.stats!.hitsDealt), pIds, 'high', colorMap)
            const survivedWin = getStatWinnerColors(validPlayers.map(p => p.stats!.survivedRounds), pIds, 'high', colorMap)
            const dartsWin = getStatWinnerColors(validPlayers.map(p => p.stats!.totalDartsThrown), pIds, 'low', colorMap)
            const hitRateWin = getStatWinnerColors(validPlayers.map(p => p.stats!.hitRate), pIds, 'high', colorMap)
            const livesLostWin = getStatWinnerColors(validPlayers.map(p => p.stats!.livesLost), pIds, 'low', colorMap)
            const selfEffectWin = hasSelfEffect
              ? isSelfHealMode
                ? getStatWinnerColors(validPlayers.map(p => p.stats!.livesHealed), pIds, 'high', colorMap)
                : getStatWinnerColors(validPlayers.map(p => p.stats!.selfKills), pIds, 'low', colorMap)
              : []

            const thStyle: React.CSSProperties = {
              textAlign: 'right',
              padding: '6px 8px',
              borderBottom: `1px solid ${colors.border}`,
              color: colors.fgMuted,
              fontWeight: 600,
            }
            const tdStyle: React.CSSProperties = {
              textAlign: 'right',
              padding: '6px 8px',
              borderBottom: `1px solid ${colors.border}`,
              fontSize: 13,
            }
            const tdLabelStyle: React.CSSProperties = {
              ...tdStyle,
              textAlign: 'left',
              color: colors.fgMuted,
              fontWeight: 500,
            }

            return (
              <div style={{ ...styles.card, marginBottom: 16 }}>
                <div style={{ ...styles.sub, marginBottom: 8 }}>Spieler-Statistiken</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, textAlign: 'left' }}>Stat</th>
                        {validPlayers.map(p => (
                          <th key={p.playerId} style={{ ...thStyle, color: p.isWinner ? colors.success : p.color }}>
                            {p.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={tdLabelStyle}>Zielzahl</td>
                        {validPlayers.map(p => (
                          <td key={p.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                            {p.stats!.targetNumber ?? '?'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}>Qualifiziert</td>
                        {validPlayers.map(p => (
                          <td key={p.playerId} style={{ ...tdStyle, fontWeight: 600, color: p.stats!.qualifiedInRound ? colors.success : colors.fgDim }}>
                            {p.stats!.qualifiedInRound ? `Runde ${p.stats!.qualifiedInRound}` : '\u2013'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}>Total Kills</td>
                        {validPlayers.map((p, i) => (
                          <td key={p.playerId} style={killsWin[i] ? { ...tdStyle, fontWeight: 700, color: killsWin[i] } : { ...tdStyle, fontWeight: 600 }}>
                            {p.stats!.totalKills}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}>Treffer</td>
                        {validPlayers.map((p, i) => (
                          <td key={p.playerId} style={hitsDealtWin[i] ? { ...tdStyle, fontWeight: 700, color: hitsDealtWin[i] } : { ...tdStyle, fontWeight: 600 }}>
                            {p.stats!.hitsDealt}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}>Ueberlebte Runden</td>
                        {validPlayers.map((p, i) => (
                          <td key={p.playerId} style={survivedWin[i] ? { ...tdStyle, fontWeight: 700, color: survivedWin[i] } : { ...tdStyle, fontWeight: 600 }}>
                            {p.stats!.survivedRounds}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}>Darts</td>
                        {validPlayers.map((p, i) => (
                          <td key={p.playerId} style={dartsWin[i] ? { ...tdStyle, fontWeight: 700, color: dartsWin[i] } : { ...tdStyle, fontWeight: 600 }}>
                            {p.stats!.totalDartsThrown}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}>Trefferquote</td>
                        {validPlayers.map((p, i) => (
                          <td key={p.playerId} style={hitRateWin[i] ? { ...tdStyle, fontWeight: 700, color: hitRateWin[i] } : { ...tdStyle, fontWeight: 600, color: colors.accent }}>
                            {p.stats!.hitRate.toFixed(1)}%
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}>Leben verloren</td>
                        {validPlayers.map((p, i) => (
                          <td key={p.playerId} style={livesLostWin[i] ? { ...tdStyle, fontWeight: 700, color: livesLostWin[i] } : { ...tdStyle, fontWeight: 600 }}>
                            {p.stats!.livesLost}
                          </td>
                        ))}
                      </tr>
                      {hasSelfEffect && (
                        <tr>
                          <td style={tdLabelStyle}>{isSelfHealMode ? 'Leben geheilt' : 'Selbst-Kill'}</td>
                          {validPlayers.map((p, i) => (
                            <td key={p.playerId} style={selfEffectWin[i] ? { ...tdStyle, fontWeight: 700, color: selfEffectWin[i] } : { ...tdStyle, fontWeight: 600 }}>
                              {isSelfHealMode ? p.stats!.livesHealed : p.stats!.selfKills}
                            </td>
                          ))}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}

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
                        display: 'flex',
                        gap: 6,
                      }}
                    >
                      {entry.round != null && (
                        <span style={{ color: colors.fgDim, minWidth: 32, flexShrink: 0 }}>
                          R{entry.round}
                        </span>
                      )}
                      <span>{entry.text}</span>
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
