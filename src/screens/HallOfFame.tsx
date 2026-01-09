import React, { useState, useMemo } from 'react'
import { ui } from '../ui'

// Storage-Funktionen
import {
  getCricketLeaderboards,
  getCricketMatches,
  loadLeaderboards, // oder getX01LeaderboardsUI() wenn du sie schon hast
  getProfiles, // Name-Resolver nutzt Profile
} from '../storage'

// Effizienz-Berechnung für Cricket
import {
  computeCricketEfficiencyFromMatches,
  fmtFixed2,
  fmtPct,
} from '../logic/cricketEfficiency'

// Typen aus zentraler Stats-Typdatei
import type {
  CricketLeaderboardsUI,
  CricketTripleHunterRow,
  CricketBestTurnRow,
  CricketFastestLegRow,
  X01LeaderboardsUI,
  X01HighVisitRow,
  X01HighCheckoutRow,
  X01LegRow,
  X01CheckoutPctRow,
} from '../types/stats'

type Props = {
  onBack: () => void
}

/* =========================================================
   Name-Resolver: Profile + Matches -> nameOf(playerId)
   ========================================================= */
function useNameOf(matches: any[]) {
  const profiles = getProfiles() || []
  return React.useMemo(() => {
    const map = new Map<string, string>()
    // 1) Profile (höchste Priorität)
    for (const p of profiles) {
      if (p?.id) map.set(p.id, (p.name || '').trim() || p.id)
    }
    // 2) Matches (Fallback, falls Profile fehlen)
    for (const m of matches || []) {
      for (const p of m.players || []) {
        if (p?.id && !map.has(p.id)) {
          map.set(p.id, (p.name || '').trim() || p.id)
        }
      }
    }
    return (pid: string | undefined) => (pid ? map.get(pid) || pid : '—')
  }, [profiles, matches])
}

// kleine Helper für Tab-Buttons
function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid ' + (active ? '#0ea5e9' : 'transparent'),
    background: active ? '#e0f2fe' : 'transparent',
    color: active ? '#0369a1' : '#0f172a',
    cursor: 'pointer',
    fontWeight: 600,
    flex: '0 0 auto',
  }
}

// eine kompakte Row für Einträge
function rowStyle(): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    maxWidth: 420,
    width: '100%',
    margin: '0 auto',
    padding: '8px 12px',
    borderBottom: '1px solid #e2e8f0',
    fontSize: 14,
  }
}

function nameStyle(): React.CSSProperties {
  return {
    fontWeight: 600,
    color: '#0f172a',
    flex: 1,
    marginRight: 8,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }
}

function metaStyle(): React.CSSProperties {
  return {
    ...ui.sub,
    fontSize: 12,
    marginLeft: 8,
    whiteSpace: 'nowrap',
  }
}

function valueStyle(): React.CSSProperties {
  return {
    fontVariantNumeric: 'tabular-nums',
    color: '#334155',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    minWidth: 104,
    textAlign: 'right',
  }
}

function sectionHeaderStyle(): React.CSSProperties {
  return {
    textAlign: 'center',
    fontWeight: 700,
    fontSize: 16,
    marginBottom: 8,
    color: '#0f172a',
  }
}

/* =========================
   Cricket-Teil mit neuen Subtabs
   ========================= */

type CricketInnerTab = 'mpd' | 'mpt' | 'nstr' | 'triple' | 'turn' | 'fastest'

