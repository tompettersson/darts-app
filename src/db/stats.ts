// src/db/stats.ts
// Re-export everything from sub-modules for backward compatibility
// All implementations have been moved to src/db/stats/

export * from './stats/index'

// Dev Helpers - attach to window for debugging
if (typeof window !== 'undefined') {
  import('./stats/index').then((mod) => {
    ;(window as any).sqlStats = mod
  })
}
