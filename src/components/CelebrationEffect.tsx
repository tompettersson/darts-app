// src/components/CelebrationEffect.tsx
// Lightweight CSS-only confetti/particle celebration effect
// No external libraries - pure CSS animations with random positioned divs

import React, { useEffect, useState } from 'react'

type Props = {
  type: '180' | 'high-checkout' | 'match-win' | 'shanghai'
  duration?: number // ms, default 2000
  onComplete?: () => void
}

const COLOR_PALETTES: Record<Props['type'], string[]> = {
  '180': ['#fbbf24', '#f59e0b', '#eab308', '#fde68a', '#fef3c7', '#d97706'],
  'high-checkout': ['#22c55e', '#16a34a', '#4ade80', '#86efac', '#34d399', '#059669'],
  'match-win': ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4', '#f97316'],
  'shanghai': ['#ef4444', '#dc2626', '#fbbf24', '#f59e0b', '#eab308', '#b91c1c'],
}

type Particle = {
  id: number
  x: number
  y: number
  color: string
  size: number
  angle: number    // rotation end
  drift: number    // horizontal drift
  delay: number    // animation delay
  duration: number // animation duration
  shape: 'square' | 'circle' | 'rect'
}

function generateParticles(type: Props['type']): Particle[] {
  const palette = COLOR_PALETTES[type]
  const count = type === 'match-win' ? 40 : 25
  const particles: Particle[] = []

  for (let i = 0; i < count; i++) {
    particles.push({
      id: i,
      x: Math.random() * 100,           // % from left
      y: -10 - Math.random() * 20,       // start above viewport
      color: palette[Math.floor(Math.random() * palette.length)],
      size: 4 + Math.random() * 8,
      angle: Math.random() * 720 - 360,
      drift: Math.random() * 60 - 30,    // px horizontal drift
      delay: Math.random() * 400,        // ms
      duration: 1200 + Math.random() * 1000,
      shape: (['square', 'circle', 'rect'] as const)[Math.floor(Math.random() * 3)],
    })
  }
  return particles
}

export default function CelebrationEffect({ type, duration = 2000, onComplete }: Props) {
  const [particles] = useState(() => generateParticles(type))
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      onComplete?.()
    }, duration)
    return () => clearTimeout(timer)
  }, [duration, onComplete])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10000,
        overflow: 'hidden',
      }}
    >
      {particles.map((p) => {
        const w = p.shape === 'rect' ? p.size * 0.5 : p.size
        const h = p.shape === 'rect' ? p.size * 1.5 : p.size
        const borderRadius = p.shape === 'circle' ? '50%' : p.shape === 'rect' ? '2px' : '1px'

        return (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: w,
              height: h,
              background: p.color,
              borderRadius,
              opacity: 0,
              animation: `celebFall${p.id} ${p.duration}ms ${p.delay}ms ease-in forwards`,
            }}
          />
        )
      })}
      <style>{particles.map((p) => `
        @keyframes celebFall${p.id} {
          0% {
            opacity: 1;
            transform: translateY(0) translateX(0) rotate(0deg) scale(1);
          }
          20% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translateY(${window.innerHeight + 50}px) translateX(${p.drift}px) rotate(${p.angle}deg) scale(0.5);
          }
        }
      `).join('\n')}</style>
    </div>
  )
}
