// src/screens/ATBMatchDetails.tsx
// Spielzusammenfassung für Around the Block Matches
// Mit Leg-Übersicht und Drill-Down (analog zu X01/Cricket)

import React, { useMemo, useState } from 'react'
import { getATBMatchById, getProfiles } from '../storage'
import { applyATBEvents, formatDuration, formatDart, formatTarget, getSequence, DEFAULT_ATB_CONFIG } from '../dartsAroundTheBlock'
import type { ATBTurnAddedEvent, ATBLegStartedEvent, ATBLegFinishedEvent, ATBEvent } from '../dartsAroundTheBlock'
import { computeATBDetailedStats, type ATBDetailedStats } from '../stats/computeATBStats'
import ATBFieldEfficiencyChart from '../components/ATBFieldEfficiencyChart'
import ATBPirateFieldDistributionChart from '../components/ATBPirateFieldDistributionChart'
import ATBPirateScoreChart from '../components/ATBPirateScoreChart'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import MatchHeader, { type MatchHeaderPlayer } from '../components/MatchHeader'
import LegHeader, { type LegHeaderPlayer } from '../components/LegHeader'

type Props = {
  matchId: string
  onBack: () => void
}

// Spielerfarben (satte Farben)
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

  // Piratenmodus-Check (muss vor early return sein)
  // Fallback: config aus ATBMatchStarted Event holen, falls nicht direkt im Match
  const isPirate = useMemo(() => {
    if (!match) return false
    const startEvent = match.events.find((e: any) => e.type === 'ATBMatchStarted') as any
    const config = match.config ?? startEvent?.config ?? DEFAULT_ATB_CONFIG
    return config.gameMode === 'pirate'
  }, [match])

  // Piratenmodus-Rundendaten für das Score-Chart (muss vor early return sein)
  const pirateRounds = useMemo(() => {
    if (!match || !isPirate || selectedLegIndex < 0) return []
    const selectedLeg = legs[selectedLegIndex]
    if (!selectedLeg) return []

    const rounds: Array<{
      fieldNumber: number | 'BULL'
      scoresByPlayer: Record<string, number>
      winnerId: string | null
    }> = []

    for (const event of match.events) {
      if (event.type === 'ATBPirateRoundFinished' && event.legId === selectedLeg.legId) {
        rounds.push({
          fieldNumber: event.fieldNumber,
          scoresByPlayer: event.scoresByPlayer,
          winnerId: event.winnerId ?? null,
        })
      }
    }

    return rounds
  }, [match, isPirate, selectedLegIndex, legs])

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
                    <td style={tdLeft}>Darts</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.totalDarts}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Felder</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.fieldsCompleted} / {sequence.length}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Ø Darts/Feld</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.avgDartsPerField.toFixed(2)}</td>)}
                  </tr>
                  <tr><td colSpan={legStats.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>
                  <tr>
                    <td style={tdLeft}>Triples</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.triples}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Doubles</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.doubles}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Misses</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.misses}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Trefferquote</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.hitRate.toFixed(1)}%</td>)}
                  </tr>
                  <tr><td colSpan={legStats.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>
                  <tr>
                    <td style={tdLeft}>Beste Runde</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.bestTurn} Felder</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Perfekte Runden</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.perfectTurns}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Piratenmodus: Feldverteilung */}
            {(() => {
              const isPirate = (match.config ?? DEFAULT_ATB_CONFIG).gameMode === 'pirate'
              if (!isPirate) return null

              // Berechne die Feldverteilung für dieses Leg
              const pirateFieldWinners: Record<string, string | null> = {}

              // Sammle alle ATBPirateRoundFinished Events für dieses Leg
              for (const event of match.events) {
                if (event.type === 'ATBPirateRoundFinished' && event.legId === selectedLeg?.legId) {
                  const fieldKey = String(event.fieldNumber)
                  pirateFieldWinners[fieldKey] = event.winnerId ?? null
                }
              }

              // Berechne die Verteilung
              const fieldDistribution: Record<string, number> = {}
              match.players.forEach(p => { fieldDistribution[p.playerId] = 0 })
              fieldDistribution['ties'] = 0

              for (const winnerId of Object.values(pirateFieldWinners)) {
                if (winnerId === null) {
                  fieldDistribution['ties']++
                } else {
                  fieldDistribution[winnerId] = (fieldDistribution[winnerId] ?? 0) + 1
                }
              }

              // Konvertiere zu Chart-Format
              const chartData = match.players
                .filter(p => fieldDistribution[p.playerId] > 0)
                .map((p, idx) => ({
                  label: p.name,
                  count: fieldDistribution[p.playerId],
                  color: Object.values(playerColors)[idx % Object.values(playerColors).length],
                }))

              if (fieldDistribution['ties'] > 0) {
                chartData.push({
                  label: 'Unentschieden',
                  count: fieldDistribution['ties'],
                  color: colors.fgMuted,
                })
              }

              if (chartData.length === 0) return null

              return (
                <div style={styles.card}>
                  <div style={{ fontWeight: 700, marginBottom: 16 }}>🏴‍☠️ Feldverteilung</div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <ATBPirateFieldDistributionChart data={chartData} size={240} />
                  </div>
                </div>
              )
            })()}

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
                        <td style={tdLeft}>First-Dart-Hit-Rate</td>
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={tdRight}>{ps.firstDartHitRate.toFixed(1)}%</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}>Längste First-Dart-Serie</td>
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={tdRight}>{ps.firstDartStreak} Felder</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}>Bull-Trefferquote</td>
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={tdRight}>{ps.bullHitRate.toFixed(1)}%</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}>Bestes Feld</td>
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={{ ...tdRight, color: colors.success }}>
                            {ps.bestField ? `${ps.bestField.field} (${ps.bestField.darts} Darts)` : '—'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}>Schwerstes Feld</td>
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
                        <td style={tdLeft}>Misses</td>
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={tdRight}>{ps.misses}</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}>Längste Miss-Serie</td>
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={tdRight}>{ps.longestMissSeries}</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}>Problemfelder</td>
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
                        <td style={tdLeft}>Ø Darts (1-10)</td>
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={tdRight}>
                            {ps.comparison1to10 > 0 ? ps.comparison1to10.toFixed(2) : '—'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}>Ø Darts (11-Bull)</td>
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={tdRight}>
                            {ps.comparison11toBull > 0 ? ps.comparison11toBull.toFixed(2) : '—'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}>Fazit</td>
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

                {/* Feld-Effizienz Chart (klassisch) oder Punkte pro Feld (Piratenmodus) */}
                {isPirate ? (
                  <div style={styles.card}>
                    <div style={{ fontWeight: 700, marginBottom: 12 }}>🏴‍☠️ Punkte pro Feld</div>
                    <ATBPirateScoreChart
                      rounds={pirateRounds}
                      players={match.players.map((p, idx) => ({
                        playerId: p.playerId,
                        name: p.name,
                        color: playerColors[p.playerId] || PLAYER_COLORS[idx % PLAYER_COLORS.length],
                      }))}
                    />
                  </div>
                ) : (
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
                )}
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
                    <td style={tdLeft}>Legs gewonnen</td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{legWinsPerPlayer[p.playerId]}</td>
                    ))}
                  </tr>
                )}
                <tr>
                  <td style={tdLeft}>Darts gesamt</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.totalDarts}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}>Ø Darts pro Feld</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.avgDartsPerField.toFixed(2)}</td>)}
                </tr>
                <tr><td colSpan={matchStats.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>
                <tr>
                  <td style={tdLeft}>Triples</td>
                  {matchStats.map((ps) => (
                    <td key={ps.playerId} style={tdRight}>
                      {ps.triples} <span style={{ color: colors.fgMuted, fontSize: 11 }}>({ps.tripleRate.toFixed(1)}%)</span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={tdLeft}>Doubles</td>
                  {matchStats.map((ps) => (
                    <td key={ps.playerId} style={tdRight}>
                      {ps.doubles} <span style={{ color: colors.fgMuted, fontSize: 11 }}>({ps.doubleRate.toFixed(1)}%)</span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={tdLeft}>Singles</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.singles}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}>Misses</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.misses}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}>Trefferquote</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.hitRate.toFixed(1)}%</td>)}
                </tr>
                <tr><td colSpan={matchStats.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>
                <tr>
                  <td style={tdLeft}>Beste Runde</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.bestTurn} Felder</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}>Perfekte Runden</td>
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
                      <td style={tdLeft}>First-Dart-Hit-Rate</td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={tdRight}>{ps.firstDartHitRate.toFixed(1)}%</td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLeft}>Längste First-Dart-Serie</td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={tdRight}>{ps.firstDartStreak} Felder</td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLeft}>Perfekte Runden</td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={tdRight}>{ps.perfectTurns}</td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLeft}>Bull-Trefferquote</td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={tdRight}>{ps.bullHitRate.toFixed(1)}%</td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLeft}>Bestes Feld</td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={{ ...tdRight, color: colors.success }}>
                          {ps.bestField ? `${ps.bestField.field} (${ps.bestField.darts} Darts)` : '—'}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLeft}>Schwerstes Feld</td>
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
                      <td style={tdLeft}>Misses gesamt</td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={tdRight}>{ps.misses}</td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLeft}>Längste Miss-Serie</td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={tdRight}>{ps.longestMissSeries}</td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLeft}>Problematische Felder</td>
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
                      <td style={tdLeft}>Ø Darts (1-10)</td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={tdRight}>
                          {ps.comparison1to10 > 0 ? ps.comparison1to10.toFixed(2) : '—'}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLeft}>Ø Darts (11-Bull)</td>
                      {detailedStats.map((ps) => (
                        <td key={ps.playerId} style={tdRight}>
                          {ps.comparison11toBull > 0 ? ps.comparison11toBull.toFixed(2) : '—'}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLeft}>Fazit</td>
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

