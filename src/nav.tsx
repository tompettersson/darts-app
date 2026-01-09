// src/nav.tsx
import React, { createContext, useContext, useMemo, useState } from 'react'

export type Route =
  | { name: 'menu' }
  | { name: 'highscores' }
  | { name: 'players' }
  | { name: 'matchHistory' }
  | { name: 'matchDetails'; matchId: string }

type Nav = {
  route: Route
  push: (r: Route) => void
  replace: (r: Route) => void
  pop: () => void
  reset: (r?: Route) => void
  canPop: boolean
}

const NavCtx = createContext<Nav | null>(null)

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<Route[]>([{ name: 'menu' }])

  const nav = useMemo<Nav>(() => {
    const route = stack[stack.length - 1]
    return {
      route,
      push: (r) => setStack((s) => [...s, r]),
      replace: (r) => setStack((s) => (s.length ? [...s.slice(0, -1), r] : [r])),
      pop: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
      reset: (r = { name: 'menu' }) => setStack([r]),
      canPop: stack.length > 1,
    }
  }, [stack])

  return <NavCtx.Provider value={nav}>{children}</NavCtx.Provider>
}

export function useNav() {
  const v = useContext(NavCtx)
  if (!v) throw new Error('useNav must be used within NavProvider')
  return v
}
