// src/screens/ATBSummary.tsx
// Zusammenfassung für Around the Block

import React, { useMemo, useState, useEffect } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getATBMatchById, setATBMatchMetadata } from '../storage'
import {
  applyATBEvents,
  formatDuration,
  getModeLabel,
  getDirectionLabel,
} from '../dartsAroundTheBlock'
import { computeATBMatchStats } from '../stats/computeATBStats'
import { PLAYER_COLORS } from '../playerColors'
import { generateATBReport } from '../narratives/generateModeReports'
import StatTooltip, { STAT_TOOLTIPS } from '../components/StatTooltip'

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
  matchId: string
  onBackToMenu: () => void
  onRematch: (matchId: string) => void
  onBackToLobby?: () => void
}

export default function ATBSummary({ matchId, onBackToMenu, onRematch, onBackToLobby }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [isMobile, setIsMobile] = useState(() => Math.min(window.innerWidth, window.innerHeight) < 600)
  useEffect(() => {
    const check = () => setIsMobile(Math.min(window.innerWidth, window.innerHeight) < 600)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const storedMatch = getATBMatchById(matchId)

  const [endscreenName, setEndscreenName] = useState((storedMatch as any)?.matchName ?? '')
  const [endscreenNotes, setEndscreenNotes] = useState((storedMatch as any)?.notes ?? '')
  const [metadataSaved, setMetadataSaved] = useState(
    (storedMatch as any)?.matchName !== undefined || (storedMatch as any)?.notes !== undefined
  )

  const handleSaveMetadata = () => {
    const success = setATBMatchMetadata(matchId, endscreenName, endscreenNotes)
    if (success) setMetadataSaved(true)
  }

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
  const isSuddenDeath = match.config?.specialRule === 'suddenDeath'
  const allEliminated = storedMatch.allEliminated ?? false

  // Spielerfarben-Map
  const playerColorMap: Record<string, string> = {}
  match.players.forEach((p, i) => { playerColorMap[p.playerId] = PLAYER_COLORS[i % PLAYER_COLORS.length] })

  // Spieler nach Fortschritt sortieren (Gewinner zuerst)
  const sortedPlayers = [...match.players].sort((a, b) => {
    const progressA = state.currentIndexByPlayer[a.playerId] ?? 0
    const progressB = state.currentIndexByPlayer[b.playerId] ?? 0
    return progressB - progressA
  })

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0 }}>Around the Block</h2>
        <button style={styles.backBtn} onClick={onBackToMenu}>
          ← Menü
        </button>
      </div>

      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, maxWidth: isMobile ? '100%' : 500, padding: isMobile ? '0 4px' : undefined }}>
          {/* Modus-Info */}
          <div style={{ ...styles.card, marginBottom: 16, padding: '10px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>
                {getModeLabel(match.mode)} · {getDirectionLabel(match.direction)}
              </span>
            </div>
          </div>

          {/* Gewinner */}
          {winner && (
            <div style={{ ...styles.card, marginBottom: 16, textAlign: 'center' }}>
              {isSuddenDeath && allEliminated && (
                <div style={{ fontSize: 36, marginBottom: 4 }}>💀</div>
              )}
              <div style={{ fontSize: isMobile ? 12 : 14, color: colors.fgMuted, marginBottom: 4 }}>
                {isSuddenDeath && allEliminated ? 'Alle ausgeschieden – Weitester Fortschritt' : 'Gewinner'}
              </div>
              <div style={{ fontSize: isMobile ? 24 : 32, fontWeight: 700, color: isSuddenDeath && allEliminated ? colors.warning : colors.success, marginBottom: 8 }}>
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

          {/* Spielbericht */}
          {(() => {
            const report = generateATBReport({
              matchId,
              players: match.players.map(p => ({ id: p.playerId, name: p.name })),
              winnerId: storedMatch.winnerId,
              winnerDarts: storedMatch.winnerDarts,
              mode: match.mode,
              direction: match.direction,
              playerDarts: state.dartsUsedByPlayer,
              playerProgress: state.currentIndexByPlayer,
              totalFields: totalFields,
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

          {/* Spieler-Übersicht */}
          {(
            <div style={{ ...styles.card, marginBottom: 16 }}>
              <div style={{ ...styles.sub, marginBottom: 8 }}>Ergebnisse</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {sortedPlayers.map((p, i) => {
                  const isWinner = p.playerId === storedMatch.winnerId
                  const isEliminated = state.specialStateByPlayer[p.playerId]?.eliminated
                  const progress = state.currentIndexByPlayer[p.playerId] ?? 0
                  const darts = state.dartsUsedByPlayer[p.playerId] ?? 0
                  const percent = (progress / totalFields) * 100

                  return (
                    <div
                      key={p.playerId}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: isWinner ? colors.successBg : isEliminated ? colors.errorBg : colors.bgMuted,
                        border: isWinner ? `2px solid ${colors.success}` : isEliminated ? `1px solid ${colors.error}` : `1px solid ${colors.border}`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontWeight: isWinner ? 700 : 500, color: isWinner ? colors.success : isEliminated ? colors.error : colors.fg }}>
                          {i + 1}. {p.name} {isWinner && (allEliminated ? '👑' : '🏆')} {isEliminated && !isWinner && '💀'}
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
                            background: isWinner ? colors.success : isEliminated ? colors.error : colors.fgDim,
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 11, color: isEliminated ? colors.error : colors.fgMuted, marginTop: 4 }}>
                        {isEliminated && !isWinner ? `💀 Ausgeschieden · ${progress} / ${totalFields} Felder` : `${progress} / ${totalFields} Felder`}
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
                  {(() => {
                    const tdBase: React.CSSProperties = { textAlign: 'right', padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, fontWeight: 600 }
                    const tdLabel: React.CSSProperties = { padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, color: colors.fgMuted }
                    const pids = matchStats.map(s => s.playerId)
                    type StatRow = { label: string; values: (string | number)[]; compareValues?: number[]; better?: 'high' | 'low' }
                    const statRows: StatRow[] = [
                      { label: 'Total Darts', values: matchStats.map(s => s.totalDarts), better: 'low' },
                      { label: 'Triples', values: matchStats.map(s => s.triples), better: 'high' },
                      { label: 'Doubles', values: matchStats.map(s => s.doubles), better: 'high' },
                      { label: 'Singles', values: matchStats.map(s => s.singles), better: 'high' },
                      { label: 'Misses', values: matchStats.map(s => s.misses), better: 'low' },
                      { label: 'Hit Rate', values: matchStats.map(s => `${s.hitRate.toFixed(1)}%`), compareValues: matchStats.map(s => s.hitRate), better: 'high' },
                      { label: 'Ø Darts/Feld', values: matchStats.map(s => s.avgDartsPerField.toFixed(2)), compareValues: matchStats.map(s => s.avgDartsPerField), better: 'low' },
                    ]
                    return statRows.map((row, i) => {
                      const nums = row.compareValues ?? row.values.map(v => typeof v === 'number' ? v : 0)
                      const winColors = row.better ? getStatWinnerColors(nums, pids, row.better, playerColorMap) : undefined
                      return (
                        <tr key={i}>
                          <td style={i < statRows.length - 1 ? tdLabel : { ...tdLabel, borderBottom: 'none' }}><StatTooltip label={row.label} tooltip={STAT_TOOLTIPS[row.label] || row.label} colors={colors} /></td>
                          {row.values.map((v, j) => (
                            <td key={j} style={{ ...tdBase, ...(i === statRows.length - 1 ? { borderBottom: 'none' } : {}), ...(winColors?.[j] ? { color: winColors[j], fontWeight: 700 } : {}) }}>{v}</td>
                          ))}
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          )}

          {/* Spielname + Bemerkungen */}
          <div style={{ ...styles.card, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Spielinfo</div>
            {metadataSaved ? (
              <div>
                {endscreenName && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 13, color: colors.fgDim }}>Spielname</div>
                    <div style={{ fontWeight: 500 }}>{endscreenName}</div>
                  </div>
                )}
                {endscreenNotes && (
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 13, color: colors.fgDim }}>Bemerkungen</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{endscreenNotes}</div>
                  </div>
                )}
                {!endscreenName && !endscreenNotes && (
                  <div style={{ color: colors.fgDim, fontSize: 13 }}>Keine Spielinfo gespeichert</div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>Spielname (optional)</label>
                  <input type="text" value={endscreenName} onChange={(e) => setEndscreenName(e.target.value)}
                    placeholder="z.B. Finale WM 2024"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.fg, fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>Bemerkungen (optional)</label>
                  <textarea value={endscreenNotes} onChange={(e) => setEndscreenNotes(e.target.value)}
                    placeholder="Besonderheiten, Highlights, etc." rows={3}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.fg, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
                </div>
                <button onClick={handleSaveMetadata}
                  style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bgCard, color: colors.fg, fontWeight: 600, fontSize: 14, cursor: 'pointer', width: '100%' }}>
                  Speichern
                </button>
              </div>
            )}
          </div>

          {/* Aktionen */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
            <button
              onClick={() => onRematch(matchId)}
              style={{ ...styles.pill, flex: 1, minHeight: isMobile ? 44 : undefined }}
            >
              Rematch
            </button>
            {onBackToLobby && (
              <button
                onClick={onBackToLobby}
                style={{ ...styles.pill, flex: 1, minHeight: isMobile ? 44 : undefined }}
              >
                Neues Spiel
              </button>
            )}
            <button
              onClick={onBackToMenu}
              style={{ ...styles.backBtn, flex: 1, minHeight: isMobile ? 44 : undefined }}
            >
              {onBackToLobby ? '← Menü' : 'Menü'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
