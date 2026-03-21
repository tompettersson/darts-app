import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTheme } from '../ThemeProvider'

type ToastType = 'success' | 'info' | 'error'

interface ToastMessage {
  id: number
  text: string
  type: ToastType
}

let toastIdCounter = 0
const listeners: Set<(msg: ToastMessage) => void> = new Set()

/** Zeigt einen Toast an (kann von überall aufgerufen werden) */
export function showToast(text: string, type: ToastType = 'success') {
  const msg: ToastMessage = { id: ++toastIdCounter, text, type }
  listeners.forEach(fn => fn(msg))
}

const TYPE_STYLES: Record<ToastType, { bg: string; border: string; color: string; icon: string }> = {
  success: { bg: '#dcfce7', border: '#16a34a', color: '#15803d', icon: '\u2713' },
  info: { bg: '#dbeafe', border: '#3b82f6', color: '#1d4ed8', icon: '\u2139' },
  error: { bg: '#fee2e2', border: '#ef4444', color: '#dc2626', icon: '\u2717' },
}

const ARCADE_STYLES: Record<ToastType, { bg: string; border: string; color: string }> = {
  success: { bg: '#14532d', border: '#22c55e', color: '#4ade80' },
  info: { bg: '#1e3a5f', border: '#3b82f6', color: '#93c5fd' },
  error: { bg: '#7f1d1d', border: '#ef4444', color: '#fca5a5' },
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const { isArcade } = useTheme()
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const addToast = useCallback((msg: ToastMessage) => {
    setToasts(prev => [...prev, msg])
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== msg.id))
      timers.current.delete(msg.id)
    }, 3000)
    timers.current.set(msg.id, timer)
  }, [])

  useEffect(() => {
    listeners.add(addToast)
    return () => {
      listeners.delete(addToast)
      timers.current.forEach(t => clearTimeout(t))
      timers.current.clear()
    }
  }, [addToast])

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none', width: 'min(400px, 90vw)',
    }}>
      {toasts.map(t => {
        const s = isArcade ? { ...TYPE_STYLES[t.type], ...ARCADE_STYLES[t.type] } : TYPE_STYLES[t.type]
        return (
          <div key={t.id} style={{
            padding: '10px 16px', borderRadius: 10,
            background: s.bg, border: `1px solid ${s.border}`, color: s.color,
            fontWeight: 600, fontSize: 14,
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            animation: 'screenFadeIn 0.2s ease-out',
          }}>
            <span style={{ fontSize: 16 }}>{s.icon}</span>
            {t.text}
          </div>
        )
      })}
    </div>
  )
}
