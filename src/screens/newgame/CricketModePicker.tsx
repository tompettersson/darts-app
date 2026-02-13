import React, { useMemo, useState } from 'react'
import { getThemedUI } from '../../ui'
import { useTheme } from '../../ThemeProvider'
import {
  CricketRange,
  CricketStyle,
  CricketTarget,
  CricketSetup,
  CutthroatEndgame,
  CrazyMode,
  CrazyScoringMode,
} from '../../types/cricket'

export type { CricketSetup, CricketRange, CricketStyle, CricketTarget, CutthroatEndgame, CrazyMode, CrazyScoringMode }

type ScoringMode = 'standard' | 'cutthroat' | 'simple'

export default function CricketModePicker({
  onBack,
  onConfirm,
}: {
  onBack?: () => void
  onConfirm: (cfg: CricketSetup) => void
}) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [range, setRange] = useState<CricketRange>('short')
  const [scoring, setScoring] = useState<ScoringMode>('standard')
  const [endgameMode, setEndgameMode] = useState<CutthroatEndgame>('standard')

  // Varianten
  const [crazyActive, setCrazyActive] = useState(false)
  const [crazyMode, setCrazyMode] = useState<CrazyMode>('normal')
  const [crazySameForAll, setCrazySameForAll] = useState(true)

  const targets: CricketSetup['targets'] =
    range === 'short'
      ? [20,19,18,17,16,15,'BULL']
      : [20,19,18,17,16,15,14,13,12,11,10,'BULL']

  // Mapping auf bestehendes Type-System
  function buildConfig(): CricketSetup {
    const style: CricketStyle = crazyActive ? 'crazy' : scoring

    return {
      gameType: 'cricket',
      range,
      style,
      targets,
      cutthroatEndgame: (scoring === 'cutthroat') ? endgameMode : undefined,
      crazyMode: crazyActive ? crazyMode : undefined,
      crazyScoringMode: crazyActive ? scoring : undefined,
      crazySameForAll: crazyActive ? crazySameForAll : undefined,
    }
  }

  // Styles
  const s = {
    pill: (active: boolean): React.CSSProperties => ({
      padding: '6px 10px',
      borderRadius: 8,
      border: `1px solid ${active ? colors.accent : colors.border}`,
      background: active ? (isArcade ? colors.accent : '#e0f2fe') : colors.bgCard,
      color: active ? (isArcade ? '#fff' : '#0369a1') : colors.fg,
      fontWeight: 600,
      fontSize: 13,
      cursor: 'pointer',
      flex: 1,
      textAlign: 'center',
    }),
    miniPill: (active: boolean): React.CSSProperties => ({
      padding: '4px 8px',
      borderRadius: 6,
      border: `1px solid ${active ? colors.accent : colors.border}`,
      background: active ? (isArcade ? colors.accent : '#e0f2fe') : colors.bgCard,
      color: active ? (isArcade ? '#fff' : '#0369a1') : colors.fg,
      fontWeight: 500,
      fontSize: 12,
      cursor: 'pointer',
    }),
    variantPill: (active: boolean): React.CSSProperties => ({
      padding: '6px 10px',
      borderRadius: 8,
      border: `1px solid ${active ? colors.warning : colors.border}`,
      background: active ? colors.warningBg : colors.bgCard,
      color: active ? colors.warning : colors.fg,
      fontWeight: 600,
      fontSize: 13,
      cursor: 'pointer',
    }),
    row: { display: 'flex', gap: 6, alignItems: 'center' } as React.CSSProperties,
    optionRow: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '5px 0',
    } as React.CSSProperties,
    label: {
      fontSize: 13,
      color: colors.fgMuted,
      fontWeight: 500,
      minWidth: 55,
    } as React.CSSProperties,
    section: {
      marginBottom: 10,
    } as React.CSSProperties,
    sectionTitle: {
      ...styles.sub,
      marginBottom: 4,
      fontSize: 11,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    } as React.CSSProperties,
  }

  return (
    <div style={styles.centerPage}>
      <div style={styles.centerInner}>
        <div style={{ ...styles.card, maxWidth: 380 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ ...styles.title, fontSize: 18, marginBottom: 4 }}>Cricket – Modus</div>

            {/* 1. Länge */}
            <div style={s.section}>
              <div style={s.sectionTitle}>Länge</div>
              <div style={s.row}>
                <button type="button" style={s.pill(range === 'short')} onClick={() => setRange('short')}>
                  Short (15–20)
                </button>
                <button type="button" style={s.pill(range === 'long')} onClick={() => setRange('long')}>
                  Long (10–20)
                </button>
              </div>
            </div>

            {/* 2. Punkte */}
            <div style={s.section}>
              <div style={s.sectionTitle}>Punkte</div>
              <div style={s.row}>
                <button type="button" style={s.pill(scoring === 'standard')} onClick={() => setScoring('standard')}>
                  Standard
                </button>
                <button type="button" style={s.pill(scoring === 'cutthroat')} onClick={() => setScoring('cutthroat')}>
                  Cutthroat
                </button>
                <button type="button" style={s.pill(scoring === 'simple')} onClick={() => setScoring('simple')}>
                  Simple
                </button>
              </div>
              <div style={{ ...styles.sub, marginTop: 4, fontSize: 11 }}>
                {scoring === 'standard' && 'Overflow = Punkte. Alle zu + meiste Punkte gewinnt.'}
                {scoring === 'cutthroat' && 'Overflow = Strafpunkte für Gegner. Wenigste Punkte gewinnt.'}
                {scoring === 'simple' && 'Keine Punkte. Schnellster gewinnt.'}
              </div>
            </div>

            {/* Cutthroat Endgame Sub-Option */}
            {scoring === 'cutthroat' && (
              <div style={{ background: colors.bgMuted, borderRadius: 8, padding: 8, margin: '-4px -8px 6px' }}>
                <div style={s.optionRow}>
                  <span style={s.label}>Endgame</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" style={s.miniPill(endgameMode === 'standard')} onClick={() => setEndgameMode('standard')}>
                      3 Runden
                    </button>
                    <button type="button" style={s.miniPill(endgameMode === 'suddenDeath')} onClick={() => setEndgameMode('suddenDeath')}>
                      Sudden Death
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Varianten */}
            <div style={s.section}>
              <div style={s.sectionTitle}>Varianten</div>
              <div style={s.row}>
                <button
                  type="button"
                  style={s.variantPill(crazyActive)}
                  onClick={() => setCrazyActive(!crazyActive)}
                >
                  {crazyActive ? '✕ ' : ''}Crazy
                </button>
              </div>
            </div>

            {/* Crazy Sub-Optionen */}
            {crazyActive && (
              <div style={{ background: colors.warningBg, borderRadius: 8, padding: 8, margin: '-4px -8px 6px' }}>
                <div style={s.optionRow}>
                  <span style={s.label}>Darts</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" style={s.miniPill(crazyMode === 'normal')} onClick={() => setCrazyMode('normal')}>
                      1 Ziel/Turn
                    </button>
                    <button type="button" style={s.miniPill(crazyMode === 'pro')} onClick={() => setCrazyMode('pro')}>
                      3 Ziele/Turn
                    </button>
                  </div>
                </div>
                <div style={s.optionRow}>
                  <span style={s.label}>Zielzahl</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" style={s.miniPill(crazySameForAll)} onClick={() => setCrazySameForAll(true)}>
                      Gleich für alle
                    </button>
                    <button type="button" style={s.miniPill(!crazySameForAll)} onClick={() => setCrazySameForAll(false)}>
                      Pro Spieler
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Targets Vorschau */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
              {targets.map(t => (
                <span key={String(t)} style={{ ...styles.badge, padding: '2px 6px', fontSize: 11 }}>
                  {t === 'BULL' ? 'B' : t}
                </span>
              ))}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
              {onBack
                ? <button type="button" style={{ ...styles.btnGhost, padding: '8px 12px' }} onClick={onBack}>← Zurück</button>
                : <span />}
              <button
                type="button"
                style={{ ...styles.btnPrimary, padding: '8px 16px' }}
                onClick={() => onConfirm(buildConfig())}
              >
                Weiter →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
