// src/screens/ProfileBackup.tsx
import React, { useRef } from 'react'
import { ui } from '../ui'
import { exportBackup, importBackupMerge, type BackupBundle } from '../storage'
import { exportDB, importDB } from '../db/index'

export default function ProfileBackup({ onBack }: { onBack: () => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const sqliteFileRef = useRef<HTMLInputElement | null>(null)

  // ============================================================================
  // JSON Backup (Legacy - Merge)
  // ============================================================================

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

  // ============================================================================
  // SQLite Backup (Vollständig)
  // ============================================================================

  async function handleSQLiteExport() {
    try {
      const data = await exportDB()
      const blob = new Blob([new Uint8Array(data)], { type: 'application/x-sqlite3' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      a.href = url
      a.download = `darts-sqlite-${ts}.sqlite`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error(err)
      alert('SQLite-Export fehlgeschlagen: ' + (err?.message ?? String(err)))
    }
  }

  function triggerSQLiteImport() {
    sqliteFileRef.current?.click()
  }

  async function onSQLiteImportChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      if (!confirm('ACHTUNG: Alle aktuellen Daten werden ERSETZT! Fortfahren?')) return
      const buffer = await file.arrayBuffer()
      const data = new Uint8Array(buffer)
      await importDB(data)
      alert('SQLite-Import erfolgreich. Die App lädt neu.')
      location.reload()
    } catch (err: any) {
      console.error(err)
      alert('SQLite-Import fehlgeschlagen: ' + (err?.message ?? String(err)))
    } finally {
      if (sqliteFileRef.current) sqliteFileRef.current.value = ''
    }
  }

  return (
    <div style={ui.page}>
      <div style={ui.headerRow}>
        <h2 style={ui.title}>Backup & Restore</h2>
        <button style={ui.backBtn} onClick={onBack}>← Zurück</button>
      </div>

      <div style={ui.centerPage}>
        <div style={ui.centerInner}>
          <div style={ui.card}>
            <div style={{ display: 'grid', gap: 8 }}>
              {/* JSON Backup Sektion */}
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                JSON-Backup (Merge)
              </div>

              <button onClick={handleExport} style={ui.tile}>
                <div style={ui.title}>Profile sichern</div>
                <div style={ui.sub}>Profiles, Matches, Leaderboards → JSON</div>
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

              {/* Trennlinie */}
              <div style={{ borderTop: '1px solid #e5e7eb', margin: '8px 0', paddingTop: 12 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                  SQLite-Datenbank (Vollständig)
                </div>
              </div>

              <button onClick={handleSQLiteExport} style={ui.tile}>
                <div style={ui.title}>SQLite sichern</div>
                <div style={ui.sub}>Komplette Datenbank als .sqlite-Datei exportieren</div>
              </button>

              <button onClick={triggerSQLiteImport} style={ui.tile}>
                <div style={ui.title}>SQLite laden</div>
                <div style={ui.sub}>Datenbank aus .sqlite-Datei wiederherstellen (ERSETZT alle Daten!)</div>
              </button>

              <input
                ref={sqliteFileRef}
                type="file"
                accept=".sqlite,.db"
                onChange={onSQLiteImportChange}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          <div style={{ ...ui.sub, textAlign: 'center', marginTop: 12 }}>
            <strong>JSON-Import:</strong> Führt Daten zusammen (Merge)<br />
            <strong>SQLite-Import:</strong> Ersetzt alle Daten komplett
          </div>
        </div>
      </div>
    </div>
  )
}
