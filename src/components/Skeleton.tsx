import React from 'react'

/**
 * Skeleton-Loader für Lazy-Loaded Screens.
 * Zeigt animierte Platzhalter-Blöcke an.
 */
export default function Skeleton({ rows = 4, colors }: { rows?: number; colors?: { bgDim?: string; border?: string } }) {
  const bg = colors?.bgDim ?? '#e5e7eb'
  const shimmer = colors?.border ?? '#f3f4f6'

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Title skeleton */}
      <div style={{ width: '40%', height: 24, borderRadius: 8, background: bg, animation: 'skeletonPulse 1.5s ease-in-out infinite' }} />
      {/* Content rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          display: 'flex', gap: 10, alignItems: 'center',
          animation: `skeletonPulse 1.5s ease-in-out ${i * 0.1}s infinite`,
        }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: bg, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ width: `${70 - i * 8}%`, height: 14, borderRadius: 6, background: bg }} />
            <div style={{ width: `${50 - i * 5}%`, height: 10, borderRadius: 4, background: shimmer }} />
          </div>
        </div>
      ))}
      <style>{`
        @keyframes skeletonPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
