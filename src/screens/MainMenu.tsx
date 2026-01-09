// src/screens/MainMenu.tsx
import React, { useState } from 'react'
import { ui } from '../ui'
import { useNav } from '../nav'

function Tile({
  title,
  sub,
  onClick,
}: {
  title: string
  sub?: string
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      style={{
        ...ui.tile,
        ...(hover ? ui.tileHoverable : null),
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick()
      }}
    >
      <div style={ui.title}>{title}</div>
      {sub ? <div style={ui.sub}>{sub}</div> : null}
    </div>
  )
}

export default function MainMenu() {
  const nav = useNav()

  return (
    <div style={ui.page}>
      <div style={ui.card}>
        <div style={ui.headerRow}>
          <h1 style={ui.pageHeadline}>Menü</h1>
          <div />
        </div>
        <div style={ui.sub}>Navigation: Highscores, Spielerprofile, Matchhistorie</div>
      </div>

      <div style={{ ...ui.grid }}>
        <Tile
          title="Matchhistorie"
          sub="Matchauswahl → Setauswahl → Legauswahl"
          onClick={() => nav.push({ name: 'matchHistory' })}
        />
        <Tile
          title="Highscores"
          sub="Leaderboards & Rekorde"
          onClick={() => nav.push({ name: 'highscores' })}
        />
        <Tile
          title="Spielerprofile"
          sub="Langfristige Stats pro Spieler"
          onClick={() => nav.push({ name: 'players' })}
        />
      </div>
    </div>
  )
}
