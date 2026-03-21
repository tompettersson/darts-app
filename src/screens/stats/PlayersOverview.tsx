import React, { useMemo } from 'react'
import {
  getGlobalX01PlayerStats,
  getFavouriteDoubleForPlayer,
  type X01PlayerLongTermStats,
} from '../../storage'
import { ui } from '../../ui'

export type PlayersOverviewProps = {
  /** optional: wenn gesetzt, wird ein Klick auf einen Spieler gemeldet */
  onSelectPlayer?: (playerId: string) => void
}

/**
 * PlayersOverview
 *
 * Langzeit-X01-Stats aller Spieler (aus LocalStorage aggregiert).
 * Wird im StatsDashboard unter dem Tab "X01" gerendert.
 *
 * Metriken pro Spieler:
 * - Matches (W/L)
 * - Karriere-3DA
 * - First9 Ø
 * - Checkout% (dart-basiert)
 * - Höchstes Checkout
 * - Lieblingsdouble
 * - 180er / 140+ / 100+
 */
export default function PlayersOverview({ onSelectPlayer }: PlayersOverviewProps) {
  // Alle Career-Stats aus dem Storage holen
  const rawStore = getGlobalX01PlayerStats()

  // In ein Array verwandeln + sortieren (z.B. nach Matches gespielt desc)
  const players = useMemo(() => {
    const arr = Object.values(rawStore) as X01PlayerLongTermStats[]
    const filtered = arr.filter(p => p.matchesPlayed > 0)

    filtered.sort((a, b) => {
      // Mehr Matches zuerst
      if (b.matchesPlayed !== a.matchesPlayed) return b.matchesPlayed - a.matchesPlayed
      // Dann höherer 3DA
      return (b.threeDartAvgOverall ?? 0) - (a.threeDartAvgOverall ?? 0)
    })
    return filtered
  }, [rawStore])

  const styles: Record<string, React.CSSProperties> = {
    cardHeaderRow: {
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      rowGap: 8,
    },
    titleBlock: {},
    title: { margin: 0 },
    subtitle: { ...ui.sub, marginTop: 4 },
    tableWrap: {
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      minWidth: 700,
      fontSize: 14,
    },
    th: {
      textAlign: 'left',
      fontWeight: 600,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
      padding: '8px 10px',
      color: '#475569',
      background: '#f8fafc',
      borderBottom: '1px solid #e5e7eb',
      whiteSpace: 'nowrap',
    },
    td: {
      padding: '10px',
      borderBottom: '1px solid #e5e7eb',
      verticalAlign: 'top',
      background: '#fff',
      fontVariantNumeric: 'tabular-nums',
    },
    rowClickable: {
      cursor: 'pointer',
      userSelect: 'none',
    },
    playerNameCell: {
      fontWeight: 700,
      fontSize: 14,
      color: '#0f172a',
      lineHeight: 1.3,
    },
    subNameLine: {
      fontSize: 12,
      color: '#64748b',
      fontWeight: 400,
      marginTop: 2,
      lineHeight: 1.3,
    },
    badgeWLWrap: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.3,
    },
    badgeMain: {
      fontWeight: 700,
      color: '#0f172a',
    },
    badgeSub: {
      fontSize: 12,
      color: '#64748b',
      fontWeight: 400,
    },
    statStrong: {
      fontWeight: 700,
      color: '#0f172a',
      whiteSpace: 'nowrap',
    },
    statSub: {
      fontSize: 12,
      color: '#64748b',
      fontWeight: 400,
      lineHeight: 1.3,
    },
    favDoubleBadge: {
      display: 'inline-block',
      borderRadius: 999,
      border: '1px solid #e5e7eb',
      background: '#f8fafc',
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1.2,
      padding: '3px 8px',
      color: '#0f172a',
    },
    noDataText: {
      ...ui.sub,
      fontSize: 13,
      padding: '24px 0',
      textAlign: 'center',
    },
  }

  return (
    <div style={ui.card}>
      {/* Header / Intro */}
      <div style={styles.cardHeaderRow}>
        <div style={styles.titleBlock}>
          <h3 style={styles.title}>X01 – Spielerstatistiken</h3>
          <div style={styles.subtitle}>
            Langzeit-Leistungen aus allen beendeten Matches (ohne Gäste).
          </div>
        </div>
      </div>

      {/* Tabelle */}
      <div style={{ marginTop: 12, ...styles.tableWrap }}>
        {players.length === 0 ? (
          <div style={styles.noDataText}>
            Noch keine abgeschlossenen X01-Matches von echten Profilen gefunden.
            <br />
            Spiel ein Match zu Ende, dann tauchst du hier auf 🙌
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, minWidth: 140 }}>Spieler</th>
                <th style={styles.th}>Bilanz</th>
                <th style={styles.th}>3-DA</th>
                <th style={styles.th}>First 9</th>
                <th style={styles.th}>Checkout%</th>
                <th style={styles.th}>High CO</th>
                <th style={styles.th}>Fav Double</th>
                <th style={styles.th}>Power Scoring</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const {
                  playerId,
                  playerName,
                  matchesPlayed,
                  matchesWon,
                  legsWon,
                  setsWon,
                  dartsThrownTotal,
                  pointsScoredTotal,
                  threeDartAvgOverall,
                  first9OverallAvg,
                  highestCheckout,
                  doubleAttemptsDart,
                  doublesHitDart,
                  doublePctDart,
                  tons100Plus,
                  tons140Plus,
                  tons180,
                } = p

                const losses = matchesPlayed - matchesWon

                const career3DA =
                  typeof threeDartAvgOverall === 'number'
                    ? threeDartAvgOverall
                    : (dartsThrownTotal > 0
                        ? (pointsScoredTotal / dartsThrownTotal) * 3
                        : 0)

                const checkoutPct =
                  typeof doublePctDart === 'number'
                    ? doublePctDart
                    : (doubleAttemptsDart > 0
                        ? (doublesHitDart / doubleAttemptsDart) * 100
                        : 0)

                const fav = getFavouriteDoubleForPlayer(playerId)
                const favLabel = fav
                  ? `D${fav.bed === 'BULL' ? 'BULL' : fav.bed}`
                  : '—'
                const favCount = fav ? fav.count : 0

                // row clickable?
                const clickable = !!onSelectPlayer
                const rowStyle = clickable ? styles.rowClickable : undefined

                return (
                  <tr
                    key={playerId}
                    style={rowStyle}
                    onClick={() => {
                      if (onSelectPlayer) onSelectPlayer(playerId)
                    }}
                  >
                    {/* Spielername */}
                    <td style={styles.td}>
                      <div style={styles.playerNameCell}>{playerName ?? playerId}</div>
                      <div style={styles.subNameLine}>
                        Legs gewonnen: <b>{legsWon ?? 0}</b>
                        {` · `}
                        Sets gewonnen: <b>{setsWon ?? 0}</b>
                      </div>
                    </td>

                    {/* Bilanz */}
                    <td style={styles.td}>
                      <div style={styles.badgeWLWrap}>
                        <div style={styles.badgeMain}>
                          {matchesWon} / {matchesPlayed}{' '}
                          <span style={{ color: '#64748b', fontWeight: 400 }}>W / Ttl</span>
                        </div>
                        <div style={styles.badgeSub}>
                          {losses} Niederlagen
                        </div>
                      </div>
                    </td>

                    {/* 3-DA */}
                    <td style={styles.td}>
                      <div style={styles.statStrong}>
                        {career3DA.toFixed(2)}
                      </div>
                      <div style={styles.statSub} title="Durchschnittliche Punkte pro 3 geworfene Darts">3-Dart Ø</div>
                    </td>

                    {/* First 9 */}
                    <td style={styles.td}>
                      <div style={styles.statStrong}>
                        {(first9OverallAvg ?? 0).toFixed(2)}
                      </div>
                      <div style={styles.statSub} title="Durchschnitt der ersten 9 Darts (3 Aufnahmen) pro Leg">First 9 Ø</div>
                    </td>

                    {/* Checkout % */}
                    <td style={styles.td}>
                      <div style={styles.statStrong}>
                        {checkoutPct.toFixed(1)}%
                      </div>
                      <div style={styles.statSub}>
                        ({doublesHitDart}/{doubleAttemptsDart}) Darts
                      </div>
                    </td>

                    {/* High checkout */}
                    <td style={styles.td}>
                      <div style={styles.statStrong}>
                        {highestCheckout ?? 0}
                      </div>
                      <div style={styles.statSub}>höchster Finish</div>
                    </td>

                    {/* Lieblingsdouble */}
                    <td style={styles.td}>
                      {fav ? (
                        <div>
                          <span style={styles.favDoubleBadge}>
                            {favLabel}
                          </span>
                          <div style={styles.statSub}>
                            {favCount}x Match-Dart
                          </div>
                        </div>
                      ) : (
                        <div style={styles.statSub}>—</div>
                      )}
                    </td>

                    {/* Power scoring */}
                    <td style={styles.td}>
                      <div style={styles.statStrong}>
                        {tons180}x 180
                      </div>
                      <div style={styles.statSub}>
                        {tons140Plus}×140+ · {tons100Plus}×100+
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ ...ui.sub, marginTop: 12, fontSize: 12 }}>
        Hinweis: Die Werte hier sind kumuliert aus allen beendeten Matches, nachdem sie abgeschlossen wurden.
        Gäste (temporäre Spieler) werden nicht mitgezählt.
      </div>
    </div>
  )
}
