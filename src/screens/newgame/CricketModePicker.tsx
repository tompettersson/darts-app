import React, { useState } from 'react'
import { ui } from '../../ui'
import {
  CricketRange,
  CricketStyle,
  CricketTarget,
  CricketSetup,
} from '../../types/cricket'

// ⬅ WICHTIG: wir exportieren CricketSetup hier nochmal raus,
// damit andere (App.tsx) "from './screens/newgame/CricketModePicker'" importieren können.
export type { CricketSetup, CricketRange, CricketStyle, CricketTarget }

export default function CricketModePicker({
  onBack,
  onConfirm,
}: {
  onBack?: () => void
  onConfirm: (cfg: CricketSetup) => void
}) {
  const [range, setRange] = useState<CricketRange>('short')
  const [cutthroat, setCutthroat] = useState(false)

  const targets: CricketSetup['targets'] =
    range === 'short'
      ? [20,19,18,17,16,15,'BULL']
      : [20,19,18,17,16,15,14,13,12,11,10,'BULL']

  const s = {
    pill: (active: boolean): React.CSSProperties => ({
      padding: '8px 12px',
      borderRadius: 10,
      border: `1px solid ${active ? '#0ea5e9' : '#e5e7eb'}`,
      background: active ? '#e0f2fe' : '#fff',
      color: active ? '#0369a1' : '#0f172a',
      fontWeight: 700,
      cursor: 'pointer',
    }),
    row: { display: 'flex', gap: 8, alignItems: 'center' } as React.CSSProperties,
  }

  return (
    <div style={ui.centerPage}>
      <div style={ui.centerInner}>
        <div style={ui.card}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={ui.title}>Cricket – Modus wählen</div>

            {/* Range */}
            <div>
              <div style={{ ...ui.sub, marginBottom: 6 }}>Zielzahlen</div>
              <div style={s.row}>
                <button
                  type="button"
                  style={s.pill(range === 'short')}
                  onClick={() => setRange('short')}
                >
                  Short (15–20)
                </button>
                <button
                  type="button"
                  style={s.pill(range === 'long')}
                  onClick={() => setRange('long')}
                >
                  Long (10–20)
                </button>
              </div>
            </div>

            {/* Style */}
            <div>
              <div style={{ ...ui.sub, marginBottom: 6 }}>Variante</div>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={cutthroat}
                  onChange={(e) => setCutthroat(e.target.checked)}
                />
                <span style={{ fontWeight: 700 }}>Cutthroat aktivieren</span>
                <span style={{ ...ui.sub, marginLeft: 6 }}>(ohne Haken: Standard)</span>
              </label>
            </div>

            {/* Vorschau Targets */}
            <div>
              <div style={{ ...ui.sub, marginBottom: 6 }}>Targets</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {targets.map(t => (
                  <span key={String(t)} style={ui.badge}>
                    {t === 'BULL' ? 'BULL' : t}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              {onBack
                ? <button type="button" style={ui.btnGhost} onClick={onBack}>← Zurück</button>
                : <span />}
              <button
                type="button"
                style={ui.btnPrimary}
                onClick={() =>
                  onConfirm({
                    gameType: 'cricket',
                    range,
                    style: cutthroat ? 'cutthroat' : 'standard',
                    targets,
                  })
                }
              >
                Weiter
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
