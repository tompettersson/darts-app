import React, { useState, useMemo } from 'react'
import { useTheme } from '../ThemeProvider'
import { getThemedUI } from '../ui'
import type { OperationLegState, OperationTargetMode, OperationPlayer } from '../types/operation'
import { generateTargetNumber } from '../dartsOperation'
import { PLAYER_COLORS } from '../playerColors'

// Bestimmt Spielerfarbe für den Gewinner einer Statistik-Zeile
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

type Props = {
  legState: OperationLegState
  players: OperationPlayer[]
  legIndex: number
  totalLegs: number
  targetMode: OperationTargetMode
  onNextLeg: (targetNumber?: number) => void
}

// ===== Hilfsfunktionen =====

/** Beste 3-Dart-Runde (hoechste Punktsumme in einem Turn) */
function getBest3DartTurn(events: { turnIndex: number; points: number }[]): number {
  if (events.length === 0) return 0
  const turnSums: Record<number, number> = {}
  for (const e of events) {
    turnSums[e.turnIndex] = (turnSums[e.turnIndex] ?? 0) + e.points
  }
  return Math.max(0, ...Object.values(turnSums))
}

export default function OperationLegSummary({
  legState,
  players,
  legIndex,
  totalLegs,
  targetMode,
  onNextLeg,
}: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [selectedManualTarget, setSelectedManualTarget] = useState<number | null>(null)

  const isBull = targetMode === 'BULL'

  // Leg-Gewinner nach Hit Score bestimmen (faire Bewertung)
  const winnerPlayer = useMemo(() => {
    if (legState.players.length <= 1) return null
    let bestHitScore = -1
    let bestId: string | null = null
    let tieCount = 0
    for (const ps of legState.players) {
      if (ps.hitScore > bestHitScore) {
        bestHitScore = ps.hitScore
        bestId = ps.playerId
        tieCount = 1
      } else if (ps.hitScore === bestHitScore) {
        tieCount++
      }
    }
    if (tieCount > 1) return null
    return players.find(p => p.playerId === bestId) ?? null
  }, [legState.players, players])

  // Globale Highlights
  const highlights = useMemo(() => {
    let longestStreak = 0
    let longestStreakPlayer = ''
    let best3Dart = 0
    let best3DartPlayer = ''

    for (const ps of legState.players) {
      const player = players.find(p => p.playerId === ps.playerId)
      const name = player?.name ?? ps.playerId

      if (ps.maxHitStreak > longestStreak) {
        longestStreak = ps.maxHitStreak
        longestStreakPlayer = name
      }

      const b3d = getBest3DartTurn(ps.events)
      if (b3d > best3Dart) {
        best3Dart = b3d
        best3DartPlayer = name
      }
    }

    return { longestStreak, longestStreakPlayer, best3Dart, best3DartPlayer }
  }, [legState.players, players])

  const isLastLeg = legIndex + 1 >= totalLegs

  // -- Handlers --

  function handleRandomNewTarget() {
    onNextLeg(generateTargetNumber())
  }

  function handleKeepTarget() {
    onNextLeg(legState.targetNumber)
  }

  function handleManualSelect(num: number) {
    setSelectedManualTarget(num)
  }

  function handleManualConfirm() {
    if (selectedManualTarget !== null) {
      onNextLeg(selectedManualTarget)
    }
  }

  function handleBullContinue() {
    onNextLeg(undefined)
  }

  // -- Styles --

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'grid',
    placeItems: 'center',
    zIndex: 1000,
    padding: 16,
    overflow: 'auto',
  }

  const cardStyle: React.CSSProperties = {
    background: colors.bgCard,
    borderRadius: 16,
    padding: 20,
    maxWidth: 500,
    width: '100%',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    border: `1px solid ${colors.border}`,
    color: colors.fg,
    maxHeight: '90vh',
    overflowY: 'auto',
  }

  const thStyle: React.CSSProperties = {
    textAlign: 'right',
    padding: '6px 8px',
    borderBottom: `1px solid ${colors.border}`,
    color: colors.fgMuted,
    fontWeight: 600,
    fontSize: 13,
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

  const numberBtnBase: React.CSSProperties = {
    width: 48,
    height: 48,
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    background: colors.bgMuted,
    color: colors.fg,
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.12s ease',
  }

  const numberBtnSelected: React.CSSProperties = {
    ...numberBtnBase,
    border: `2px solid ${colors.accent}`,
    background: colors.accent,
    color: isArcade ? '#0a0a0a' : '#fff',
  }

  const ctaBtn: React.CSSProperties = {
    ...styles.btnPrimary,
    width: '100%',
    height: 44,
    fontSize: 15,
    fontWeight: 700,
    borderRadius: 12,
  }

  const secondaryBtn: React.CSSProperties = {
    ...styles.btnGhost,
    flex: 1,
    height: 44,
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 12,
  }

  // Target-Label
  const targetLabel = isBull
    ? 'Bull'
    : legState.targetNumber
      ? `${legState.targetNumber}`
      : '?'

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        {/* Titel */}
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: colors.fg }}>
          Leg {legIndex + 1} Zusammenfassung
        </h2>
        <div style={{ fontSize: 13, color: colors.fgMuted, marginBottom: 16 }}>
          Ziel: {isBull ? 'Bull' : `Feld ${targetLabel}`} &middot; 30 Darts
        </div>

        {/* Leg-Gewinner */}
        {winnerPlayer && (
          <div style={{
            textAlign: 'center',
            padding: '10px 14px',
            borderRadius: 10,
            background: colors.successBg,
            border: `1px solid ${colors.success}`,
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 12, color: colors.fgMuted, marginBottom: 2 }}>Leg-Gewinner</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: colors.success }}>
              {winnerPlayer.name}
            </div>
          </div>
        )}

        {/* Stats-Tabelle */}
        {(() => {
          const opPids = legState.players.map(ps => ps.playerId)
          const opColorMap: Record<string, string> = {}
          players.forEach((p, idx) => { opColorMap[p.playerId] = PLAYER_COLORS[idx % PLAYER_COLORS.length] })
          const tdWin = (c: string | undefined): React.CSSProperties => c ? { ...tdStyle, color: c, fontWeight: 700 } : tdStyle
          // Precompute winners
          const hitScoreWin = getStatWinnerColors(legState.players.map(ps => ps.hitScore), opPids, 'high', opColorMap)
          const scoreWin = getStatWinnerColors(legState.players.map(ps => ps.totalScore), opPids, 'high', opColorMap)
          const hitRates = legState.players.map(ps => { const hits = ps.dartsThrown - ps.noScoreCount; return ps.dartsThrown > 0 ? (hits / ps.dartsThrown) * 100 : 0 })
          const hrWin = getStatWinnerColors(hitRates, opPids, 'high', opColorMap)
          const avgHitScores = legState.players.map(ps => ps.dartsThrown > 0 ? ps.hitScore / ps.dartsThrown : 0)
          const avgHsWin = getStatWinnerColors(avgHitScores, opPids, 'high', opColorMap)
          const streakWin = getStatWinnerColors(legState.players.map(ps => ps.maxHitStreak), opPids, 'high', opColorMap)
          const tripleWin = isBull ? [] : getStatWinnerColors(legState.players.map(ps => ps.tripleCount), opPids, 'high', opColorMap)
          const doubleWin = isBull ? [] : getStatWinnerColors(legState.players.map(ps => ps.doubleCount), opPids, 'high', opColorMap)
          const singleWin = isBull ? [] : getStatWinnerColors(legState.players.map(ps => ps.singleCount), opPids, 'high', opColorMap)
          const sBullWin = isBull ? getStatWinnerColors(legState.players.map(ps => ps.singleBullCount), opPids, 'high', opColorMap) : []
          const dBullWin = isBull ? getStatWinnerColors(legState.players.map(ps => ps.doubleBullCount), opPids, 'high', opColorMap) : []
          const noScoreWin = getStatWinnerColors(legState.players.map(ps => ps.noScoreCount), opPids, 'low', opColorMap)
          return (
          <div style={{ overflowX: 'auto', marginBottom: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Stat</th>
                  {legState.players.map(ps => {
                    const player = players.find(p => p.playerId === ps.playerId)
                    const isWinner = winnerPlayer?.playerId === ps.playerId
                    return (
                      <th
                        key={ps.playerId}
                        style={{
                          ...thStyle,
                          color: isWinner ? colors.success : colors.fg,
                        }}
                      >
                        {player?.name ?? ps.playerId}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {/* Hit Score (faire Bewertung) */}
                <tr>
                  <td style={tdLabelStyle}>Hit Score</td>
                  {legState.players.map((ps, i) => (
                    <td key={ps.playerId} style={hitScoreWin[i] ? { ...tdStyle, fontWeight: 700, color: hitScoreWin[i] } : { ...tdStyle, fontWeight: 700, color: colors.accent }}>
                      {ps.hitScore}/90
                    </td>
                  ))}
                </tr>

                {/* Avg Hit Score/Dart */}
                <tr>
                  <td style={tdLabelStyle}>Ø Hit/Dart</td>
                  {legState.players.map((ps, i) => {
                    const avg = ps.dartsThrown > 0 ? ps.hitScore / ps.dartsThrown : 0
                    return (
                      <td key={ps.playerId} style={tdWin(avgHsWin[i])}>
                        {avg.toFixed(2)}
                      </td>
                    )
                  })}
                </tr>

                {/* Punkte (zum Vergleich) */}
                <tr>
                  <td style={tdLabelStyle}>Punkte</td>
                  {legState.players.map((ps, i) => (
                    <td key={ps.playerId} style={tdWin(scoreWin[i])}>
                      {ps.totalScore}
                    </td>
                  ))}
                </tr>

                {/* Hit Rate */}
                <tr>
                  <td style={tdLabelStyle}>Hit Rate</td>
                  {legState.players.map((ps, i) => {
                    const hits = ps.dartsThrown - ps.noScoreCount
                    const rate = ps.dartsThrown > 0 ? (hits / ps.dartsThrown) * 100 : 0
                    return (
                      <td key={ps.playerId} style={hrWin[i] ? { ...tdStyle, fontWeight: 600, color: hrWin[i] } : { ...tdStyle, fontWeight: 600, color: colors.success }}>
                        {rate.toFixed(1)}%
                      </td>
                    )
                  })}
                </tr>

                {/* Max Hit Streak */}
                <tr>
                  <td style={tdLabelStyle}>Max Streak</td>
                  {legState.players.map((ps, i) => (
                    <td key={ps.playerId} style={streakWin[i] ? { ...tdStyle, fontWeight: 600, color: streakWin[i] } : { ...tdStyle, fontWeight: 600, color: colors.warning }}>
                      {ps.maxHitStreak}
                    </td>
                  ))}
                </tr>

                {/* Hit Distribution */}
                {isBull ? (
                  <>
                    <tr>
                      <td style={tdLabelStyle}>Single Bull</td>
                      {legState.players.map((ps, i) => (
                        <td key={ps.playerId} style={tdWin(sBullWin[i])}>
                          {ps.singleBullCount}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLabelStyle}>Double Bull</td>
                      {legState.players.map((ps, i) => (
                        <td key={ps.playerId} style={dBullWin[i] ? { ...tdStyle, fontWeight: 600, color: dBullWin[i] } : { ...tdStyle, fontWeight: 600, color: colors.warning }}>
                          {ps.doubleBullCount}
                        </td>
                      ))}
                    </tr>
                  </>
                ) : (
                  <>
                    <tr>
                      <td style={tdLabelStyle}>Triple</td>
                      {legState.players.map((ps, i) => (
                        <td key={ps.playerId} style={tripleWin[i] ? { ...tdStyle, fontWeight: 600, color: tripleWin[i] } : { ...tdStyle, fontWeight: 600, color: colors.warning }}>
                          {ps.tripleCount}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLabelStyle}>Double</td>
                      {legState.players.map((ps, i) => (
                        <td key={ps.playerId} style={doubleWin[i] ? { ...tdStyle, fontWeight: 600, color: doubleWin[i] } : { ...tdStyle, fontWeight: 600, color: colors.accent }}>
                          {ps.doubleCount}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLabelStyle}>Single</td>
                      {legState.players.map((ps, i) => (
                        <td key={ps.playerId} style={tdWin(singleWin[i])}>
                          {ps.singleCount}
                        </td>
                      ))}
                    </tr>
                  </>
                )}

                {/* NoScore immer anzeigen */}
                <tr>
                  <td style={{ ...tdLabelStyle, borderBottom: 'none' }}>NoScore</td>
                  {legState.players.map((ps, i) => (
                    <td key={ps.playerId} style={noScoreWin[i] ? { ...tdStyle, borderBottom: 'none', color: noScoreWin[i], fontWeight: 700 } : { ...tdStyle, borderBottom: 'none', color: colors.error }}>
                      {ps.noScoreCount}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          )
        })()}

        {/* Highlights */}
        {(highlights.longestStreak > 0 || highlights.best3Dart > 0) && (
          <div style={{
            display: 'flex',
            gap: 10,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}>
            {highlights.longestStreak > 0 && (
              <div style={{
                flex: 1,
                minWidth: 140,
                padding: '10px 12px',
                borderRadius: 10,
                background: colors.bgMuted,
                border: `1px solid ${colors.border}`,
              }}>
                <div style={{ fontSize: 11, color: colors.fgMuted, marginBottom: 2 }}>Laengste Streak</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: colors.warning }}>
                  {highlights.longestStreak}
                </div>
                <div style={{ fontSize: 12, color: colors.fgMuted }}>{highlights.longestStreakPlayer}</div>
              </div>
            )}
            {highlights.best3Dart > 0 && (
              <div style={{
                flex: 1,
                minWidth: 140,
                padding: '10px 12px',
                borderRadius: 10,
                background: colors.bgMuted,
                border: `1px solid ${colors.border}`,
              }}>
                <div style={{ fontSize: 11, color: colors.fgMuted, marginBottom: 2 }}>Bester 3-Dart-Turn</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: colors.accent }}>
                  {highlights.best3Dart}
                </div>
                <div style={{ fontSize: 12, color: colors.fgMuted }}>{highlights.best3DartPlayer}</div>
              </div>
            )}
          </div>
        )}

        {/* Target Selection / CTA */}
        {!isLastLeg && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.fgMuted, marginBottom: 10 }}>
              Naechstes Leg &middot; Ziel waehlen
            </div>

            {targetMode === 'RANDOM_NUMBER' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={secondaryBtn} onClick={handleKeepTarget}>
                  Gleiche Zahl ({legState.targetNumber})
                </button>
                <button style={{ ...ctaBtn, flex: 1 }} onClick={handleRandomNewTarget}>
                  Neue Zufallszahl
                </button>
              </div>
            )}

            {targetMode === 'MANUAL_NUMBER' && (
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: 6,
                  marginBottom: 12,
                }}>
                  {Array.from({ length: 20 }, (_, i) => i + 1).map(num => (
                    <button
                      key={num}
                      style={selectedManualTarget === num ? numberBtnSelected : numberBtnBase}
                      onClick={() => handleManualSelect(num)}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <button
                  style={{
                    ...ctaBtn,
                    opacity: selectedManualTarget === null ? 0.5 : 1,
                    cursor: selectedManualTarget === null ? 'not-allowed' : 'pointer',
                  }}
                  disabled={selectedManualTarget === null}
                  onClick={handleManualConfirm}
                >
                  Naechstes Leg starten ({selectedManualTarget ?? '?'})
                </button>
              </>
            )}

            {targetMode === 'BULL' && (
              <button style={ctaBtn} onClick={handleBullContinue}>
                Naechstes Leg starten
              </button>
            )}
          </div>
        )}

        {/* Letztes Leg - nur schliessen */}
        {isLastLeg && (
          <button style={ctaBtn} onClick={() => onNextLeg(undefined)}>
            Weiter zur Auswertung
          </button>
        )}
      </div>
    </div>
  )
}
