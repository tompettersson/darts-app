// src/screens/MatchDetails.tsx
import React, { useMemo, useState } from 'react'
import { loadMatchById } from '../storage'
import {
  applyEvents,
  computeStats,
  type DartsEvent,
  type MatchStarted,
  type VisitAdded,
  type LegFinished,
  type MatchFinished,
  type SetFinished,
} from '../darts501'
import { ui } from '../ui'

type Props = { matchId: string; onBack: () => void }
type Tab = 'overview' | 'sets-legs' | 'events'

// Utils
function fmtWhen(s?: string) {
  return s ? new Date(s).toLocaleString() : '—'
}
function fmtClock(s?: string) {
  return s ? new Date(s).toLocaleTimeString() : '—'
}
function pName(match: MatchStarted | undefined, playerId: string) {
  if (!match) return playerId
  return match.players.find((p) => p.playerId === playerId)?.name ?? playerId
}
function fmtDartShort(d: { bed: any; mult: 1 | 2 | 3 }) {
  const prefix = d.mult === 3 ? 'T' : d.mult === 2 ? 'D' : 'S'
  if (typeof d.bed === 'number') return `${prefix}${d.bed}`
  if (d.bed === 'BULL') return '25'
  if (d.bed === 'DBULL') return '50'
  return 'MISS'
}
function visitLabel(v: VisitAdded) {
  const darts = v.darts.map(fmtDartShort).join(' · ')
  const bust = v.bust ? ' (BUST)' : ''
  return `${darts}  →  ${v.visitScore} Punkte${bust}`
}

// Punkte pro Leg (Ø) – wie in Game.tsx
function computePointsPerLegAvg(events: DartsEvent[], playerId: string): number {
  const byLeg = new Map<string, number>()
  for (const e of events) {
    if (e.type !== 'VisitAdded') continue
    const v = e as VisitAdded
    if (v.playerId !== playerId) continue
    const legId = v.legId
    byLeg.set(legId, (byLeg.get(legId) ?? 0) + (v.visitScore ?? 0))
  }
  if (byLeg.size === 0) return 0
  const sum = Array.from(byLeg.values()).reduce((a, b) => a + b, 0)
  return sum / byLeg.size
}

type LegMeta = {
  legId: string
  legIndex?: number
  setIndex: number
  starterPlayerId?: string
  startedAt?: string
  finishedAt?: string
  winnerPlayerId?: string
  highestCheckout?: number
}

function buildLegMetaFromEvents(events: DartsEvent[], match: MatchStarted): Record<string, LegMeta> {
  const meta: Record<string, LegMeta> = {}
  let currentSetIndex = 1
  const isSets = match.structure.kind === 'sets'

  for (const e of events) {
    if (isSets && e.type === 'SetStarted') {
      const si = (e as any).setIndex
      if (typeof si === 'number' && si > 0) currentSetIndex = si
    }

    if (e.type === 'LegStarted') {
      const ls = e as any
      const legId: string | undefined = ls.legId
      if (!legId) continue
      meta[legId] = {
        legId,
        legIndex: ls.legIndex,
        setIndex: isSets ? currentSetIndex : 1,
        starterPlayerId: ls.starterPlayerId,
        startedAt: ls.ts,
      }
    }

    if (e.type === 'LegFinished') {
      const lf = e as any
      const legId: string | undefined = lf.legId
      if (!legId) continue
      meta[legId] = {
        ...(meta[legId] ?? { legId, setIndex: isSets ? currentSetIndex : 1 }),
        finishedAt: lf.ts,
        winnerPlayerId: lf.winnerPlayerId,
        highestCheckout: lf.highestCheckoutThisLeg,
      }
    }
  }

  return meta
}

/**
 * Stats für "Subset" berechnen:
 * computeStats braucht keine komplette Match-Historie, aber sinnvoll ist:
 * - MatchStarted (für playerId->name & Basis)
 * - Visits/LegFinished/SetFinished im Subset
 */
function computeStatsForSubset(allEvents: DartsEvent[], subset: DartsEvent[]) {
  const start = allEvents.find((e) => e.type === 'MatchStarted') as any
  const seq: DartsEvent[] = start ? [start, ...subset] : [...subset]
  return computeStats(seq)
}