function CricketTabView({ data }: { data: CricketLeaderboardsUI }) {
  const [subTab, setSubTab] = useState<CricketInnerTab>('mpd')

  // Alle Matches laden und Effizienz berechnen (lokal)
  const allMatches = getCricketMatches() as any[]
  const efficiency = useMemo(
    () => computeCricketEfficiencyFromMatches(allMatches, { minDarts: 30, minTurns: 10 }),
    [allMatches]
  )
  const nameOf = useNameOf(allMatches)

  const subTabBar = (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        background: '#f8fafc',
        borderRadius: 10,
        padding: 4,
        justifyContent: 'center',
        marginBottom: 16,
      }}
    >
      <button style={tabButtonStyle(subTab === 'mpd')} onClick={() => setSubTab('mpd')}>
        Marks/Dart
      </button>
      <button style={tabButtonStyle(subTab === 'mpt')} onClick={() => setSubTab('mpt')}>
        Marks/Turn
      </button>
      <button style={tabButtonStyle(subTab === 'nstr')} onClick={() => setSubTab('nstr')}>
        No-Score-Rate
      </button>
      <button style={tabButtonStyle(subTab === 'triple')} onClick={() => setSubTab('triple')}>
        Triple Hunter
      </button>
      <button style={tabButtonStyle(subTab === 'turn')} onClick={() => setSubTab('turn')}>
        Best Turn
      </button>
      <button style={tabButtonStyle(subTab === 'fastest')} onClick={() => setSubTab('fastest')}>
        Fastest Leg
      </button>
    </div>
  )

  let header = ''
  let list: React.ReactNode = null
  const rowsWrapKey = 'cric-' + subTab // erzwingt Remount beim Tab-Wechsel

  if (subTab === 'mpd') {
    header = 'Marks per Dart'
    const rows = (efficiency.mpd ?? []).map((r: any, idx: number) => (
      <div key={`mpd-${r.playerId ?? idx}`} style={rowStyle()}>
        <div style={{ display: 'flex', alignItems: 'baseline', minWidth: 0 }}>
          <div style={nameStyle()}>{idx + 1}. {nameOf(r.playerId)}</div>
          <div style={metaStyle()}>Marks {r.marks} · Darts {r.darts}</div>
        </div>
        <div style={valueStyle()}>{fmtFixed2(r.mpd)}</div>
      </div>
    ))
    list = rows.length ? rows : <div style={{ ...ui.sub, textAlign: 'center', padding: '16px 0' }}>Noch zu wenige Daten (mind. 30 Darts).</div>
  }

  if (subTab === 'mpt') {
    header = 'Marks per Turn'
    const rows = (efficiency.mpt ?? []).map((r: any, idx: number) => (
      <div key={`mpt-${r.playerId ?? idx}`} style={rowStyle()}>
        <div style={{ display: 'flex', alignItems: 'baseline', minWidth: 0 }}>
          <div style={nameStyle()}>{idx + 1}. {nameOf(r.playerId)}</div>
          <div style={metaStyle()}>Marks {r.marks} · Turns {r.turns}</div>
        </div>
        <div style={valueStyle()}>{fmtFixed2(r.mpt)}</div>
      </div>
    ))
    list = rows.length ? rows : <div style={{ ...ui.sub, textAlign: 'center', padding: '16px 0' }}>Noch zu wenige Daten (mind. 10 Aufnahmen).</div>
  }

  if (subTab === 'nstr') {
    header = 'No-Score-Turn-Rate'
    const rows = (efficiency.nstr ?? []).map((r: any, idx: number) => (
      <div key={`nstr-${r.playerId ?? idx}`} style={rowStyle()}>
        <div style={{ display: 'flex', alignItems: 'baseline', minWidth: 0 }}>
          <div style={nameStyle()}>{idx + 1}. {nameOf(r.playerId)}</div>
          <div style={metaStyle()}>No-Score {r.noScoreTurns} · Turns {r.turns}</div>
        </div>
        <div style={valueStyle()}>{fmtPct(r.noScoreTurnRate)}</div>
      </div>
    ))
    list = rows.length ? rows : <div style={{ ...ui.sub, textAlign: 'center', padding: '16px 0' }}>Noch zu wenige Daten (mind. 10 Aufnahmen).</div>
  }

  if (subTab === 'triple') {
    header = 'Triple Hunter'
    const rows = (data.tripleHunter ?? []).map((r: CricketTripleHunterRow, idx: number) => (
      <div key={`triple-${r.playerId ?? idx}`} style={rowStyle()}>
        <div style={nameStyle()}>{idx + 1}. {r.name ?? nameOf(r.playerId)}</div>
        <div style={valueStyle()}>{r.triplesHit ?? 0}× T</div>
      </div>
    ))
    list = rows.length ? rows : <div style={{ ...ui.sub, textAlign: 'center', padding: '16px 0' }}>Noch keine Triple-Daten.</div>
  }

  if (subTab === 'turn') {
    header = 'Best Turn'
    const rows = (data.bestTurn ?? []).map((r: CricketBestTurnRow, idx: number) => (
      <div key={`turn-${r.playerId ?? idx}`} style={rowStyle()}>
        <div style={nameStyle()}>{idx + 1}. {r.name ?? nameOf(r.playerId)}</div>
        <div style={valueStyle()}>{(r.marks ?? 0)} Marks</div>
      </div>
    ))
    list = rows.length ? rows : <div style={{ ...ui.sub, textAlign: 'center', padding: '16px 0' }}>Kein High-Turn gefunden.</div>
  }

  if (subTab === 'fastest') {
    header = 'Fastest Leg'
    const rows = (data.fastestLeg ?? []).map((r: CricketFastestLegRow, idx: number) => (
      <div key={`fast-${r.playerId ?? idx}`} style={rowStyle()}>
        <div style={nameStyle()}>{idx + 1}. {r.name ?? nameOf(r.playerId)}</div>
        <div style={valueStyle()}>{r.dartsThrown ?? 0} Darts / {r.marksTotal ?? 0} Marks</div>
      </div>
    ))
    list = rows.length ? rows : <div style={{ ...ui.sub, textAlign: 'center', padding: '16px 0' }}>Noch kein komplettes Cricket-Leg beendet.</div>
  }

  return (
    <div style={{ ...ui.card, maxWidth: 560, margin: '12px auto' }}>
      {subTabBar}
      <div style={sectionHeaderStyle()}>{header}</div>
      <div key={rowsWrapKey}>{list}</div>
    </div>
  )
}

