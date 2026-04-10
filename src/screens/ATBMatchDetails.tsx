// src/screens/ATBMatchDetails.tsx
// Spielzusammenfassung für Around the Block Matches
// Mit Leg-Übersicht und Drill-Down (analog zu X01/Cricket)

import React, { useMemo, useState } from 'react'
import { getATBMatchById, getProfiles } from '../storage'
import { applyATBEvents, formatDuration, formatDart, formatTarget, getSequence, DEFAULT_ATB_CONFIG } from '../dartsAroundTheBlock'
import type { ATBTurnAddedEvent, ATBLegStartedEvent, ATBLegFinishedEvent, ATBEvent } from '../dartsAroundTheBlock'
import { computeATBDetailedStats, type ATBDetailedStats } from '../stats/computeATBStats'
import ATBFieldEfficiencyChart from '../components/ATBFieldEfficiencyChart'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import MatchHeader, { type MatchHeaderPlayer } from '../components/MatchHeader'
import LegHeader, { type LegHeaderPlayer } from '../components/LegHeader'
import StatTooltip, { STAT_TOOLTIPS } from '../components/StatTooltip'
import { PLAYER_COLORS } from '../playerColors'

type Props = {
  matchId: string
  onBack: () => void
}

function fmtDate(s?: string) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Statistik-Typ für einen Spieler
type PlayerStats = {
  playerId: string
  name: string
  totalDarts: number
  triples: number
  doubles: number
  singles: number
  misses: number
  hitRate: number
  avgDartsPerField: number
  fieldsCompleted: number
  bestTurn: number
  perfectTurns: number
  tripleRate: number
  doubleRate: number
  isWinner: boolean
}

// Leg-Info Typ
type LegInfo = {
  legId: string
  legIndex: number
  setIndex?: number
  winnerId?: string
  winnerName?: string
  winnerDarts?: number
  turns: ATBTurnAddedEvent[]
}

// Berechne Statistiken aus Turn-Events
function computeStatsFromTurns(
  turns: ATBTurnAddedEvent[],
  players: { playerId: string; name: string }[],
  winnerId?: string,
  sequenceLength = 21
): PlayerStats[] {
  return players.map((player) => {
    const pid = player.playerId
    let totalDarts = 0
    let triples = 0
    let doubles = 0
    let singles = 0
    let misses = 0
    let bestTurn = 0
    let perfectTurns = 0
    let fieldsCompleted = 0

    const playerTurns = turns.filter(t => t.playerId === pid)

    for (const turn of playerTurns) {
      let turnHits = 0
      fieldsCompleted = turn.newIndex // Letzter Index = abgeschlossene Felder

      for (const dart of turn.darts) {
        totalDarts++
        if (dart.target === 'MISS') {
          misses++
        } else if (dart.mult === 3) {
          triples++
          turnHits++
        } else if (dart.mult === 2) {
          doubles++
          turnHits++
        } else {
          singles++
          turnHits++
        }
      }

      if (turn.fieldsAdvanced > bestTurn) {
        bestTurn = turn.fieldsAdvanced
      }

      if (turnHits === 3 && turn.darts.length === 3) {
        perfectTurns++
      }
    }

    const hits = totalDarts - misses
    const hitRate = totalDarts > 0 ? (hits / totalDarts) * 100 : 0
    const avgDartsPerField = fieldsCompleted > 0 ? totalDarts / fieldsCompleted : 0
    const tripleRate = totalDarts > 0 ? (triples / totalDarts) * 100 : 0
    const doubleRate = totalDarts > 0 ? (doubles / totalDarts) * 100 : 0

    return {
      playerId: pid,
      name: player.name,
      totalDarts,
      triples,
      doubles,
      singles,
      misses,
      hitRate,
      avgDartsPerField,
      fieldsCompleted,
      bestTurn,
      perfectTurns,
      tripleRate,
      doubleRate,
      isWinner: winnerId === pid,
    }
  })
}