function subsetEventsForLegIds(allEvents: DartsEvent[], legIds: string[]) {
  const set = new Set(legIds)
  return allEvents.filter((e: any) => {
    if (e?.type === 'VisitAdded') return set.has(e.legId)
    if (e?.type === 'LegFinished') return set.has(e.legId)
    if (e?.type === 'LegStarted') return set.has(e.legId)
    return false
  }) as DartsEvent[]
}

function subsetEventsForSingleLeg(allEvents: DartsEvent[], legId: string) {
  return subsetEventsForLegIds(allEvents, [legId])
}

export default function MatchDetails({ matchId, onBack }: Props) {
  const stored = loadMatchById(matchId)

  if (!stored) {
    return (
      <div style={ui.page}>
        <div style={ui.card}>
          <h2 style={{ margin: 0 }}>Match nicht gefunden</h2>
          <div style={{ marginTop: 10 }}>
            <button style={ui.backBtn} onClick={onBack}>
              ← Zurück
            </button>
          </div>
        </div>
      </div>
    )
  }

  const events = stored.events as DartsEvent[]
  const state = useMemo(() => applyEvents(events), [events])
  const match = state.match as MatchStarted | undefined

  if (!match) {
    return (
      <div style={ui.page}>
        <div style={ui.card}>
          <h2 style={{ margin: 0 }}>Unvollständige Matchdaten</h2>
          <div style={{ marginTop: 6, opacity: 0.8 }}>Es fehlt das MatchStarted-Event.</div>
          <div style={{ marginTop: 10 }}>
            <button style={ui.backBtn} onClick={onBack}>
              ← Zurück
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isSets = match.structure.kind === 'sets'

  // Finished / Winner
  const finishedEvt = state.events.find((e) => e.type === 'MatchFinished') as MatchFinished | undefined
  const winnerName = finishedEvt ? pName(match, finishedEvt.winnerPlayerId) : undefined

  // Stand (Legs/Sets)
  const legsWon: Record<string, number> = Object.fromEntries(match.players.map((p) => [p.playerId, 0]))
  state.legs.forEach((L) => {
    if (L.winnerPlayerId) legsWon[L.winnerPlayerId]++
  })

  const setFin = state.events.filter((e) => e.type === 'SetFinished') as SetFinished[]
  const setsWon: Record<string, number> = Object.fromEntries(match.players.map((p) => [p.playerId, 0]))
  setFin.forEach((s) => {
    if (s.winnerPlayerId) setsWon[s.winnerPlayerId] = (setsWon[s.winnerPlayerId] ?? 0) + 1
  })

  // Leg meta + ordering
  const legMetaById = useMemo(() => buildLegMetaFromEvents(events, match), [events, match])
  const allLegIdsOrdered = useMemo(() => state.legs.map((l) => l.legId), [state.legs])

  const setIndices = useMemo(() => {
    if (!isSets) return [1]
    const sStarted = state.events.filter((e) => e.type === 'SetStarted') as any[]
    const list = sStarted.map((s) => (typeof s.setIndex === 'number' ? s.setIndex : 0)).filter((n) => n > 0)
    const uniq = Array.from(new Set(list))
    uniq.sort((a, b) => a - b)
    return uniq.length ? uniq : [1]
  }, [isSets, state.events])

  const [tab, setTab] = useState<Tab>('overview')
  const [setIdx, setSetIdx] = useState<number>(() => setIndices[0] ?? 1)

  const legIdsForSelectedSet = useMemo(() => {
    return allLegIdsOrdered.filter((legId) => (legMetaById[legId]?.setIndex ?? 1) === (isSets ? setIdx : 1))
  }, [allLegIdsOrdered, legMetaById, isSets, setIdx])

  const [legId, setLegId] = useState<string | undefined>(() => legIdsForSelectedSet[0])

  React.useEffect(() => {
    if (!isSets) return
    setLegId(legIdsForSelectedSet[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setIdx])

  React.useEffect(() => {
    if (!legId && legIdsForSelectedSet.length) setLegId(legIdsForSelectedSet[0])
    if (legId && !legIdsForSelectedSet.includes(legId)) setLegId(legIdsForSelectedSet[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legIdsForSelectedSet.join('|')])

  const curLeg = useMemo(() => (legId ? state.legs.find((l) => l.legId === legId) : undefined), [legId, state.legs])

  const curLegFinish = useMemo(() => {
    if (!legId) return undefined
    return state.events.find((e) => e.type === 'LegFinished' && (e as any).legId === legId) as LegFinished | undefined
  }, [legId, state.events])

  // ---------- STATS ----------
  // Match Stats (gesamtes Match)
  const matchStatsByPlayer = useMemo(() => computeStats(events), [events])

  // Set Stats (nur Legs aus dem Set)
  const setStatsByPlayer = useMemo(() => {
    if (!isSets) return null
    const subset = subsetEventsForLegIds(events, legIdsForSelectedSet)
    return computeStatsForSubset(events, subset)
  }, [isSets, events, legIdsForSelectedSet])

  // Leg Stats (nur dieses Leg)
  const legStatsByPlayer = useMemo(() => {
    if (!legId) return null
    const subset = subsetEventsForSingleLeg(events, legId)
    return computeStatsForSubset(events, subset)
  }, [events, legId])

  return (
    <div style={ui.page}>
      {/* Kopf */}
      <div style={ui.card}>
        <div style={ui.headerRow}>
          <div>
            <h2 style={{ margin: 0 }}>{stored.title}</h2>
            <div style={ui.sub}>
              gestartet: {fmtWhen(stored.createdAt)}
              {finishedEvt ? <> · beendet: {fmtWhen(finishedEvt.ts)}</> : null}
            </div>
          </div>
          <button style={ui.backBtn} onClick={onBack}>
            ← Zurück
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <b>Spieler:</b> {match.players.map((p) => p.name ?? p.playerId).join(' vs ')}
          </div>
          <div>
            <b>Modus:</b>{' '}
            {match.structure.kind === 'legs'
              ? `Best of ${match.structure.bestOfLegs ?? 1} Legs`
              : `Sets (Best of ${match.structure.bestOfSets}) · je Set Best of ${match.structure.legsPerSet} Legs`}
          </div>
          <div>
            <b>Sieger:</b> {winnerName ?? '—'}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, background: '#f8fafc', borderRadius: 10, padding: 4 }}>
        {(['overview', 'sets-legs', 'events'] as const).map((t) => (
          <button
            key={t}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid ' + (tab === t ? '#0ea5e9' : 'transparent'),
              background: tab === t ? '#e0f2fe' : 'transparent',
              color: tab === t ? '#0369a1' : '#0f172a',
              cursor: 'pointer',
              fontWeight: 700,
            }}
            onClick={() => setTab(t)}
          >
            {t === 'overview' ? 'Übersicht' : t === 'sets-legs' ? 'Set / Leg' : 'Events'}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <>
          <div style={ui.card}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Legs / Sets – Stand</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {match.players.map((p) => (
                <div key={p.playerId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>{p.name ?? p.playerId}</div>
                  <div style={{ display: 'flex', gap: 12, fontVariantNumeric: 'tabular-nums' }}>
                    <span>
                      Legs: <b>{legsWon[p.playerId] ?? 0}</b>
                    </span>
                    {isSets ? (
                      <span>
                        Sets: <b>{setsWon[p.playerId] ?? 0}</b>
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* MATCH STATS */}
          <div style={ui.card}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Match Statistiken</div>
            <StatsTable
              match={match}
              statsByPlayer={matchStatsByPlayer}
              events={events}
              labelRight="Punkte/Leg Ø (Match)"
              pointsPerLegFn={(pid) => computePointsPerLegAvg(events, pid)}
            />
          </div>
        </>
      )}

      {/* SET / LEG */}
      {tab === 'sets-legs' && (
        <div style={{ display: 'grid', gap: 10 }}>
          {/* Set Auswahl */}
          {isSets && (
            <div style={ui.card}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Set auswählen</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {setIndices.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSetIdx(s)}
                    style={{
                      height: 36,
                      borderRadius: 999,
                      border: '1px solid ' + (setIdx === s ? '#0ea5e9' : '#e5e7eb'),
                      background: setIdx === s ? '#e0f2fe' : '#fff',
                      color: setIdx === s ? '#0369a1' : '#0f172a',
                      padding: '0 12px',
                      cursor: 'pointer',
                      fontWeight: 800,
                    }}
                  >
                    Set #{s}
                  </button>
                ))}
              </div>

              {/* SET STATS */}
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Set Statistiken (Set #{setIdx})</div>
                {setStatsByPlayer ? (
                  <StatsTable
                    match={match}
                    statsByPlayer={setStatsByPlayer}
                    events={subsetEventsForLegIds(events, legIdsForSelectedSet)}
                    labelRight="Punkte/Leg Ø (Set)"
                    pointsPerLegFn={(pid) => {
                      // Ø nur über Legs im Set
                      const subset = subsetEventsForLegIds(events, legIdsForSelectedSet)
                      return computePointsPerLegAvg(subset, pid)
                    }}
                  />
                ) : (
                  <div style={{ opacity: 0.75 }}>Keine Set-Statistiken verfügbar.</div>
                )}
              </div>
            </div>
          )}

          {/* Leg Auswahl */}
          <div style={ui.card}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Leg auswählen</div>
            {legIdsForSelectedSet.length === 0 ? (
              <div style={{ opacity: 0.75 }}>Keine Legs in dieser Auswahl.</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {legIdsForSelectedSet.map((lid) => {
                  const m = legMetaById[lid]
                  const li = m?.legIndex ?? (legIdsForSelectedSet.indexOf(lid) + 1)
                  return (
                    <button
                      key={lid}
                      onClick={() => setLegId(lid)}
                      style={{
                        height: 36,
                        borderRadius: 999,
                        border: '1px solid ' + (legId === lid ? '#0ea5e9' : '#e5e7eb'),
                        background: legId === lid ? '#e0f2fe' : '#fff',
                        color: legId === lid ? '#0369a1' : '#0f172a',
                        padding: '0 12px',
                        cursor: 'pointer',
                        fontWeight: 800,
                      }}
                    >
                      Leg #{li}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Leg Detail + LEG STATS */}
          <div style={ui.card}>
            {!curLeg || !legId ? (
              <div style={{ opacity: 0.75 }}>Kein Leg ausgewählt.</div>
            ) : (
              <>
                {(() => {
                  const m = legMetaById[curLeg.legId]
                  const li = m?.legIndex ?? (allLegIdsOrdered.indexOf(curLeg.legId) + 1)
                  const starter = m?.starterPlayerId ? pName(match, m.starterPlayerId) : '—'
                  const winner = curLegFinish?.winnerPlayerId ? pName(match, curLegFinish.winnerPlayerId) : '—'
                  const checkout = curLegFinish ? String((curLegFinish as any).highestCheckoutThisLeg ?? 0) : '—'

                  return (
                    <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 900 }}>
                          {isSets ? `Set #${m?.setIndex ?? setIdx} · ` : null}Leg #{li}
                        </div>
                        <div style={ui.sub}>
                          {m?.startedAt ? `${fmtClock(m.startedAt)} → ${fmtClock(m.finishedAt)}` : '—'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        <div>
                          <span style={ui.sub}>Starter:</span> <b>{starter}</b>
                        </div>
                        <div>
                          <span style={ui.sub}>Sieger:</span> <b>{winner}</b>
                        </div>
                        <div>
                          <span style={ui.sub}>Checkout:</span> <b>{checkout}</b>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                <div style={{ fontWeight: 800, marginBottom: 8 }}>Leg Statistiken</div>
                {legStatsByPlayer ? (
                  <StatsTable
                    match={match}
                    statsByPlayer={legStatsByPlayer}
                    events={subsetEventsForSingleLeg(events, legId)}
                    labelRight="Punkte (Leg)"
                    pointsPerLegFn={(pid) => {
                      // in einem Leg ist "Punkte/Leg" = Punkte dieses Legs
                      const subset = subsetEventsForSingleLeg(events, legId)
                      const sp = computeStatsForSubset(events, subset)[pid]
                      return sp?.pointsScored ?? 0
                    }}
                  />
                ) : (
                  <div style={{ opacity: 0.75 }}>Keine Leg-Statistiken verfügbar.</div>
                )}

                <div style={{ height: 10 }} />

                <div style={{ fontWeight: 800, marginBottom: 8 }}>Leg Verlauf (Visits)</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {curLeg.visits.length === 0 ? (
                    <div style={{ opacity: 0.75 }}>Keine Aufnahmen in diesem Leg.</div>
                  ) : (
                    curLeg.visits.map((v: any, idx: number) => (
                      <div
                        key={v.eventId}
                        style={{
                          border: '1px solid #eef2f7',
                          borderRadius: 10,
                          padding: 10,
                          display: 'grid',
                          gap: 4,
                          background: v.bust ? '#fff7f7' : '#fff',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <div>
                            <b>#{idx + 1}</b> {pName(match, v.playerId)}
                          </div>
                          <div style={{ fontVariantNumeric: 'tabular-nums' }}>
                            Rest: {v.remainingBefore} → <b>{v.remainingAfter}</b>
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 10,
                            flexWrap: 'wrap',
                            fontSize: 13,
                          }}
                        >
                          <div>{visitLabel(v as VisitAdded)}</div>
                          <div style={{ opacity: 0.8 }}>{fmtWhen((v as any).ts)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* EVENTS */}
      {tab === 'events' && (
        <div style={ui.card}>
          <div style={{ display: 'grid', gap: 6 }}>
            {state.events.map((e, i) => {
              let line: string = e.type
              if (e.type === 'VisitAdded') {
                const v = e as VisitAdded
                line = `VisitAdded: ${pName(match, v.playerId)} · ${visitLabel(v)} · Rest ${v.remainingBefore}→${v.remainingAfter}`
              } else if (e.type === 'LegFinished') {
                const lf = e as LegFinished
                line = `LegFinished: Sieger ${pName(match, lf.winnerPlayerId)} · Checkout ${(lf as any).highestCheckoutThisLeg ?? 0}`
              } else if (e.type === 'MatchFinished') {
                const mf = e as MatchFinished
                line = `MatchFinished: Sieger ${pName(match, mf.winnerPlayerId)}`
              } else if (e.type === 'SetFinished') {
                const sf = e as SetFinished
                line = `SetFinished: Sieger Set ${sf.setIndex} ist ${pName(match, sf.winnerPlayerId)}`
              }

              return (
                <div
                  key={i}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    padding: 10,
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div>{line}</div>
                    <div style={{ opacity: 0.7 }}>{fmtWhen((e as any).ts)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function StatsTable({
  match,
  statsByPlayer,
  events,
  labelRight,
  pointsPerLegFn,
}: {
  match: MatchStarted
  statsByPlayer: any
  events: DartsEvent[]
  labelRight: string
  pointsPerLegFn: (playerId: string) => number
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
        <thead>
          <tr>
            <th style={thLeft}>Spieler</th>
            <th style={thRight}>3-DA</th>
            <th style={thRight}>First-9</th>
            <th style={thRight}>Checkout% (Darts)</th>
            <th style={thRight}>Darts</th>
            <th style={thRight}>Punkte</th>
            <th style={thRight}>{labelRight}</th>
          </tr>
        </thead>
        <tbody>
          {match.players.map((p) => {
            const sp = statsByPlayer?.[p.playerId]
            const threeDA = sp?.threeDartAvg ?? 0
            const first9 = sp?.first9OverallAvg ?? 0

            const made = sp?.doublesHitDart ?? 0
            const att = sp?.doubleAttemptsDart ?? 0
            const pct = att > 0 ? (made / att) * 100 : 0

            const dartsThrown = sp?.dartsThrown ?? 0
            const pointsScored = sp?.pointsScored ?? 0

            return (
              <tr key={p.playerId}>
                <td style={tdLeftStrong}>{p.name ?? p.playerId}</td>
                <td style={tdRight}>{threeDA.toFixed(2)}</td>
                <td style={tdRight}>{first9.toFixed(2)}</td>
                <td style={tdRight}>
                  {pct.toFixed(1)}%
                  <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 4 }}>
                    ({made}/{att})
                  </span>
                </td>
                <td style={tdRight}>{dartsThrown}</td>
                <td style={tdRight}>{pointsScored}</td>
                <td style={tdRight}>{pointsPerLegFn(p.playerId).toFixed(1)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ ...ui.sub, marginTop: 8 }}>
        Hinweis: Checkout% (Darts) basiert auf echten Doppel-/Bull-Versuchen (wie im Game/Endscreen).
      </div>
    </div>
  )
}

// ---------- inline styles ----------
const thLeft: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 700,
  color: '#475569',
  padding: '6px 8px',
  borderBottom: '1px solid #e5e7eb',
}
const thRight: React.CSSProperties = {
  ...thLeft,
  textAlign: 'right',
  whiteSpace: 'nowrap',
}
const tdLeftStrong: React.CSSProperties = {
  padding: '8px 8px',
  borderBottom: '1px solid #f1f5f9',
  fontWeight: 700,
}
const tdRight: React.CSSProperties = {
  padding: '8px 8px',
  borderBottom: '1px solid #f1f5f9',
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
}