/* =========================
   X01-Teil (unverändert)
   ========================= */

type X01InnerTab = 'visits' | 'checkouts' | 'bestlegs' | 'worstlegs' | 'bestpct' | 'worstpct'

function X01TabView({ data }: { data: X01LeaderboardsUI }) {
  const [subTab, setSubTab] = useState<X01InnerTab>('visits')

  const subTabBar = (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        background: '#f8fafc',
        borderRadius: 10,
        padding: 4,
        justifyContent: 'center',
        marginBottom: 16,
      }}
    >
      <button style={tabButtonStyle(subTab === 'visits')} onClick={() => setSubTab('visits')}>
        High Visits
      </button>
      <button style={tabButtonStyle(subTab === 'checkouts')} onClick={() => setSubTab('checkouts')}>
        High Checkouts
      </button>
      <button style={tabButtonStyle(subTab === 'bestlegs')} onClick={() => setSubTab('bestlegs')}>
        Best Legs
      </button>
      <button style={tabButtonStyle(subTab === 'worstlegs')} onClick={() => setSubTab('worstlegs')}>
        Worst Legs
      </button>
      <button style={tabButtonStyle(subTab === 'bestpct')} onClick={() => setSubTab('bestpct')}>
        Best Checkout %
      </button>
      <button style={tabButtonStyle(subTab === 'worstpct')} onClick={() => setSubTab('worstpct')}>
        Worst Checkout %
      </button>
    </div>
  )

  let header = ''
  let rows: React.ReactNode[] = []

  if (subTab === 'visits') {
    header = 'High Visits'
    rows = data.highVisits.map((r: X01HighVisitRow, idx: number) => (
      <div key={idx} style={rowStyle()}>
        <div style={nameStyle()}>
          {idx + 1}. {r.playerName}
        </div>
        <div style={valueStyle()}>
          {r.value}
        </div>
      </div>
    ))
  } else if (subTab === 'checkouts') {
    header = 'High Checkouts'
    rows = data.highCheckouts.map((r: X01HighCheckoutRow, idx: number) => (
      <div key={idx} style={rowStyle()}>
        <div style={nameStyle()}>
          {idx + 1}. {r.playerName}
        </div>
        <div style={valueStyle()}>
          {r.value}
        </div>
      </div>
    ))
  } else if (subTab === 'bestlegs') {
    header = 'Best Legs'
    rows = data.bestLegs.map((r: X01LegRow, idx: number) => (
      <div key={idx} style={rowStyle()}>
        <div style={nameStyle()}>
          {idx + 1}. {r.playerName}
        </div>
        <div style={valueStyle()}>
          {r.darts} Darts
        </div>
      </div>
    ))
  } else if (subTab === 'worstlegs') {
    header = 'Worst Legs'
    rows = data.worstLegs.map((r: X01LegRow, idx: number) => (
      <div key={idx} style={rowStyle()}>
        <div style={nameStyle()}>
          {idx + 1}. {r.playerName}
        </div>
        <div style={valueStyle()}>
          {r.darts} Darts
        </div>
      </div>
    ))
  } else if (subTab === 'bestpct') {
    header = 'Best Checkout %'
    rows = data.bestCheckoutPct.map((r: X01CheckoutPctRow, idx: number) => (
      <div key={idx} style={rowStyle()}>
        <div style={nameStyle()}>
          {idx + 1}. {r.playerName}
        </div>
        <div style={valueStyle()}>
          {r.value.toFixed(1)} %
        </div>
      </div>
    ))
  } else if (subTab === 'worstpct') {
    header = 'Worst Checkout %'
    rows = data.worstCheckoutPct.map((r: X01CheckoutPctRow, idx: number) => (
      <div key={idx} style={rowStyle()}>
        <div style={nameStyle()}>
          {idx + 1}. {r.playerName}
        </div>
        <div style={valueStyle()}>
          {r.value.toFixed(1)} %
        </div>
      </div>
    ))
  }

  return (
    <div style={{ ...ui.card, maxWidth: 560, margin: '12px auto' }}>
      {subTabBar}
      <div style={sectionHeaderStyle()}>{header}</div>
      <div>{rows}</div>
    </div>
  )
}

