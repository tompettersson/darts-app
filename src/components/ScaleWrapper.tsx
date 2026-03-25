// src/components/ScaleWrapper.tsx
// Proportional scaling for non-game screens on small mobile devices
// Always renders the same DOM structure to prevent React unmount/remount on resize

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react'

const DESIGN_WIDTH = 412 // Samsung Galaxy A51/71 baseline

// Context to let game views disable scaling
const ScaleContext = createContext<{ setDisabled: (v: boolean) => void }>({ setDisabled: () => {} })

/** Call this in game screens to disable scaling while mounted */
export function useDisableScale() {
  const { setDisabled } = useContext(ScaleContext)
  useEffect(() => {
    setDisabled(true)
    return () => setDisabled(false)
  }, [setDisabled])
}

export default function ScaleWrapper({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(1)
  const [disabled, setDisabled] = useState(false)

  const update = useCallback(() => {
    const vw = window.innerWidth
    setScale(vw < DESIGN_WIDTH ? vw / DESIGN_WIDTH : 1)
  }, [])

  useEffect(() => {
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [update])

  const shouldScale = !disabled && scale < 1

  // IMPORTANT: Always render the SAME structure to prevent React unmount/remount
  // on orientation change. Only change styles, never swap JSX trees.
  return (
    <ScaleContext.Provider value={{ setDisabled }}>
      <div style={shouldScale ? {
        width: '100vw',
        minHeight: '100dvh',
        overflow: 'auto',
        WebkitOverflowScrolling: 'touch',
      } : undefined}>
        <div style={shouldScale ? {
          width: DESIGN_WIDTH,
          minHeight: '100dvh',
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
        } : undefined}>
          {children}
        </div>
      </div>
    </ScaleContext.Provider>
  )
}
