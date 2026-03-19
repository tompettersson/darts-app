// src/components/Accordion.tsx
// Wiederverwendbare Akkordeon-Komponente für Stats-Sektionen

import React, { useState, type ReactNode, type CSSProperties } from 'react'
import { useTheme } from '../ThemeProvider'

type AccordionProps = {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

export default function Accordion({ title, defaultOpen = false, children }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const { colors } = useTheme()

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    cursor: 'pointer',
    userSelect: 'none',
    borderBottom: open ? `1px solid ${colors.bgMuted}` : 'none',
  }

  const titleStyle: CSSProperties = {
    fontSize: 14,
    fontWeight: 700,
    color: colors.fgMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }

  const chevronStyle: CSSProperties = {
    fontSize: 12,
    color: colors.fgDim,
    transition: 'transform .2s ease',
    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
  }

  const bodyStyle: CSSProperties = {
    padding: open ? '0 16px 16px' : '0 16px',
    maxHeight: open ? 2000 : 0,
    overflow: 'hidden',
    transition: 'max-height .25s ease, padding .25s ease',
  }

  return (
    <div style={{ borderBottom: `1px solid ${colors.bgMuted}` }}>
      <div style={headerStyle} onClick={() => setOpen(o => !o)}>
        <span style={titleStyle}>{title}</span>
        <span style={chevronStyle}>▼</span>
      </div>
      <div style={bodyStyle}>
        {children}
      </div>
    </div>
  )
}
