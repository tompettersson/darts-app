// src/screens/ProfileBackup.tsx
import React, { useRef } from 'react'
import { ui } from '../ui'
import { exportBackup, importBackupMerge, type BackupBundle } from '../storage'

export default function ProfileBackup({ onBack }: { onBack: () => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null)

  function handleExport() {
    const data = exportBackup()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    a.href = url
    a.download = `darts-backup-${ts}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function triggerImport() {
    fileRef.current?.click()
  }

  async function onImportChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const txt = await file.text()
      const json = JSON.parse(txt) as BackupBundle
      if (!confirm('Import (MERGE): Daten werden zusammengeführt. Fortfahren?')) return
      importBackupMerge(json)
      alert('Import (Merge) erfolgreich. Die App lädt neu.')
      location.reload()
    } catch (err: any) {
      console.error(err)
      alert('Import fehlgeschlagen: ' + (err?.message ?? String(err)))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div style={ui.page}>
      <div style={ui.headerRow}>
        <h2 style={ui.title}>Profile sichern/laden</h2>
        <button style={ui.backBtn} onClick={onBack}>← Zurück</button>
      </div>

      <div style={ui.centerPage}>
        <div style={ui.centerInner}>
          <div style={ui.card}>
            <div style={{ display: 'grid', gap: 8 }}>
              <button onClick={handleExport} style={ui.tile}>
                <div style={ui.title}>Profile sichern</div>
                <div style={ui.sub}>Profiles, Matches, Leaderboards (rebuild), Outbox → JSON</div>
              </button>

              <button onClick={triggerImport} style={ui.tile}>
                <div style={ui.title}>Profile laden (MERGE)</div>
                <div style={ui.sub}>JSON importieren und lokale Daten zusammenführen</div>
              </button>

              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                onChange={onImportChange}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          <div style={{ ...ui.sub, textAlign: 'center' }}>
            Beim Import (Merge) behalten wir vorhandene Daten und fügen neue hinzu.
          </div>
        </div>
      </div>
    </div>
  )
}
