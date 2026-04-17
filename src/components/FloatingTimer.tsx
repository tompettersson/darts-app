import React from 'react'

/**
 * Schwebender Timer unten rechts — nur für Mobile-Ansicht gedacht.
 * Transparent, nicht anklickbar, dunkelgraue Zahlen auf transparentem Hintergrund.
 */
export default function FloatingTimer({ elapsedMs }: { elapsedMs: number }) {
  const minutes = Math.floor(elapsedMs / 60000)
  const seconds = Math.floor((elapsedMs % 60000) / 1000)
  const formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        bottom: 'calc(6px + env(safe-area-inset-bottom, 0px))',
        right: 'calc(8px + env(safe-area-inset-right, 0px))',
        fontFamily: 'monospace',
        fontSize: 12,
        fontWeight: 600,
        color: '#666',
        background: 'transparent',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 100,
        letterSpacing: '0.5px',
      }}
    >
      {formatted}
    </div>
  )
}
