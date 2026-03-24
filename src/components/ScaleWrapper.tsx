// src/components/ScaleWrapper.tsx
// Proportional scaling for non-game screens on small mobile devices
// Wraps the entire app. Game views opt out via data-noscale attribute on their root.

import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react'

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
  const innerRef = useRef<HTMLDivElement>(null)
  const [innerHeight, setInnerHeight] = useState<number | null>(null)

  const update = useCallback(() => {
    const vw = window.innerWidth
    setScale(vw < DESIGN_WIDTH ? vw / DESIGN_WIDTH : 1)
  }, [])

  useEffect(() => {
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [update])

  // Measure inner content height for outer container
  useEffect(() => {
    if (!innerRef.current || disabled || scale >= 1) return
    const el = innerRef.current
    const ro = new ResizeObserver(() => {
      setInnerHeight(el.scrollHeight)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [disabled, scale])

  const shouldScale = !disabled && scale < 1

  return (
    <ScaleContext.Provider value={{ setDisabled }}>
      {shouldScale ? (
        <div style={{
          width: '100vw',
          minHeight: '100dvh',
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}>
          <div
            ref={innerRef}
            style={{
              width: DESIGN_WIDTH,
              minHeight: '100dvh',
              transformOrigin: 'top left',
              transform: `scale(${scale})`,
            }}
          >
            {children}
          </div>
        </div>
      ) : (
        children
      )}
    </ScaleContext.Provider>
  )
}
