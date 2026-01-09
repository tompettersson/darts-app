// src/screens/Home.tsx
import React from 'react'
import { getLastOpenMatchId, loadMatchById } from '../storage'

type HomeProps = { onContinue?: ()=>void; onNew: ()=>void; onStats: ()=>void }

export default function Home({ onContinue, onNew, onStats }: HomeProps){
  const lastId = getLastOpenMatchId()
  const open = lastId ? loadMatchById(lastId) : undefined

  return (
    <div style={{display:'grid', gap:12}}>
      <h1 style={{marginTop:0}}>Hauptmenü</h1>
      <button
        onClick={onContinue}
        disabled={!onContinue || !open}
        style={{padding:12, fontSize:16}}
      >
        Spiel fortsetzen {open ? `(${open.title})` : ''}
      </button>
      <button onClick={onNew} style={{padding:12, fontSize:16}}>Neues Spiel</button>
      <button onClick={onStats} style={{padding:12, fontSize:16}}>Statistiken</button>
    </div>
  )
}
