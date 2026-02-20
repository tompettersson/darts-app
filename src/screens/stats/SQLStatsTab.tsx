// src/screens/stats/SQLStatsTab.tsx
// SQL-basierte erweiterte Statistiken (Trends, Head-to-Head, Rekorde)

import React, { useEffect, useState } from 'react'
import {
  getX01MonthlyAverage,
  getX01MonthlyCheckout,
  getCricketMonthlyMPR,
  getATBMonthlyHitRate,
  getCTFMonthlyHitRate,
  getCTFMonthlyAvgScore,
  getStrMonthlyHitRate,
  getHighscoreMonthlyAvgScore,
  getPlayerStreaks,
  getQuickStats,
  getHighestCheckouts,
  getBestMatchAverages,
  getMost180sInMatch,
  getMonthlyStats,
  getStatsByDayOfWeek,
  getAllHeadToHeadForPlayer,
  type TrendPoint,
  type QuickStats,
  type BestPerformance,
  type PlayerStreak,
  type MonthlyStats,
  type DayOfWeekStats,
  type HeadToHead,
} from '../../db/stats'
import { LineChart, BarChart, ProgressBar } from '../../components/charts'

type Props = {
  playerId: string
  playerName: string
}

type LoadingState = 'loading' | 'ready' | 'error'

