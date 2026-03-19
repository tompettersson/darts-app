// src/components/StreakEffects.tsx
// CSS-only Komponente fuer Streak-Glow und Burn-Effekte
// Glow ab 3 Treffern in Folge, Flammen ab 10

import React from 'react'

type Props = {
  streak: number
  children: React.ReactNode
}

export default function StreakEffects({ streak, children }: Props) {
  if (streak < 3) return <>{children}</>

  const intensity = Math.min((streak - 2) / 8, 1) // 0..1
  const showFlames = streak >= 10

  const glowColor = showFlames
    ? `rgba(255, 100, 0, ${0.4 + intensity * 0.4})`
    : `rgba(255, 180, 0, ${0.2 + intensity * 0.4})`
  const glowSize = 4 + intensity * 16

  const style: React.CSSProperties = {
    position: 'relative',
    display: 'inline-block',
    textShadow: `0 0 ${glowSize}px ${glowColor}`,
    animation: showFlames ? 'streakBurn 0.4s ease-in-out infinite alternate' : 'streakPulse 1.2s ease-in-out infinite',
  }

  return (
    <span style={style}>
      {children}
      {showFlames && (
        <span style={{
          position: 'absolute',
          top: -8,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 16,
          animation: 'flameDance 0.3s ease-in-out infinite alternate',
          pointerEvents: 'none',
        }}>
          🔥
        </span>
      )}
      <style>{`
        @keyframes streakPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
        @keyframes streakBurn {
          0% { text-shadow: 0 0 ${glowSize}px ${glowColor}, 0 0 ${glowSize * 2}px rgba(255,60,0,0.3); }
          100% { text-shadow: 0 0 ${glowSize * 1.5}px ${glowColor}, 0 0 ${glowSize * 3}px rgba(255,60,0,0.5); }
        }
        @keyframes flameDance {
          0% { transform: translateX(-50%) translateY(0) scale(1); }
          100% { transform: translateX(-50%) translateY(-3px) scale(1.15); }
        }
      `}</style>
    </span>
  )
}
