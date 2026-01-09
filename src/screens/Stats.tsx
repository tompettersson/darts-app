// src/screens/Stats.tsx
import React, { useMemo, useState } from 'react'
import { ui } from '../ui'

// Storage helpers
import {
  getMatches,
  getCricketMatches,
  loadCricketLeaderboards,
} from '../storage'

// X01 components
import StatsHighscore from './StatsHighscore'
import StatsProfile from './StatsProfile'

type TabX01 = 'highscores' | 'profiles' | 'matches'
type RootTab = 'x01' | 'cricket'

type StatsProps = {
  onOpenMatch?: (matchId: string) => void
  onOpenCricketMatch?: (matchId: string) => void
}

function isFinishedX01Match(m: { finished?: boolean; events: any[] }) {
  if (m.finished) return true
  return m.events?.some((e) => e.type === 'MatchFinished')
}

// Hilfsfunktion: nimm den ersten Eintrag der Liste oder null
function topOrNull<T>(arr: T[] | undefined | null): T | null {
  if (!arr || arr.length === 0) return null
  return arr[0]
}

export default function Stats({ onOpenMatch, onOpenCricketMatch }: StatsProps) {
  const [root, setRoot] = useState<RootTab>('x01')
  const [tabX01, setTabX01] = useState<TabX01>('highscores')

  // fertige X01-Matches
  const x01Matches = useMemo(
    () =>
      getMatches()
        .filter(isFinishedX01Match)
        .slice()
        .sort(
          (a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
    []
  )

  // fertige Cricket-Matches
  const cricketMatches = useMemo(
    () =>
      getCricketMatches()
        .filter((m) => m.finished)
        .slice()
        .sort(
          (a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
    []
  )

  // Cricket Leaderboards (global über ALLE bisherigen Cricket-Spiele)
  const cricketLB = useMemo(() => loadCricketLeaderboards(), [])

  // Best-of / Hall of Fame aus dem LB vorbereiten
  const bullMaster     = topOrNull(cricketLB.bullMaster)
  const tripleHunter   = topOrNull(cricketLB.tripleHunter)
  const bestTurnMarks  = topOrNull(cricketLB.bestTurnMarks)
  const fastestLeg     = topOrNull(cricketLB.fastestLegs)

  return (
    <div style={ui.page}>
      {/* Root-Umschalter */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          background: '#f8fafc',
          borderRadius: 10,
          padding: 4,
          marginBottom: 12,
        }}
      >
        <button
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border:
              '1px solid ' + (root === 'x01' ? '#0ea5e9' : 'transparent'),
            background: root === 'x01' ? '#e0f2fe' : 'transparent',
            color: root === 'x01' ? '#0369a1' : '#0f172a',
            cursor: 'pointer',
            fontWeight: 700,
          }}
          onClick={() => setRoot('x01')}
        >
          X01
        </button>
        <button
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border:
              '1px solid ' + (root === 'cricket' ? '#0ea5e9' : 'transparent'),
            background: root === 'cricket' ? '#e0f2fe' : 'transparent',
            color: root === 'cricket' ? '#0369a1' : '#0f172a',
            cursor: 'pointer',
            fontWeight: 700,
          }}
          onClick={() => setRoot('cricket')}
        >
          Cricket
        </button>
      </div>

      {/* Inhalt */}
      <div style={ui.centerPage}>
        <div style={ui.centerInnerWide}>
          {/* ---------- X01 ---------- */}
          {root === 'x01' && (
            <>
              {/* Tabs X01 */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  background: '#f8fafc',
                  borderRadius: 10,
                  padding: 4,
                  marginBottom: 12,
                }}
              >
                <button
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border:
                      '1px solid ' +
                      (tabX01 === 'highscores' ? '#0ea5e9' : 'transparent'),
                    background:
                      tabX01 === 'highscores' ? '#e0f2fe' : 'transparent',
                    color: tabX01 === 'highscores' ? '#0369a1' : '#0f172a',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  onClick={() => setTabX01('highscores')}
                >
                  Highscores
                </button>
                <button
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border:
                      '1px solid ' +
                      (tabX01 === 'profiles' ? '#0ea5e9' : 'transparent'),
                    background:
                      tabX01 === 'profiles' ? '#e0f2fe' : 'transparent',
                    color: tabX01 === 'profiles' ? '#0369a1' : '#0f172a',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  onClick={() => setTabX01('profiles')}
                >
                  Spielerprofile
                </button>
                <button
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border:
                      '1px solid ' +
                      (tabX01 === 'matches' ? '#0ea5e9' : 'transparent'),
                    background:
                      tabX01 === 'matches' ? '#e0f2fe' : 'transparent',
                    color: tabX01 === 'matches' ? '#0369a1' : '#0f172a',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  onClick={() => setTabX01('matches')}
                >
                  Spiele
                </button>
              </div>

              {tabX01 === 'highscores' && (
                <div style={ui.card}>
                  <StatsHighscore onOpenMatch={onOpenMatch} />
                </div>
              )}

              {tabX01 === 'profiles' && (
                <div style={ui.card}>
                  <StatsProfile />
                </div>
              )}

              {tabX01 === 'matches' && (
                <div style={ui.card}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {x01Matches.length === 0 ? (
                      <div style={{ opacity: 0.7 }}>
                        Keine beendeten Spiele.
                      </div>
                    ) : (
                      x01Matches.map((m: any) => (
                        <button
                          key={m.id}
                          style={{
                            ...ui.rowCard,
                            cursor: onOpenMatch ? 'pointer' : 'default',
                            textAlign: 'left',
                          }}
                          onClick={
                            onOpenMatch ? () => onOpenMatch(m.id) : undefined
                          }
                          aria-label={`Match öffnen: ${m.title}`}
                        >
                          <div style={{ fontWeight: 700 }}>{m.title}</div>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>
                            {new Date(m.createdAt).toLocaleString()}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ---------- Cricket ---------- */}
          {root === 'cricket' && (
            <div style={{ display: 'grid', gap: 12 }}>
              {/* Hall of Fame / Leaderboards */}
              <div style={ui.card}>
                <div
                  style={{
                    ...ui.headerRow,
                    alignItems: 'baseline',
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontWeight: 800 }}>Cricket Hall of Fame</div>
                  <div
                    style={{
                      fontSize: 12,
                      opacity: 0.6,
                      fontWeight: 400,
                      lineHeight: 1.2,
                    }}
                  >
                    Beste Werte über alle Spiele
                  </div>
                </div>

                {/* Zeilenweise Awards */}
                <div
                  style={{
                    display: 'grid',
                    gap: 8,
                    fontSize: '0.9rem',
                    lineHeight: '1.3rem',
                  }}
                >
                  {/* Bull Master */}
                  <HallOfFameRow
                    label="🎯 Bull Master"
                    entry={
                      bullMaster
                        ? `${bullMaster.playerName ?? '—'} – ${bullMaster.value}% Bull`
                        : '—'
                    }
                  />

                  {/* Triple Hunter */}
                  <HallOfFameRow
                    label="💥 Triple Hunter"
                    entry={
                      tripleHunter
                        ? `${tripleHunter.playerName ?? '—'} – ${tripleHunter.value}x Triple`
                        : '—'
                    }
                  />

                  {/* Best Turn */}
                  <HallOfFameRow
                    label="🔥 Bester Turn"
                    entry={
                      bestTurnMarks
                        ? `${bestTurnMarks.playerName ?? '—'} – ${bestTurnMarks.value} Marks in einem Turn`
                        : '—'
                    }
                  />

                  {/* Fastest Leg */}
                  <HallOfFameRow
                    label="⚡ Schnellstes Leg"
                    entry={
                      fastestLeg
                        ? `${fastestLeg.playerName ?? '—'} – ${fastestLeg.dartsThrown} Darts (${fastestLeg.marks} Marks)`
                        : '—'
                    }
                  />
                </div>
              </div>

              {/* Beendete Cricket-Spiele */}
              <div style={ui.card}>
                <div
                  style={{
                    fontWeight: 800,
                    marginBottom: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <span>Cricket – beendete Spiele</span>
                  <span style={{ fontSize: 12, opacity: 0.6 }}>
                    (Tippen zum Öffnen)
                  </span>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  {cricketMatches.length === 0 ? (
                    <div style={{ opacity: 0.7 }}>
                      Keine beendeten Cricket-Spiele.
                    </div>
                  ) : (
                    cricketMatches.map((m: any) => {
                      const start = (m.events || []).find(
                        (e: any) => e.type === 'CricketMatchStarted'
                      )
                      const styleLabel =
                        start?.style === 'cutthroat' ? 'Cutthroat' : 'Standard'
                      const rangeLabel =
                        start?.range === 'long' ? 'Long' : 'Short'

                      return (
                        <button
                          key={m.id}
                          style={{
                            ...ui.rowCard,
                            cursor: onOpenCricketMatch ? 'pointer' : 'default',
                            textAlign: 'left',
                          }}
                          onClick={
                            onOpenCricketMatch
                              ? () => onOpenCricketMatch(m.id)
                              : undefined
                          }
                          aria-label={`Cricket Match öffnen: ${m.title}`}
                        >
                          <div>
                            <div style={{ fontWeight: 700 }}>{m.title}</div>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                              {new Date(m.createdAt).toLocaleString()}
                            </div>
                          </div>
                          <div style={{ ...ui.sub }}>
                            {rangeLabel} · {styleLabel}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Einzeilige Anzeige für einen "Award" in der Hall of Fame.
 * label="🎯 Bull Master"
 * entry="Alice – 62% Bull"
 */
function HallOfFameRow({ label, entry }: { label: string; entry: string }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        justifyContent: 'space-between',
        alignItems: 'baseline',
        border: '1px solid #e5e7eb',
        background: '#fff',
        borderRadius: 10,
        padding: '8px 10px',
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: '0.9rem',
          lineHeight: 1.2,
          minWidth: 0,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontWeight: 500,
          fontSize: '0.8rem',
          lineHeight: 1.2,
          textAlign: 'right',
          opacity: entry === '—' ? 0.4 : 1,
        }}
      >
        {entry}
      </div>
    </div>
  )
}
