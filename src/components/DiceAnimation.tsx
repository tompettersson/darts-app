// src/components/DiceAnimation.tsx
// Reusable dice rolling animation with sound — used in lobby + local game setup

import React, { useState, useEffect } from 'react'

/** Synthesized dice rolling sound */
export function playDiceSound() {
  try {
    const ctx = new AudioContext()
    const time = ctx.currentTime
    const hits = 14
    for (let i = 0; i < hits; i++) {
      const progress = i / hits
      const t = time + progress * progress * 1.4
      const bufLen = Math.floor(ctx.sampleRate * 0.012)
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let j = 0; j < bufLen; j++) data[j] = (Math.random() * 2 - 1)
      const source = ctx.createBufferSource()
      source.buffer = buf
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(2000 + Math.random() * 2000, t)
      bp.Q.setValueAtTime(2, t)
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.2 + (1 - progress) * 0.15, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02)
      source.connect(bp); bp.connect(gain); gain.connect(ctx.destination)
      source.start(t); source.stop(t + 0.03)
    }
    for (let k = 0; k < 2; k++) {
      const thudT = time + 1.45 + k * 0.12
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(180 - k * 40, thudT)
      osc.frequency.exponentialRampToValueAtTime(60, thudT + 0.08)
      g.gain.setValueAtTime(0.2, thudT)
      g.gain.exponentialRampToValueAtTime(0.001, thudT + 0.1)
      osc.connect(g); g.connect(ctx.destination)
      osc.start(thudT); osc.stop(thudT + 0.12)
    }
  } catch { /* ignore */ }
}

const DOTS: Record<number, number[][]> = {
  1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]], 5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
}

export default function DiceAnimation({ onDone }: { onDone: () => void }) {
  const [rolling, setRolling] = useState(true)
  const [face, setFace] = useState(1)

  useEffect(() => {
    playDiceSound()
    const interval = setInterval(() => setFace(Math.floor(Math.random() * 6) + 1), 80)
    const timer = setTimeout(() => { clearInterval(interval); setRolling(false); setTimeout(onDone, 800) }, 1500)
    return () => { clearInterval(interval); clearTimeout(timer) }
  }, [onDone])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
    }}>
      <div style={{
        width: 80, height: 80, background: '#fff', borderRadius: 12,
        display: 'grid', gridTemplateRows: 'repeat(3, 1fr)', gridTemplateColumns: 'repeat(3, 1fr)',
        padding: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        transform: rolling ? `rotate(${face * 60}deg)` : 'rotate(0deg)',
        transition: rolling ? 'transform 0.08s' : 'transform 0.3s ease-out',
      }}>
        {Array.from({ length: 9 }).map((_, i) => {
          const row = Math.floor(i / 3), col = i % 3
          const active = DOTS[face]?.some(([r, c]) => r === row && c === col)
          return <div key={i} style={{
            width: 14, height: 14, borderRadius: '50%', margin: 'auto',
            background: active ? '#111' : 'transparent', transition: 'background 0.05s',
          }} />
        })}
      </div>
      <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, textAlign: 'center' }}>
        {rolling ? 'Würfle Reihenfolge...' : 'Fertig!'}
      </div>
    </div>
  )
}