export default function SQLStatsTab({ playerId, playerName }: Props) {
  const [state, setState] = useState<LoadingState>('loading')
  const [error, setError] = useState<string | null>(null)

  // Daten
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null)
  const [monthlyAvg, setMonthlyAvg] = useState<TrendPoint[]>([])
  const [monthlyCheckout, setMonthlyCheckout] = useState<TrendPoint[]>([])
  const [cricketMPR, setCricketMPR] = useState<TrendPoint[]>([])
  const [streaks, setStreaks] = useState<PlayerStreak | null>(null)
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([])
  const [dayStats, setDayStats] = useState<DayOfWeekStats[]>([])
  const [headToHead, setHeadToHead] = useState<HeadToHead[]>([])
  const [highCheckouts, setHighCheckouts] = useState<BestPerformance[]>([])
  const [bestAverages, setBestAverages] = useState<BestPerformance[]>([])
  const [most180s, setMost180s] = useState<BestPerformance[]>([])

  // Sub-Tab
  const [subTab, setSubTab] = useState<'overview' | 'trends' | 'h2h' | 'records'>('overview')

  // ATB/CTF/STR/Highscore Monatliche Trends (from SQLite)
  const [atbMonthlyHitRate, setAtbMonthlyHitRate] = useState<TrendPoint[]>([])
  const [ctfMonthlyHitRate, setCtfMonthlyHitRate] = useState<TrendPoint[]>([])
  const [ctfMonthlyAvgScore, setCtfMonthlyAvgScore] = useState<TrendPoint[]>([])
  const [strMonthlyHitRate, setStrMonthlyHitRate] = useState<TrendPoint[]>([])
  const [highscoreMonthlyAvg, setHighscoreMonthlyAvg] = useState<TrendPoint[]>([])

  useEffect(() => {
    async function loadData() {
      setState('loading')
      setError(null)

      try {
        // Jede Query einzeln wrappen damit ein Fehler nicht den ganzen Tab crasht
        const safe = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
          p.catch((err) => { console.warn('SQL stats query failed:', err); return fallback })

        const [
          qs, avg, co, cmpr, atbHR, ctfHR, ctfAS, strHR, hsAvg, str, ms, ds, h2h, hc, ba, m180
        ] = await Promise.all([
          safe(getQuickStats(playerId), null),
          safe(getX01MonthlyAverage(playerId), []),
          safe(getX01MonthlyCheckout(playerId), []),
          safe(getCricketMonthlyMPR(playerId), []),
          safe(getATBMonthlyHitRate(playerId), []),
          safe(getCTFMonthlyHitRate(playerId), []),
          safe(getCTFMonthlyAvgScore(playerId), []),
          safe(getStrMonthlyHitRate(playerId), []),
          safe(getHighscoreMonthlyAvgScore(playerId), []),
          safe(getPlayerStreaks(playerId), null),
          safe(getMonthlyStats(playerId), []),
          safe(getStatsByDayOfWeek(playerId), []),
          safe(getAllHeadToHeadForPlayer(playerId), []),
          safe(getHighestCheckouts(10), []),
          safe(getBestMatchAverages(10), []),
          safe(getMost180sInMatch(10), []),
        ])

        setQuickStats(qs)
        setMonthlyAvg(avg)
        setMonthlyCheckout(co)
        setCricketMPR(cmpr)
        setAtbMonthlyHitRate(atbHR)
        setCtfMonthlyHitRate(ctfHR)
        setCtfMonthlyAvgScore(ctfAS)
        setStrMonthlyHitRate(strHR)
        setHighscoreMonthlyAvg(hsAvg)
        setStreaks(str)
        setMonthlyStats(ms)
        setDayStats(ds)
        setHeadToHead(h2h)
        setHighCheckouts(hc)
        setBestAverages(ba)
        setMost180s(m180)
        setState('ready')
      } catch (err) {
        console.error('Error loading SQL stats:', err)
        setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
        setState('error')
      }
    }

    loadData()
  }, [playerId])

  // Styles
  const s = {
    card: {
      background: '#fff',
      borderRadius: 8,
      border: '1px solid #E5E7EB',
      marginBottom: 16,
      overflow: 'hidden',
    } as React.CSSProperties,
    cardHeader: {
      padding: '12px 16px',
      borderBottom: '1px solid #F3F4F6',
      fontSize: 14,
      fontWeight: 700,
      color: '#374151',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    } as React.CSSProperties,
    cardBody: {
      padding: 16,
    } as React.CSSProperties,
    row: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 0',
      borderBottom: '1px solid #F9FAFB',
    } as React.CSSProperties,
    rowLast: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 0',
    } as React.CSSProperties,
    label: {
      fontSize: 14,
      color: '#6B7280',
    } as React.CSSProperties,
    value: {
      fontSize: 14,
      fontWeight: 600,
      color: '#111',
    } as React.CSSProperties,
    valueHighlight: {
      fontSize: 16,
      fontWeight: 700,
      color: '#2563EB',
    } as React.CSSProperties,
    valueGood: {
      fontSize: 14,
      fontWeight: 600,
      color: '#059669',
    } as React.CSSProperties,
    valueBad: {
      fontSize: 14,
      fontWeight: 600,
      color: '#DC2626',
    } as React.CSSProperties,
    subTabs: {
      display: 'flex',
      gap: 0,
      marginBottom: 16,
      borderBottom: '1px solid #E5E7EB',
    } as React.CSSProperties,
    subTab: (active: boolean) => ({
      padding: '10px 16px',
      fontSize: 13,
      fontWeight: active ? 600 : 500,
      color: active ? '#2563EB' : '#6B7280',
      background: 'transparent',
      border: 'none',
      borderBottom: active ? '2px solid #2563EB' : '2px solid transparent',
      marginBottom: -1,
      cursor: 'pointer',
    }) as React.CSSProperties,
    loading: {
      padding: 40,
      textAlign: 'center',
      color: '#9CA3AF',
    } as React.CSSProperties,
    quickGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      gap: 12,
    } as React.CSSProperties,
    quickTile: {
      background: '#F9FAFB',
      borderRadius: 8,
      padding: '12px 16px',
      textAlign: 'center',
    } as React.CSSProperties,
    quickLabel: {
      fontSize: 11,
      color: '#6B7280',
      marginBottom: 4,
    } as React.CSSProperties,
    quickValue: {
      fontSize: 20,
      fontWeight: 700,
      color: '#111',
    } as React.CSSProperties,
    medal: {
      fontSize: 18,
      marginRight: 8,
    } as React.CSSProperties,
    h2hRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 0',
      borderBottom: '1px solid #F3F4F6',
    } as React.CSSProperties,
  }

  if (state === 'loading') {
    return (
      <div style={s.loading as React.CSSProperties}>
        Lade SQL-Statistiken...
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={{ ...s.loading as React.CSSProperties, color: '#DC2626' }}>
        Fehler: {error}
      </div>
    )
  }

  const formatMonth = (m: string) => {
    const [year, month] = m.split('-')
    const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
    return `${months[parseInt(month) - 1]} ${year.slice(2)}`
  }

  return (
    <>
      {/* Sub-Tabs */}
      <div style={s.subTabs}>
        <button style={s.subTab(subTab === 'overview')} onClick={() => setSubTab('overview')}>
          Übersicht
        </button>
        <button style={s.subTab(subTab === 'trends')} onClick={() => setSubTab('trends')}>
          Trends
        </button>
        <button style={s.subTab(subTab === 'h2h')} onClick={() => setSubTab('h2h')}>
          Head-to-Head
        </button>
        <button style={s.subTab(subTab === 'records')} onClick={() => setSubTab('records')}>
          Rekorde
        </button>
      </div>

      {/* ============ ÜBERSICHT ============ */}
      {subTab === 'overview' && quickStats && (
        <>
          {/* Quick Stats Grid */}
          <div style={s.card}>
            <div style={s.cardHeader as React.CSSProperties}>Schnellübersicht</div>
            <div style={s.cardBody}>
              <div style={s.quickGrid}>
                <div style={s.quickTile as React.CSSProperties}>
                  <div style={s.quickLabel}>Matches</div>
                  <div style={s.quickValue}>{quickStats.totalMatches}</div>
                </div>
                <div style={s.quickTile as React.CSSProperties}>
                  <div style={s.quickLabel}>Legs gewonnen</div>
                  <div style={s.quickValue}>{quickStats.totalLegsWon}</div>
                </div>
                <div style={s.quickTile as React.CSSProperties}>
                  <div style={s.quickLabel}>180er</div>
                  <div style={{ ...s.quickValue, color: '#DC2626' }}>{quickStats.total180s}</div>
                </div>
                <div style={s.quickTile as React.CSSProperties}>
                  <div style={s.quickLabel}>Höchstes Checkout</div>
                  <div style={{ ...s.quickValue, color: '#059669' }}>{quickStats.highestCheckout}</div>
                </div>
                <div style={s.quickTile as React.CSSProperties}>
                  <div style={s.quickLabel}>3-Dart-Avg</div>
                  <div style={{ ...s.quickValue, color: '#2563EB' }}>{quickStats.avgThreeDart.toFixed(1)}</div>
                </div>
                <div style={s.quickTile as React.CSSProperties}>
                  <div style={s.quickLabel}>Checkout-%</div>
                  <div style={s.quickValue}>{quickStats.avgCheckoutPercent.toFixed(1)}%</div>
                </div>
              </div>
            </div>
          </div>

          {/* Streaks */}
          {streaks && (
            <div style={s.card}>
              <div style={s.cardHeader as React.CSSProperties}>Serien</div>
              <div style={s.cardBody}>
                <div style={s.row}>
                  <span style={s.label}>Aktuelle Serie</span>
                  <span style={streaks.currentWinStreak > 0 ? s.valueGood : s.valueBad}>
                    {quickStats.currentStreak}
                  </span>
                </div>
                <div style={s.row}>
                  <span style={s.label}>Längste Siegesserie</span>
                  <span style={s.valueGood}>{streaks.longestWinStreak} Siege</span>
                </div>
                <div style={s.rowLast}>
                  <span style={s.label}>Längste Pechsträhne</span>
                  <span style={s.valueBad}>{streaks.longestLoseStreak} Niederlagen</span>
                </div>
              </div>
            </div>
          )}

          {/* Lieblings-Tag */}
          {quickStats.favoriteDayName !== '-' && (
            <div style={s.card}>
              <div style={s.cardHeader as React.CSSProperties}>Spielaktivität</div>
              <div style={s.cardBody}>
                <div style={s.rowLast}>
                  <span style={s.label}>Aktivster Wochentag</span>
                  <span style={s.valueHighlight}>{quickStats.favoriteDayName}</span>
                </div>
              </div>
            </div>
          )}

          {/* Wochentag-Analyse */}
          {dayStats.length > 0 && (
            <div style={s.card}>
              <div style={s.cardHeader as React.CSSProperties}>Gewinnquote nach Wochentag</div>
              <div style={s.cardBody}>
                {dayStats.map((d, i) => (
                  <div key={d.dayOfWeek} style={i === dayStats.length - 1 ? s.rowLast : s.row}>
                    <span style={s.label}>{d.dayName}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 12, color: '#9CA3AF' }}>{d.matchesPlayed} Matches</span>
                      <span style={{
                        ...s.value,
                        color: d.winRate >= 50 ? '#059669' : d.winRate > 0 ? '#DC2626' : '#6B7280',
                      }}>
                        {d.winRate}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ============ TRENDS ============ */}
      {subTab === 'trends' && (
        <>
          {/* Monatlicher Average Trend */}
          {monthlyAvg.length > 1 && (
            <div style={s.card}>
              <div style={s.cardHeader as React.CSSProperties}>3-Dart-Average pro Monat</div>
              <div style={s.cardBody}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <LineChart
                    data={monthlyAvg.map((p) => ({
                      label: formatMonth(p.month),
                      value: p.value,
                    }))}
                    width={320}
                    height={180}
                    color="#3b82f6"
                    valueFormatter={(v) => v.toFixed(1)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Monatliche Checkout-% Trend */}
          {monthlyCheckout.length > 1 && (
            <div style={s.card}>
              <div style={s.cardHeader as React.CSSProperties}>Checkout-% pro Monat (X01)</div>
              <div style={s.cardBody}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <LineChart
                    data={monthlyCheckout.map((p) => ({
                      label: formatMonth(p.month),
                      value: p.value,
                    }))}
                    width={320}
                    height={180}
                    color="#10b981"
                    valueFormatter={(v) => `${v.toFixed(0)}%`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Cricket MPR Trend */}
          {cricketMPR.length > 1 && (
            <div style={s.card}>
              <div style={s.cardHeader as React.CSSProperties}>Marks/Runde pro Monat (Cricket)</div>
              <div style={s.cardBody}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <LineChart
                    data={cricketMPR.map((p) => ({
                      label: formatMonth(p.month),
                      value: p.value,
                    }))}
                    width={320}
                    height={180}
                    color="#8b5cf6"
                    valueFormatter={(v) => v.toFixed(2)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ATB Hit-Rate Trend */}
          {atbMonthlyHitRate.length > 1 && (
            <div style={s.card}>
              <div style={s.cardHeader as React.CSSProperties}>Trefferquote pro Monat (ATB)</div>
              <div style={s.cardBody}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <LineChart
                    data={atbMonthlyHitRate.map((p) => ({
                      label: formatMonth(p.month),
                      value: p.value,
                    }))}
                    width={320}
                    height={180}
                    color="#f59e0b"
                    valueFormatter={(v) => `${v.toFixed(0)}%`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* CTF Hit-Rate Trend */}
          {ctfMonthlyHitRate.length > 1 && (
            <div style={s.card}>
              <div style={s.cardHeader as React.CSSProperties}>Trefferquote pro Monat (CTF)</div>
              <div style={s.cardBody}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <LineChart
                    data={ctfMonthlyHitRate.map((p) => ({
                      label: formatMonth(p.month),
                      value: p.value,
                    }))}
                    width={320}
                    height={180}
                    color="#ef4444"
                    valueFormatter={(v) => `${v.toFixed(0)}%`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* CTF Avg Score Trend */}
          {ctfMonthlyAvgScore.length > 1 && (
            <div style={s.card}>
              <div style={s.cardHeader as React.CSSProperties}>Ø Punkte pro Match/Monat (CTF)</div>
              <div style={s.cardBody}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <LineChart
                    data={ctfMonthlyAvgScore.map((p) => ({
                      label: formatMonth(p.month),
                      value: p.value,
                    }))}
                    width={320}
                    height={180}
                    color="#f59e0b"
                    valueFormatter={(v) => v.toFixed(0)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* STR Hit-Rate Trend */}
          {strMonthlyHitRate.length > 1 && (
            <div style={s.card}>
              <div style={s.cardHeader as React.CSSProperties}>Trefferquote pro Monat (STR)</div>
              <div style={s.cardBody}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <LineChart
                    data={strMonthlyHitRate.map((p) => ({
                      label: formatMonth(p.month),
                      value: p.value,
                    }))}
                    width={320}
                    height={180}
                    color="#06b6d4"
                    valueFormatter={(v) => `${v.toFixed(0)}%`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Highscore Avg Score Trend */}
          {highscoreMonthlyAvg.length > 1 && (
            <div style={s.card}>
              <div style={s.cardHeader as React.CSSProperties}>Ø Punkte pro Match/Monat (Highscore)</div>
              <div style={s.cardBody}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <LineChart
                    data={highscoreMonthlyAvg.map((p) => ({
                      label: formatMonth(p.month),
                      value: p.value,
                    }))}
                    width={320}
                    height={180}
                    color="#a855f7"
                    valueFormatter={(v) => v.toFixed(0)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Monatliche Statistiken Tabelle */}
          {monthlyStats.length > 0 && (
            <div style={s.card}>
              <div style={s.cardHeader as React.CSSProperties}>Monatliche Übersicht</div>
              <div style={{ ...s.cardBody, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid #e5e7eb' }}>Monat</th>
                      <th style={{ textAlign: 'right', padding: '8px', borderBottom: '2px solid #e5e7eb' }}>Matches</th>
                      <th style={{ textAlign: 'right', padding: '8px', borderBottom: '2px solid #e5e7eb' }}>Legs +</th>
                      <th style={{ textAlign: 'right', padding: '8px', borderBottom: '2px solid #e5e7eb' }}>Legs -</th>
                      <th style={{ textAlign: 'right', padding: '8px', borderBottom: '2px solid #e5e7eb' }}>Quote</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyStats.map((m) => (
                      <tr key={m.month}>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f3f4f6', fontWeight: 600 }}>
                          {formatMonth(m.month)}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>
                          {m.matchesPlayed}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f3f4f6', textAlign: 'right', color: '#059669' }}>
                          {m.legsWon}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f3f4f6', textAlign: 'right', color: '#DC2626' }}>
                          {m.legsLost}
                        </td>
                        <td style={{
                          padding: '8px',
                          borderBottom: '1px solid #f3f4f6',
                          textAlign: 'right',
                          fontWeight: 600,
                          color: m.winRate >= 50 ? '#059669' : '#DC2626',
                        }}>
                          {m.winRate}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {monthlyAvg.length <= 1 && monthlyCheckout.length <= 1 && cricketMPR.length <= 1 && atbMonthlyHitRate.length <= 1 && ctfMonthlyHitRate.length <= 1 && ctfMonthlyAvgScore.length <= 1 && strMonthlyHitRate.length <= 1 && highscoreMonthlyAvg.length <= 1 && monthlyStats.length === 0 && (
            <div style={s.loading as React.CSSProperties}>
              Nicht genügend Daten für Trend-Analyse.
              <br />
              <small style={{ color: '#9ca3af' }}>Mindestens 2 Monate Spielhistorie benötigt.</small>
            </div>
          )}
        </>
      )}

      {/* ============ HEAD-TO-HEAD ============ */}
      {subTab === 'h2h' && (
        <>
          {headToHead.length > 0 ? (
            <div style={s.card}>
              <div style={s.cardHeader as React.CSSProperties}>Gegner-Bilanz</div>
              <div style={s.cardBody}>
                {headToHead.map((h, i) => {
                  const isWinning = h.player1Wins > h.player2Wins
                  const isDraw = h.player1Wins === h.player2Wins
                  return (
                    <div key={h.player2Id} style={{
                      ...s.h2hRow,
                      borderBottom: i === headToHead.length - 1 ? 'none' : '1px solid #F3F4F6',
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>{h.player2Name}</div>
                        <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                          {h.totalMatches} Matches · {h.player1LegsWon}:{h.player2LegsWon} Legs
                          {h.lastPlayed && ` · Zuletzt: ${new Date(h.lastPlayed).toLocaleDateString('de-DE')}`}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: isDraw ? '#6B7280' : isWinning ? '#059669' : '#DC2626',
                        }}>
                          {h.player1Wins}:{h.player2Wins}
                        </div>
                        <div style={{
                          fontSize: 11,
                          color: isDraw ? '#6B7280' : isWinning ? '#059669' : '#DC2626',
                        }}>
                          {isDraw ? 'Ausgeglichen' : isWinning ? 'Führend' : 'Rückstand'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div style={s.loading as React.CSSProperties}>
              Keine Head-to-Head Daten vorhanden.
              <br />
              <small style={{ color: '#9ca3af' }}>Spiele gegen andere Spieler um Vergleiche zu sehen.</small>
            </div>
          )}
        </>
      )}

      {/* ============ REKORDE ============ */}
      {subTab === 'records' && (
        <>
          {/* Höchste Checkouts */}
          {highCheckouts.length > 0 && (
            <div style={s.card}>
              <div style={s.cardHeader as React.CSSProperties}>Höchste Checkouts (Alle Spieler)</div>
              <div style={s.cardBody}>
                {highCheckouts.slice(0, 5).map((r, i) => {
                  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
                  const isMe = r.playerId === playerId
                  return (
                    <div key={`${r.matchId}-${i}`} style={i === 4 ? s.rowLast : s.row}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {medal && <span style={s.medal}>{medal}</span>}
                        {!medal && <span style={{ ...s.medal, color: '#9CA3AF' }}>{i + 1}.</span>}
                        <span style={{
                          fontWeight: isMe ? 700 : 500,
                          color: isMe ? '#2563EB' : '#111',
                        }}>
                          {r.playerName}
                        </span>
                      </div>
                      <span style={s.valueHighlight}>{r.value}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Beste Match-Averages */}
          {bestAverages.length > 0 && (
            <div style={s.card}>
              <div style={s.cardHeader as React.CSSProperties}>Beste Match-Averages (Alle Spieler)</div>
              <div style={s.cardBody}>
                {bestAverages.slice(0, 5).map((r, i) => {
                  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
                  const isMe = r.playerId === playerId
                  return (
                    <div key={`${r.matchId}-${i}`} style={i === 4 ? s.rowLast : s.row}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {medal && <span style={s.medal}>{medal}</span>}
                        {!medal && <span style={{ ...s.medal, color: '#9CA3AF' }}>{i + 1}.</span>}
                        <span style={{
                          fontWeight: isMe ? 700 : 500,
                          color: isMe ? '#2563EB' : '#111',
                        }}>
                          {r.playerName}
                        </span>
                      </div>
                      <span style={s.valueHighlight}>{r.value.toFixed(1)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Meiste 180er in einem Match */}
          {most180s.length > 0 && (
            <div style={s.card}>
              <div style={s.cardHeader as React.CSSProperties}>Meiste 180er in einem Match (Alle Spieler)</div>
              <div style={s.cardBody}>
                {most180s.slice(0, 5).map((r, i) => {
                  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
                  const isMe = r.playerId === playerId
                  return (
                    <div key={`${r.matchId}-${i}`} style={i === 4 ? s.rowLast : s.row}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {medal && <span style={s.medal}>{medal}</span>}
                        {!medal && <span style={{ ...s.medal, color: '#9CA3AF' }}>{i + 1}.</span>}
                        <span style={{
                          fontWeight: isMe ? 700 : 500,
                          color: isMe ? '#2563EB' : '#111',
                        }}>
                          {r.playerName}
                        </span>
                      </div>
                      <span style={{ ...s.valueHighlight, color: '#DC2626' }}>{r.value}x 180</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {highCheckouts.length === 0 && bestAverages.length === 0 && most180s.length === 0 && (
            <div style={s.loading as React.CSSProperties}>
              Keine Rekord-Daten vorhanden.
            </div>
          )}
        </>
      )}
    </>
  )
}
