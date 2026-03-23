// src/errorLog.ts
// Simple error logging to database for debugging

const API_KEY = 'darts-2024-local'
const MAX_LOGS_PER_SESSION = 50
let logCount = 0

type ErrorLogEntry = {
  message: string
  stack?: string
  source: string
  userAgent: string
  url: string
  profileId?: string
  timestamp: string
}

/** Log an error to the server */
export async function logError(error: unknown, source: string) {
  if (logCount >= MAX_LOGS_PER_SESSION) return // Prevent flooding
  logCount++

  const entry: ErrorLogEntry = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    source,
    userAgent: navigator.userAgent,
    url: location.href,
    timestamp: new Date().toISOString(),
  }

  // Get current user from localStorage
  try {
    const stored = localStorage.getItem('darts-auth-user')
    if (stored) entry.profileId = JSON.parse(stored).profileId
  } catch {}

  // Send to server (fire and forget)
  try {
    await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
      body: JSON.stringify({
        type: 'exec',
        sql: `INSERT INTO error_logs (id, message, stack, source, user_agent, url, profile_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          crypto.randomUUID(),
          entry.message.substring(0, 500),
          (entry.stack || '').substring(0, 2000),
          entry.source.substring(0, 100),
          entry.userAgent.substring(0, 500),
          entry.url.substring(0, 500),
          entry.profileId || null,
          entry.timestamp,
        ],
      }),
    })
  } catch {
    // If logging fails, don't crash the app
    console.warn('[ErrorLog] Failed to send error log')
  }
}

/** Install global error handlers */
export function installGlobalErrorHandlers() {
  // Unhandled errors
  window.addEventListener('error', (event) => {
    logError(event.error || event.message, 'window.onerror')
  })

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    logError(event.reason, 'unhandledrejection')
  })

  console.debug('[ErrorLog] Global error handlers installed')
}
