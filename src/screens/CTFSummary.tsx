// src/screens/CTFSummary.tsx
// Match-Zusammenfassung fuer Capture the Field

import React, { useMemo } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getCTFMatchById } from '../storage'
import { applyCTFEvents, formatDuration, formatDart, formatTarget, calculateFieldPoints } from '../dartsCaptureTheField'
import type { CTFTurnAddedEvent, CTFRoundFinishedEvent } from '../types/captureTheField'
import ATBDartboard from '../components/ATBDartboard'
import { PLAYER_COLORS } from '../playerColors'
import { generateCTFReport } from '../narratives/generateModeReports'

type Props = {
  matchId: string
  onBackToMenu: () => void
  onRematch: (matchId: string) => void
}

export default function CTFSummary({ matchId, onBackToMenu, onRematch }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const storedMatch = getCTFMatchById(matchId)

  if (!storedMatch) {
    return (
      <div style={styles.page}>
        <p>Match nicht gefunden.</p>
        <button style={styles.backBtn} onClick={onBackToMenu}>{'\u2190'} Zurueck</button>
      </div>
    )
  }

  const state = applyCTFEvents(storedMatch.events)
  const match = state.match

  if (!match) {
    return (
      <div style={styles.page}>
        <p>Match-Daten nicht verfuegbar.</p>
        <button style={styles.backBtn} onClick={onBackToMenu}>{'\u2190'} Zurueck</button>
      </div>
    )
  }

  const players = match.players
  const captureState = state.captureState
  const totalFields = match.sequence.length
  const winner = players.find(p => p.playerId === storedMatch.winnerId)

  // Turn- und Round-Events extrahieren
  const allTurnEvents = storedMatch.events.filter(
    (e): e is CTFTurnAddedEvent => e.type === 'CTFTurnAdded'
  )
  const allRoundEvents = storedMatch.events.filter(
    (e): e is CTFRoundFinishedEvent => e.type === 'CTFRoundFinished'
  )

  // Erweiterte Rankings mit detaillierten Stats
  const rankings = useMemo(() => {
    return players.map((p, i) => {
      const pid = p.playerId
      const fieldsWon = Object.values(captureState.fieldWinners)
        .filter(wid => wid === pid).length
      const ties = Object.values(captureState.fieldWinners)
        .filter(wid => wid === null).length
      const totalScore = captureState.totalScoreByPlayer[pid] ?? 0
      const fieldPoints = captureState.totalFieldPointsByPlayer[pid] ?? 0
      const dartsUsed = state.dartsUsedTotalByPlayer[pid] ?? 0

      // Detaillierte Dart-Statistiken
      let triples = 0, doubles = 0, singles = 0, misses = 0
      const playerTurns = allTurnEvents.filter(t => t.playerId === pid)
      const turnScores: number[] = []

      for (const turn of playerTurns) {
        turnScores.push(turn.captureScore)
        for (const dart of turn.darts) {
          if (dart.target === 'MISS') misses++
          else if (dart.mult === 3) triples++
          else if (dart.mult === 2) doubles++
          else singles++
        }
      }

      const hitRate = dartsUsed > 0 ? ((dartsUsed - misses) / dartsUsed) * 100 : 0

      // Bestes Feld (hoechster Score auf einem Feld)
      let bestField: { field: string; score: number } | null = null
      let bestTurnScore = 0
      for (const round of allRoundEvents) {
        const score = round.scoresByPlayer[pid] ?? 0
        if (score > bestTurnScore) {
          bestTurnScore = score
          bestField = {
            field: round.fieldNumber === 'BULL' ? 'Bull' : String(round.fieldNumber),
            score,
          }
        }
      }

      // Avg Score pro Feld
      const fieldsPlayed = allRoundEvents.length
      const avgScorePerField = fieldsPlayed > 0 ? totalScore / fieldsPlayed : 0

      // Bester Turn (hoechster captureScore)
      const bestTurn = turnScores.length > 0 ? Math.max(...turnScores) : 0

      // Konsistenz: Standardabweichung der Feld-Scores
      const fieldScoresForPlayer = allRoundEvents.map(r => r.scoresByPlayer[pid] ?? 0)
      const mean = fieldScoresForPlayer.length > 0
        ? fieldScoresForPlayer.reduce((a, b) => a + b, 0) / fieldScoresForPlayer.length
        : 0
      const variance = fieldScoresForPlayer.length > 0
        ? fieldScoresForPlayer.reduce((sum, s) => sum + (s - mean) ** 2, 0) / fieldScoresForPlayer.length
        : 0
      const stdDev = Math.sqrt(variance)

      return {
        playerId: pid,
        name: p.name,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
        fieldsWon,
        fieldPoints,
        ties,
        totalScore,
        dartsUsed,
        isWinner: pid === storedMatch.winnerId,
        triples,
        doubles,
        singles,
        misses,
        hitRate,
        bestField,
        avgScorePerField,
        bestTurn,
        stdDev,
      }
    }).sort((a, b) => b.fieldPoints - a.fieldPoints || b.totalScore - a.totalScore)
  }, [players, captureState, state.dartsUsedTotalByPlayer, storedMatch.winnerId, allTurnEvents, allRoundEvents])

  // Feld-Besitzer fuer Dartboard-Visualisierung
  const fieldOwners = useMemo(() => {
    const owners: Record<string, { playerId: string; color: string } | 'tie'> = {}
    const fieldWinners = captureState.fieldWinners

    for (const [fieldKey, winnerId] of Object.entries(fieldWinners)) {
      if (winnerId === null) {
        owners[fieldKey] = 'tie'
      } else {
        const playerIndex = players.findIndex(p => p.playerId === winnerId)
        owners[fieldKey] = {
          playerId: winnerId,
          color: PLAYER_COLORS[playerIndex >= 0 ? playerIndex % PLAYER_COLORS.length : 0],
        }
      }
    }

    return owners
  }, [captureState.fieldWinners, players])

  // Match-Info Werte
  const tieCount = Object.values(captureState.fieldWinners).filter(w => w === null).length
  const resolvedFields = Object.keys(captureState.fieldWinners).length

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0 }}>Capture the Field</h2>
        <button style={styles.backBtn} onClick={onBackToMenu}>
          {'\u2190'} Menu
        </button>
      </div>

      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, maxWidth: 500 }}>

          {/* Modus-Badge */}
          <div style={{ ...styles.card, marginBottom: 16, padding: '10px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>
                Capture the Field {'–'} Ergebnis
              </span>
              <span style={{
                background: colors.accent,
                color: colors.bg,
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
              }}>
                {totalFields} Felder
              </span>
            </div>
          </div>

          {/* Gewinner-Anzeige */}
          {winner && rankings.length > 0 && (
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
                    {rankings.find(p => p.isWinner)?.fieldPoints ?? 0}
                  </div>
                  <div style={{ fontSize: 11, color: colors.fgMuted }}>Feldpunkte</div>
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: colors.warning }}>
                    {rankings.find(p => p.isWinner)?.fieldsWon ?? 0}
                  </div>
                  <div style={{ fontSize: 11, color: colors.fgMuted }}>Felder</div>
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

          {/* Spielbericht */}
          {(() => {
            const report = generateCTFReport({
              matchId,
              players: players.map(p => ({ id: p.playerId, name: p.name })),
              winnerId: storedMatch.winnerId,
              rankings: rankings.map(r => ({
                playerId: r.playerId,
                name: r.name,
                fieldsWon: r.fieldsWon,
                fieldPoints: r.fieldPoints,
                totalScore: r.totalScore,
                triples: r.triples,
                hitRate: r.hitRate,
                bestField: r.bestField,
              })),
              totalFields,
            })
            return report ? (
              <div style={{
                marginBottom: 16, padding: '16px 20px', borderRadius: 12,
                background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                border: '1px solid #93c5fd',
              }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#1e40af' }}>
                  Spielbericht
                </div>
                <div style={{ lineHeight: 1.7, fontSize: 14, color: '#1e293b' }}>
                  {report}
                </div>
              </div>
            ) : null
          })()}

          {/* Dartboard mit Feldfarben */}
          {Object.keys(fieldOwners).length > 0 && (
            <div style={{ ...styles.card, marginBottom: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ ...styles.sub, marginBottom: 12 }}>Feldverteilung</div>
              <ATBDartboard
                currentTarget={null}
                players={[]}
                size={280}
                fieldOwners={fieldOwners}
              />
              <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                {rankings.map(p => (
                  <div key={p.playerId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, background: p.color, opacity: 0.75 }} />
                    <span style={{ color: p.color, fontWeight: 600 }}>{p.name}: {p.fieldsWon} ({p.fieldPoints} FP)</span>
                  </div>
                ))}
                {tieCount > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, background: '#888', opacity: 0.75 }} />
                    <span style={{ color: '#888', fontWeight: 600 }}>Unentschieden: {tieCount}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Rangliste mit erweiterten Stats */}
          {rankings.length > 0 && (
            <div style={{ ...styles.card, marginBottom: 16 }}>
              <div style={{ ...styles.sub, marginBottom: 8 }}>Rangliste</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {rankings.map((p, i) => {
                  const percent = totalFields > 0 ? (p.fieldsWon / totalFields) * 100 : 0

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
                          {i + 1}. {p.name} {p.isWinner && '\u{1F3C6}'}
                        </span>
                        <span style={{ fontSize: 12, color: colors.warning, fontWeight: 700 }}>
                          {p.fieldPoints} FP
                        </span>
                      </div>
                      {/* Feldpunkte-Bar */}
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
                        <span>{p.fieldsWon} Felder | {p.totalScore} Pkt</span>
                        <span>{p.dartsUsed} Darts</span>
                      </div>

                      {/* Detaillierte Stats */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '6px 12px',
                        marginTop: 8,
                        padding: '8px 0 0',
                        borderTop: `1px solid ${colors.border}`,
                      }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: colors.accent }}>
                            {p.avgScorePerField.toFixed(1)}
                          </div>
                          <div style={{ fontSize: 10, color: colors.fgMuted }}>{'\u00D8'} Pkt/Feld</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: colors.success }}>
                            {p.hitRate.toFixed(0)}%
                          </div>
                          <div style={{ fontSize: 10, color: colors.fgMuted }}>Trefferquote</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: colors.warning }}>
                            {p.bestTurn}
                          </div>
                          <div style={{ fontSize: 10, color: colors.fgMuted }}>Bester Turn</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: colors.fg }}>
                            {p.triples}
                          </div>
                          <div style={{ fontSize: 10, color: colors.fgMuted }}>Triples</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: colors.fg }}>
                            {p.doubles}
                          </div>
                          <div style={{ fontSize: 10, color: colors.fgMuted }}>Doubles</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: colors.fg }}>
                            {p.singles}
                          </div>
                          <div style={{ fontSize: 10, color: colors.fgMuted }}>Singles</div>
                        </div>
                        {p.bestField && (
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: colors.success }}>
                              {p.bestField.field}
                            </div>
                            <div style={{ fontSize: 10, color: colors.fgMuted }}>Bestes Feld ({p.bestField.score})</div>
                          </div>
                        )}
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: colors.fgDim }}>
                            {p.stdDev.toFixed(2)}
                          </div>
                          <div style={{ fontSize: 10, color: colors.fgMuted }}>Konsistenz ({'\u03C3'})</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: colors.error }}>
                            {p.misses}
                          </div>
                          <div style={{ fontSize: 10, color: colors.fgMuted }}>Misses</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Match-Info */}
          <div style={{ ...styles.card, marginBottom: 16 }}>
            <div style={{ ...styles.sub, marginBottom: 8 }}>Match-Info</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: colors.fg }}>
                  {formatDuration(storedMatch.durationMs ?? 0)}
                </div>
                <div style={{ fontSize: 11, color: colors.fgMuted }}>Dauer</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: colors.accent }}>
                  {resolvedFields}
                </div>
                <div style={{ fontSize: 11, color: colors.fgMuted }}>Felder gespielt</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: tieCount > 0 ? '#888' : colors.fgDim }}>
                  {tieCount}
                </div>
                <div style={{ fontSize: 11, color: colors.fgMuted }}>Unentschieden</div>
              </div>
            </div>
          </div>

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
              Menu
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