export default function ATBMatchDetails({ matchId, onBack }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  // Dynamische Table Styles
  const thLeft: React.CSSProperties = {
    textAlign: 'left', fontSize: 13, fontWeight: 600,
    color: colors.fgDim, padding: '8px 12px',
    borderBottom: `2px solid ${colors.border}`,
  }
  const thRight: React.CSSProperties = {
    textAlign: 'right', fontSize: 13, fontWeight: 700,
    color: colors.fg, padding: '8px 12px',
    borderBottom: `2px solid ${colors.border}`,
  }
  const tdLeft: React.CSSProperties = {
    padding: '10px 12px', borderBottom: `1px solid ${colors.bgMuted}`,
    fontWeight: 500, color: colors.fg,
  }
  const tdRight: React.CSSProperties = {
    padding: '10px 12px', borderBottom: `1px solid ${colors.bgMuted}`,
    textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600,
  }

  const [selectedLegId, setSelectedLegId] = useState<string | null>(null)

  const match = useMemo(() => getATBMatchById(matchId), [matchId])
  const profiles = useMemo(() => getProfiles(), [])

  // Legs aus Events extrahieren (muss vor early return sein wegen Hook-Regeln)
  const legs = useMemo<LegInfo[]>(() => {
    if (!match) return []
    const result: LegInfo[] = []
    let currentLeg: LegInfo | null = null

    for (const event of match.events) {
      if (event.type === 'ATBLegStarted') {
        currentLeg = {
          legId: event.legId,
          legIndex: event.legIndex,
          setIndex: event.setIndex,
          turns: [],
        }
      } else if (event.type === 'ATBTurnAdded' && currentLeg) {
        currentLeg.turns.push(event)
      } else if (event.type === 'ATBLegFinished' && currentLeg) {
        currentLeg.winnerId = event.winnerId
        currentLeg.winnerName = match.players.find(p => p.playerId === event.winnerId)?.name
        currentLeg.winnerDarts = event.winnerDarts
        result.push(currentLeg)
        currentLeg = null
      }
    }

    if (currentLeg && currentLeg.turns.length > 0) {
      result.push(currentLeg)
    }

    return result
  }, [match])

  // Ausgewähltes Leg (muss vor early return sein)
  const selectedLeg = selectedLegId ? legs.find(l => l.legId === selectedLegId) : null
  const selectedLegIndex = selectedLeg ? legs.findIndex(l => l.legId === selectedLegId) : -1

  // Detaillierte Statistiken für ausgewähltes Leg (muss vor early return sein wegen Hook-Regeln)
  const legDetailedStats = useMemo(() => {
    if (!match || selectedLegIndex < 0) return []
    return computeATBDetailedStats(match, selectedLegIndex)
  }, [match, selectedLegIndex])

  // Detaillierte Statistiken für Match-Übersicht (muss vor early return sein)
  const detailedStats = useMemo(() => {
    if (!match) return []
    return computeATBDetailedStats(match)
  }, [match])

  // ===== EARLY RETURN - nach allen Hooks =====
  if (!match) {
    return (
      <div style={styles.page}>
        <div style={styles.centerPage}>
          <div style={styles.centerInner}>
            <div style={styles.card}>
              <h2 style={{ margin: 0 }}>Match nicht gefunden</h2>
              <div style={{ marginTop: 10 }}>
                <button style={styles.backBtn} onClick={onBack}>← Zurück</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const state = applyATBEvents(match.events)
  const sequence = getSequence(match.mode, match.direction)

  // Spielerfarben aus Profilen oder Standardfarben
  const playerColors: Record<string, string> = {}
  match.players.forEach((p, idx) => {
    const profile = profiles.find((pr) => pr.id === p.playerId)
    playerColors[p.playerId] = profile?.color ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]
  })

  // Alle Turn-Events für Match-Gesamtstatistik
  const allTurnEvents = match.events.filter(
    (e): e is ATBTurnAddedEvent => e.type === 'ATBTurnAdded'
  )

  // Modus-Label
  const modeLabel = match.mode === 'ascending' ? 'Aufsteigend' : 'Drumherum'
  const directionLabel = match.direction === 'forward' ? 'Vorwärts' : 'Rückwärts'

  // Format-Label für Legs/Sets
  let formatLabel = ''
  if (match.structure?.kind === 'legs' && match.structure.bestOfLegs > 1) {
    formatLabel = `First to ${Math.ceil(match.structure.bestOfLegs / 2)} Legs`
  } else if (match.structure?.kind === 'sets') {
    formatLabel = `First to ${Math.ceil(match.structure.bestOfSets / 2)} Sets (Best of ${Math.ceil(match.structure.legsPerSet / 2)} Legs)`
  }

  // Special Rule erkennen
  const startEvent = match.events.find((e: any) => e.type === 'ATBMatchStarted') as any
  const matchConfig = (match as any).config ?? startEvent?.config ?? DEFAULT_ATB_CONFIG
  const specialRuleLabel = matchConfig.specialRule === 'suddenDeath' ? '☠️ Sudden Death'
    : matchConfig.specialRule === 'bullHeavy' ? 'Bull Heavy'
    : matchConfig.specialRule === 'noDoubleEscape' ? 'No Double Escape'
    : matchConfig.specialRule === 'miss3Back' ? 'Miss 3 → Back'
    : ''

  // ===== LEG DETAIL VIEW =====
  if (selectedLeg) {
    const legStats = computeStatsFromTurns(
      selectedLeg.turns,
      match.players,
      selectedLeg.winnerId,
      sequence.length
    )

    // Kumulativen Spielstand nach diesem Leg berechnen
    const cumulativeScore: Record<string, number> = {}
    match.players.forEach(p => { cumulativeScore[p.playerId] = 0 })
    for (let i = 0; i <= selectedLegIndex; i++) {
      const leg = legs[i]
      if (leg.winnerId) cumulativeScore[leg.winnerId]++
    }
    const scoreAfterLeg = match.players.map(p => cumulativeScore[p.playerId]).join(':')

    // Leg-Dauer berechnen (aus Timestamps)
    let legDurationMs: number | undefined
    if (selectedLeg.turns.length >= 2) {
      const firstTs = selectedLeg.turns[0]?.ts
      const lastTs = selectedLeg.turns[selectedLeg.turns.length - 1]?.ts
      if (firstTs && lastTs) {
        legDurationMs = new Date(lastTs).getTime() - new Date(firstTs).getTime()
      }
    }

    // Spielmodus-String
    const gameMode = `ATB ${match.structure?.kind === 'sets' ? 'S' : 'L'}`

    return (
      <div style={styles.page}>
        <div style={styles.centerPage}>
          <div style={{ ...styles.centerInner, width: 'min(650px, 95vw)' }}>
            {/* Einheitlicher Leg-Header */}
            <LegHeader
              legNumber={selectedLeg.legIndex}
              setNumber={selectedLeg.setIndex}
              gameName={match.title}
              gameMode={gameMode}
              players={match.players.map(p => ({
                id: p.playerId,
                name: p.name,
                color: playerColors[p.playerId],
              }))}
              winnerId={selectedLeg.winnerId}
              scoreAfterLeg={scoreAfterLeg}
              legDurationMs={legDurationMs}
              onBack={() => setSelectedLegId(null)}
              onPrevLeg={() => {
                if (selectedLegIndex > 0) {
                  setSelectedLegId(legs[selectedLegIndex - 1].legId)
                }
              }}
              onNextLeg={() => {
                if (selectedLegIndex < legs.length - 1) {
                  setSelectedLegId(legs[selectedLegIndex + 1].legId)
                }
              }}
              hasPrev={selectedLegIndex > 0}
              hasNext={selectedLegIndex < legs.length - 1}
            />

            {/* Leg Statistik */}
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Leg-Statistiken</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thLeft}></th>
                    {legStats.map((ps) => (
                      <th key={ps.playerId} style={{ ...thRight, color: playerColors[ps.playerId] }}>
                        {ps.name} {ps.isWinner && '🏆'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Darts" tooltip={STAT_TOOLTIPS['Darts'] || 'Darts'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.totalDarts}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Felder" tooltip={STAT_TOOLTIPS['Felder'] || 'Felder'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.fieldsCompleted} / {sequence.length}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Ø Darts/Feld" tooltip={STAT_TOOLTIPS['Ø Darts/Feld'] || 'Ø Darts/Feld'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.avgDartsPerField.toFixed(2)}</td>)}
                  </tr>
                  <tr><td colSpan={legStats.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Triples" tooltip={STAT_TOOLTIPS['Triples'] || 'Triples'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.triples}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Doubles" tooltip={STAT_TOOLTIPS['Doubles'] || 'Doubles'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.doubles}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Misses" tooltip={STAT_TOOLTIPS['Misses'] || 'Misses'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.misses}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Trefferquote" tooltip={STAT_TOOLTIPS['Trefferquote'] || 'Trefferquote'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.hitRate.toFixed(1)}%</td>)}
                  </tr>
                  <tr><td colSpan={legStats.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Beste Runde" tooltip={STAT_TOOLTIPS['Beste Runde'] || 'Beste Runde'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.bestTurn} Felder</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Perfekte Runden" tooltip={STAT_TOOLTIPS['Perfekte Runden'] || 'Perfekte Runden'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.perfectTurns}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Erweiterte Leg-Statistiken */}
            {legDetailedStats.length > 0 && (
              <>
                {/* Effizienz & Treffer */}
                <div style={styles.card}>
                  <div style={{ fontWeight: 700, marginBottom: 12 }}>Effizienz & Treffer</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thLeft}></th>
                        {legDetailedStats.map((ps) => (
                          <th key={ps.playerId} style={{ ...thRight, color: playerColors[ps.playerId] }}>
                            {ps.playerName}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={tdLeft}><StatTooltip label="First-Dart-Hit-Rate" tooltip={STAT_TOOLTIPS['First-Dart-Hit-Rate'] || 'First-Dart-Hit-Rate'} colors={colors} /></td>
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={tdRight}>{ps.firstDartHitRate.toFixed(1)}%</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}><StatTooltip label="Längste First-Dart-Serie" tooltip={STAT_TOOLTIPS['Längste First-Dart-Serie'] || 'Längste First-Dart-Serie'} colors={colors} /></td>
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={tdRight}>{ps.firstDartStreak} Felder</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}><StatTooltip label="Bull-Trefferquote" tooltip={STAT_TOOLTIPS['Bull-Trefferquote'] || 'Bull-Trefferquote'} colors={colors} /></td>
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={tdRight}>{ps.bullHitRate.toFixed(1)}%</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}><StatTooltip label="Bestes Feld" tooltip={STAT_TOOLTIPS['Bestes Feld'] || 'Bestes Feld'} colors={colors} /></td>
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={{ ...tdRight, color: colors.success }}>
                            {ps.bestField ? `${ps.bestField.field} (${ps.bestField.darts} Darts)` : '—'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}><StatTooltip label="Schwerstes Feld" tooltip={STAT_TOOLTIPS['Schwerstes Feld'] || 'Schwerstes Feld'} colors={colors} /></td>
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={{ ...tdRight, color: colors.error }}>
                            {ps.worstField ? `${ps.worstField.field} (${ps.worstField.darts} Darts)` : '—'}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Fehler & Streuung */}
                <div style={styles.card}>
                  <div style={{ fontWeight: 700, marginBottom: 12 }}>Fehler & Streuung</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thLeft}></th>
                        {legDetailedStats.map((ps) => (
                          <th key={ps.playerId} style={{ ...thRight, color: playerColors[ps.playerId] }}>
                            {ps.playerName}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={tdLeft}><StatTooltip label="Misses" tooltip={STAT_TOOLTIPS['Misses'] || 'Misses'} colors={colors} /></td>
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={tdRight}>{ps.misses}</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}><StatTooltip label="Längste Miss-Serie" tooltip={STAT_TOOLTIPS['Längste Miss-Serie'] || 'Längste Miss-Serie'} colors={colors} /></td>
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={tdRight}>{ps.longestMissSeries}</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}><StatTooltip label="Problemfelder" tooltip={STAT_TOOLTIPS['Problemfelder'] || 'Problemfelder'} colors={colors} /></td>
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={{ ...tdRight, fontSize: 12 }}>
                            {ps.problematicFields.length > 0 ? ps.problematicFields.join(', ') : '—'}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Flow & Konzentration */}
                <div style={styles.card}>
                  <div style={{ fontWeight: 700, marginBottom: 12 }}>Flow & Konzentration</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thLeft}></th>
                        {legDetailedStats.map((ps) => (
                          <th key={ps.playerId} style={{ ...thRight, color: playerColors[ps.playerId] }}>
                            {ps.playerName}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={tdLeft}><StatTooltip label="Ø Darts (1-10)" tooltip={STAT_TOOLTIPS['Ø Darts (1-10)'] || 'Ø Darts (1-10)'} colors={colors} /></td>
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={tdRight}>
                            {ps.comparison1to10 > 0 ? ps.comparison1to10.toFixed(2) : '—'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}><StatTooltip label="Ø Darts (11-Bull)" tooltip={STAT_TOOLTIPS['Ø Darts (11-Bull)'] || 'Ø Darts (11-Bull)'} colors={colors} /></td>
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={tdRight}>
                            {ps.comparison11toBull > 0 ? ps.comparison11toBull.toFixed(2) : '—'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}><StatTooltip label="Fazit" tooltip={STAT_TOOLTIPS['Fazit'] || 'Fazit'} colors={colors} /></td>
                        {legDetailedStats.map((ps) => {
                          const diff = ps.comparison11toBull - ps.comparison1to10
                          const label = Math.abs(diff) < 0.2 ? 'Konstant'
                            : diff > 0 ? 'Ende schwächer'
                            : 'Ende stärker'
                          const color = Math.abs(diff) < 0.2 ? colors.fgDim
                            : diff > 0 ? colors.warning
                            : colors.success
                          return (
                            <td key={ps.playerId} style={{ ...tdRight, color, fontWeight: 600 }}>
                              {label}
                            </td>
                          )
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Feld-Effizienz Chart */}
                <div style={styles.card}>
                  <div style={{ fontWeight: 700, marginBottom: 12 }}>Feld-Effizienz</div>
                  <ATBFieldEfficiencyChart
                    players={legDetailedStats.map((ps) => ({
                      playerId: ps.playerId,
                      name: ps.playerName,
                      color: playerColors[ps.playerId],
                      statsPerField: ps.statsPerField,
                      isWinner: ps.isWinner,
                    }))}
                    sequence={sequence}
                  />
                </div>
              </>
            )}

            {/* Wurfabfolge */}
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Wurfabfolge</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
                {selectedLeg.turns.length === 0 ? (
                  <div style={{ opacity: 0.6 }}>Keine Würfe in diesem Leg.</div>
                ) : (
                  selectedLeg.turns.map((turn, idx) => {
                    const player = match.players.find(p => p.playerId === turn.playerId)
                    const color = playerColors[turn.playerId] || colors.fgDim
                    const targetAtStart = sequence[turn.newIndex - turn.fieldsAdvanced] ?? '?'

                    return (
                      <div
                        key={turn.eventId || idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 12px',
                          background: `${color}10`,
                          borderLeft: `4px solid ${color}`,
                          borderRadius: '0 6px 6px 0',
                          fontSize: 14,
                        }}
                      >
                        <span style={{ fontWeight: 700, minWidth: 80, color }}>{player?.name}</span>
                        <span style={{ minWidth: 90, fontFamily: 'monospace', fontSize: 12 }}>
                          {turn.darts.map(formatDart).join(' · ')}
                        </span>
                        <span style={{ minWidth: 50, color: colors.fgDim, fontSize: 12 }}>
                          Ziel: {formatTarget(targetAtStart as number | 'BULL')}
                        </span>
                        {turn.fieldsAdvanced > 0 ? (
                          <span style={{
                            fontWeight: 600,
                            color: colors.success,
                            background: colors.successBg,
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 12,
                          }}>
                            +{turn.fieldsAdvanced} {turn.fieldsAdvanced === 1 ? 'Feld' : 'Felder'}
                          </span>
                        ) : (
                          <span style={{ color: colors.fgMuted, fontSize: 12 }}>kein Fortschritt</span>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ===== MATCH OVERVIEW =====
  const matchStats = computeStatsFromTurns(allTurnEvents, match.players, match.winnerId, sequence.length)

  // Leg-Siege pro Spieler zählen
  const legWinsPerPlayer: Record<string, number> = {}
  match.players.forEach(p => { legWinsPerPlayer[p.playerId] = 0 })
  legs.forEach(leg => {
    if (leg.winnerId) legWinsPerPlayer[leg.winnerId]++
  })

  // Spielmodus-String für Header
  const gameMode = `ATB ${match.structure?.kind === 'sets' ? 'S' : 'L'}`

  // Legs-Score und Sets-Score
  const legScore = match.players.map(p => legWinsPerPlayer[p.playerId]).join(':')

  // Sets-Score berechnen (falls Sets-Modus)
  let setScore: string | undefined
  if (match.structure?.kind === 'sets') {
    const setWinsPerPlayer: Record<string, number> = {}
    match.players.forEach(p => { setWinsPerPlayer[p.playerId] = 0 })
    for (const ev of match.events) {
      if (ev.type === 'ATBSetFinished') {
        const wid = (ev as any).winnerPlayerId
        if (wid in setWinsPerPlayer) setWinsPerPlayer[wid]++
      }
    }
    setScore = match.players.map(p => setWinsPerPlayer[p.playerId]).join(':')
  }

  return (
    <div style={styles.page}>
      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, width: 'min(650px, 95vw)' }}>
          {/* Einheitlicher Match-Header */}
          <MatchHeader
            gameName={match.title}
            gameMode={gameMode}
            players={match.players.map(p => ({
              id: p.playerId,
              name: p.name,
              color: playerColors[p.playerId],
              legsWon: legWinsPerPlayer[p.playerId],
            }))}
            winnerId={match.winnerId}
            legScore={legScore}
            setScore={setScore}
            durationMs={match.durationMs}
            playedAt={match.createdAt}
            onBack={onBack}
          />

          {/* Match-Eigenschaften */}
          <div style={{ ...styles.card, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: colors.fgMuted, background: colors.bgMuted, padding: '2px 8px', borderRadius: 4 }}>
              {modeLabel}
            </span>
            <span style={{ fontSize: 12, color: colors.fgMuted, background: colors.bgMuted, padding: '2px 8px', borderRadius: 4 }}>
              {directionLabel}
            </span>
            {formatLabel && (
              <span style={{ fontSize: 12, color: colors.fgMuted, background: colors.bgMuted, padding: '2px 8px', borderRadius: 4 }}>
                {formatLabel}
              </span>
            )}
            {specialRuleLabel && (
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                color: matchConfig.specialRule === 'suddenDeath' ? '#ef4444' : colors.fgMuted,
                background: matchConfig.specialRule === 'suddenDeath' ? 'rgba(239, 68, 68, 0.15)' : colors.bgMuted,
                padding: '2px 8px',
                borderRadius: 4,
              }}>
                {specialRuleLabel}
              </span>
            )}
          </div>

          {/* Match-Statistik */}
          <div style={styles.card}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Match-Statistik</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thLeft}></th>
                  {matchStats.map((ps) => (
                    <th key={ps.playerId} style={{ ...thRight, color: playerColors[ps.playerId] }}>
                      {ps.name} {ps.isWinner && '🏆'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {legs.length > 1 && (
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Legs gewonnen" tooltip={STAT_TOOLTIPS['Legs gewonnen'] || 'Legs gewonnen'} colors={colors} /></td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{legWinsPerPlayer[p.playerId]}</td>
                    ))}
                  </tr>
                )}
                <tr>
                  <td style={tdLeft}><StatTooltip label="Darts gesamt" tooltip={STAT_TOOLTIPS['Darts gesamt'] || 'Darts gesamt'} colors={colors} /></td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.totalDarts}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}><StatTooltip label="Ø Darts pro Feld" tooltip={STAT_TOOLTIPS['Ø Darts pro Feld'] || 'Ø Darts pro Feld'} colors={colors} /></td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.avgDartsPerField.toFixed(2)}</td>)}
                </tr>
                <tr><td colSpan={matchStats.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>
                <tr>
                  <td style={tdLeft}><StatTooltip label="Triples" tooltip={STAT_TOOLTIPS['Triples'] || 'Triples'} colors={colors} /></td>
                  {matchStats.map((ps) => (
                    <td key={ps.playerId} style={tdRight}>
                      {ps.triples} <span style={{ color: colors.fgMuted, fontSize: 11 }}>({ps.tripleRate.toFixed(1)}%)</span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={tdLeft}><StatTooltip label="Doubles" tooltip={STAT_TOOLTIPS['Doubles'] || 'Doubles'} colors={colors} /></td>
                  {matchStats.map((ps) => (
                    <td key={ps.playerId} style={tdRight}>
                      {ps.doubles} <span style={{ color: colors.fgMuted, fontSize: 11 }}>({ps.doubleRate.toFixed(1)}%)</span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={tdLeft}><StatTooltip label="Singles" tooltip={STAT_TOOLTIPS['Singles'] || 'Singles'} colors={colors} /></td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.singles}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}><StatTooltip label="Misses" tooltip={STAT_TOOLTIPS['Misses'] || 'Misses'} colors={colors} /></td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.misses}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}><StatTooltip label="Trefferquote" tooltip={STAT_TOOLTIPS['Trefferquote'] || 'Trefferquote'} colors={colors} /></td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.hitRate.toFixed(1)}%</td>)}
                </tr>
                <tr><td colSpan={matchStats.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>
                <tr>
                  <td style={tdLeft}><StatTooltip label="Beste Runde" tooltip={STAT_TOOLTIPS['Beste Runde'] || 'Beste Runde'} colors={colors} /></td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.bestTurn} Felder</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}><StatTooltip label="Perfekte Runden" tooltip={STAT_TOOLTIPS['Perfekte Runden'] || 'Perfekte Runden'} colors={colors} /></td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.perfectTurns}</td>)}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Erweiterte Statistiken */}
          {detailedStats.length > 0 && (
            <>
              {/* Effizienz & Treffer */}
              <div style={styles.card}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Effizienz & Treffer</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thLeft}></th>
                      {detailedStats.map((ps) => (
                        <th key={ps.playerId} style={{ ...thRight, color: playerColors[ps.playerId] }}>
                          {ps.playerName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="First-Dart-Hit-Rate" tooltip={STAT_TOOLTIPS['First-Dart-Hit-Rate'] || 'First-Dart-Hit-Rate'} colors={colors} /></td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={tdRight}>{ps.firstDartHitRate.toFixed(1)}%</td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Längste First-Dart-Serie" tooltip={STAT_TOOLTIPS['Längste First-Dart-Serie'] || 'Längste First-Dart-Serie'} colors={colors} /></td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={tdRight}>{ps.firstDartStreak} Felder</td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Perfekte Runden" tooltip={STAT_TOOLTIPS['Perfekte Runden'] || 'Perfekte Runden'} colors={colors} /></td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={tdRight}>{ps.perfectTurns}</td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Bull-Trefferquote" tooltip={STAT_TOOLTIPS['Bull-Trefferquote'] || 'Bull-Trefferquote'} colors={colors} /></td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={tdRight}>{ps.bullHitRate.toFixed(1)}%</td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Bestes Feld" tooltip={STAT_TOOLTIPS['Bestes Feld'] || 'Bestes Feld'} colors={colors} /></td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={{ ...tdRight, color: colors.success }}>
                          {ps.bestField ? `${ps.bestField.field} (${ps.bestField.darts} Darts)` : '—'}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Schwerstes Feld" tooltip={STAT_TOOLTIPS['Schwerstes Feld'] || 'Schwerstes Feld'} colors={colors} /></td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={{ ...tdRight, color: colors.error }}>
                          {ps.worstField ? `${ps.worstField.field} (${ps.worstField.darts} Darts)` : '—'}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Fehler & Streuung */}
              <div style={styles.card}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Fehler & Streuung</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thLeft}></th>
                      {detailedStats.map((ps) => (
                        <th key={ps.playerId} style={{ ...thRight, color: playerColors[ps.playerId] }}>
                          {ps.playerName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Misses gesamt" tooltip={STAT_TOOLTIPS['Misses gesamt'] || 'Misses gesamt'} colors={colors} /></td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={tdRight}>{ps.misses}</td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Längste Miss-Serie" tooltip={STAT_TOOLTIPS['Längste Miss-Serie'] || 'Längste Miss-Serie'} colors={colors} /></td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={tdRight}>{ps.longestMissSeries}</td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Problematische Felder" tooltip={STAT_TOOLTIPS['Problematische Felder'] || 'Problematische Felder'} colors={colors} /></td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={{ ...tdRight, fontSize: 12 }}>
                          {ps.problematicFields.length > 0 ? ps.problematicFields.join(', ') : '—'}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Flow & Konzentration */}
              <div style={styles.card}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Flow & Konzentration</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thLeft}></th>
                      {detailedStats.map((ps) => (
                        <th key={ps.playerId} style={{ ...thRight, color: playerColors[ps.playerId] }}>
                          {ps.playerName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Ø Darts (1-10)" tooltip={STAT_TOOLTIPS['Ø Darts (1-10)'] || 'Ø Darts (1-10)'} colors={colors} /></td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={tdRight}>
                          {ps.comparison1to10 > 0 ? ps.comparison1to10.toFixed(2) : '—'}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Ø Darts (11-Bull)" tooltip={STAT_TOOLTIPS['Ø Darts (11-Bull)'] || 'Ø Darts (11-Bull)'} colors={colors} /></td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={tdRight}>
                          {ps.comparison11toBull > 0 ? ps.comparison11toBull.toFixed(2) : '—'}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Fazit" tooltip={STAT_TOOLTIPS['Fazit'] || 'Fazit'} colors={colors} /></td>
                      {detailedStats.map((ps) => {
                        const diff = ps.comparison11toBull - ps.comparison1to10
                        const label = Math.abs(diff) < 0.2 ? 'Konstant'
                          : diff > 0 ? 'Ende schwächer'
                          : 'Ende stärker'
                        const color = Math.abs(diff) < 0.2 ? colors.fgDim
                          : diff > 0 ? colors.warning
                          : colors.success
                        return (
                          <td key={ps.playerId} style={{ ...tdRight, color, fontWeight: 600 }}>
                            {label}
                          </td>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Legs Liste */}
          <div style={styles.card}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Legs</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {legs.length === 0 ? (
                <div style={{ opacity: 0.6 }}>Keine Legs vorhanden.</div>
              ) : (
                (() => {
                  // Kumulativen Spielstand berechnen
                  const cumulativeScore: Record<string, number> = {}
                  match.players.forEach(p => { cumulativeScore[p.playerId] = 0 })

                  return legs.map((leg, idx) => {
                    // Spielstand nach diesem Leg aktualisieren
                    if (leg.winnerId) {
                      cumulativeScore[leg.winnerId]++
                    }
                    const scoreAfterLeg = match.players.map(p => cumulativeScore[p.playerId]).join(':')

                    return (
                      <div
                        key={leg.legId}
                        onClick={() => setSelectedLegId(leg.legId)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '8px 12px',
                          background: colors.bgMuted,
                          borderRadius: 6,
                          fontSize: 14,
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ fontWeight: 700, minWidth: 60 }}>
                          {leg.setIndex ? `S${leg.setIndex} ` : ''}Leg {leg.legIndex}
                        </span>
                        <span style={{
                          fontWeight: 800,
                          fontSize: 14,
                          color: colors.fg,
                          background: colors.bgSoft,
                          padding: '2px 8px',
                          borderRadius: 4,
                          minWidth: 45,
                          textAlign: 'center',
                        }}>
                          {scoreAfterLeg}
                        </span>
                        {leg.winnerDarts && (
                          <span style={{ color: colors.fgDim, fontSize: 12 }}>{leg.winnerDarts} Darts</span>
                        )}
                        <span style={{ flex: 1 }} />
                        {leg.winnerName ? (
                          <span style={{ fontWeight: 600, color: playerColors[leg.winnerId!] }}>{leg.winnerName}</span>
                        ) : (
                          <span style={{ color: colors.warning, fontWeight: 500 }}>offen</span>
                        )}
                        <span style={{ color: colors.fgMuted, fontSize: 12 }}>→</span>
                      </div>
                    )
                  })
                })()
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