/* =========================
   Hauptkomponente
   ========================= */

export default function HallOfFame({ onBack }: Props) {
  // Ober-Tab: X01 vs Cricket
  const [modeTab, setModeTab] = useState<'x01' | 'cricket'>('x01')

  // Cricket-Leaderboards (lokal)
  const cricketData: CricketLeaderboardsUI = useMemo(() => {
    try {
      return getCricketLeaderboards()
    } catch {
      return {
        // bullMaster entfällt -> Effizienz ersetzt das
        tripleHunter: [],
        bestTurn: [],
        fastestLeg: [],
      } as unknown as CricketLeaderboardsUI
    }
  }, [])

  // X01-Data (aus bestehendem loadLeaderboards normalisiert)
  const x01Data: X01LeaderboardsUI = useMemo(() => {
    const raw = loadLeaderboards()
    return {
      highVisits: raw.highVisits.map((v: any) => ({
        playerId: v.playerId,
        playerName: v.playerName,
        matchId: v.matchId,
        value: v.value,
        ts: v.ts,
      })),
      highCheckouts: raw.highCheckouts.map((v: any) => ({
        playerId: v.playerId,
        playerName: v.playerName,
        matchId: v.matchId,
        value: v.value,
        ts: v.ts,
      })),
      bestLegs: raw.bestLegs.map((l: any) => ({
        playerId: l.playerId,
        playerName: l.playerName,
        matchId: l.matchId,
        darts: l.darts,
        ts: l.ts,
      })),
      worstLegs: raw.worstLegs.map((l: any) => ({
        playerId: l.playerId,
        playerName: l.playerName,
        matchId: l.matchId,
        darts: l.darts,
        ts: l.ts,
      })),
      bestCheckoutPct: raw.bestCheckoutPct.map((p: any) => ({
        playerId: p.playerId,
        playerName: p.playerName,
        value: p.value,
        attempts: p.attempts,
        made: p.made,
      })),
      worstCheckoutPct: raw.worstCheckoutPct.map((p: any) => ({
        playerId: p.playerId,
        playerName: p.playerName,
        value: p.value,
        attempts: p.attempts,
        made: p.made,
      })),
    }
  }, [])

  return (
    <div style={ui.page}>
      {/* Header */}
      <div style={ui.headerRow}>
        <div>
          <h2 style={{ margin: 0 }}>Hall of Fame</h2>
          <div style={ui.sub}>Bestleistungen aller Zeiten</div>
        </div>
        <button style={ui.backBtn} onClick={onBack}>
          ← Zurück
        </button>
      </div>

      {/* Ober-Tab (X01 / Cricket) */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          background: '#f8fafc',
          borderRadius: 10,
          padding: 4,
          marginTop: 12,
          justifyContent: 'center',
        }}
      >
        <button
          style={tabButtonStyle(modeTab === 'x01')}
          onClick={() => setModeTab('x01')}
        >
          X01
        </button>
        <button
          style={tabButtonStyle(modeTab === 'cricket')}
          onClick={() => setModeTab('cricket')}
        >
          Cricket
        </button>
      </div>

      {/* Inhalt */}
      <div style={{ marginTop: 16 }}>
        {modeTab === 'x01' ? (
          <X01TabView data={x01Data} />
        ) : (
          <CricketTabView data={cricketData} />
        )}
      </div>
    </div>
  )
}
