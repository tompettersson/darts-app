const postgres = require('postgres')
const bcrypt = require('bcryptjs')

const SALT_ROUNDS = 10

// PostgreSQL client — lazy init (works with Supabase, Neon, or any Postgres)
let _sql = null
function getSQL() {
  if (!_sql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL environment variable is not set')
    _sql = postgres(url, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    })
  }
  return _sql
}

// Simple API key guard
const API_KEY = process.env.API_SECRET || 'darts-2024-local'

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // API key check
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(403).json({ error: 'Unauthorized' })
  }

  try {
    const body = req.body
    const db = getSQL()

    // Auto-migrate: add settings column if missing
    try {
      await db`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'`
    } catch (_) { /* column already exists */ }

    switch (body.type) {
      // ---- Verify single player password (creates session) ----
      case 'verify': {
        const { profileId, password } = body
        if (!profileId || !password) return res.json({ valid: false })

        const rows = await db`SELECT password_hash, settings FROM profiles WHERE id = ${profileId}`
        const hash = rows[0]?.password_hash
        if (!hash) return res.json({ valid: false })

        const valid = await bcrypt.compare(password, hash)
        if (!valid) return res.json({ valid: false })

        // Create session — invalidate any existing sessions for this profile
        const sessionToken = crypto.randomUUID()
        const now = new Date().toISOString()
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

        await db`DELETE FROM sessions WHERE profile_id = ${profileId}`
        await db`INSERT INTO sessions (session_token, profile_id, created_at, expires_at, last_used_at)
                  VALUES (${sessionToken}, ${profileId}, ${now}, ${expiresAt}, ${now})`

        return res.json({ valid: true, sessionToken, settings: rows[0]?.settings || {} })
      }

      // ---- Validate session token ----
      case 'validate-session': {
        const { sessionToken } = body
        if (!sessionToken) return res.json({ valid: false })

        const rows = await db`SELECT profile_id, expires_at FROM sessions WHERE session_token = ${sessionToken}`
        if (!rows[0]) return res.json({ valid: false })

        if (rows[0].expires_at < new Date().toISOString()) {
          await db`DELETE FROM sessions WHERE session_token = ${sessionToken}`
          return res.json({ valid: false })
        }

        // Update last used
        await db`UPDATE sessions SET last_used_at = ${new Date().toISOString()} WHERE session_token = ${sessionToken}`
        // Fetch settings
        const profileRows = await db`SELECT settings FROM profiles WHERE id = ${rows[0].profile_id}`
        return res.json({ valid: true, profileId: rows[0].profile_id, settings: profileRows[0]?.settings || {} })
      }

      // ---- Update profile settings ----
      case 'update-settings': {
        const { sessionToken, settings } = body
        if (!sessionToken || !settings) return res.status(400).json({ error: 'Missing fields' })
        const session = await db`SELECT profile_id FROM sessions WHERE session_token = ${sessionToken} AND expires_at > ${new Date().toISOString()}`
        if (!session[0]) return res.status(401).json({ error: 'Invalid session' })
        await db`UPDATE profiles SET settings = ${JSON.stringify(settings)}, updated_at = ${new Date().toISOString()} WHERE id = ${session[0].profile_id}`
        return res.json({ success: true })
      }

      // ---- Logout (delete session) ----
      case 'logout': {
        const { sessionToken } = body
        if (sessionToken) {
          await db`DELETE FROM sessions WHERE session_token = ${sessionToken}`
        }
        return res.json({ success: true })
      }

      // ---- Verify multiple players (game start) ----
      case 'verify-multi': {
        const { players } = body // [{ profileId, password }]
        if (!Array.isArray(players)) return res.json({ results: [] })

        const ids = players.map(p => p.profileId)
        const rows = await db`SELECT id, password_hash FROM profiles WHERE id = ANY(${ids})`
        const hashMap = Object.fromEntries(rows.map(r => [r.id, r.password_hash]))

        const results = await Promise.all(
          players.map(async (p) => {
            const hash = hashMap[p.profileId]
            if (!hash) return { profileId: p.profileId, valid: false }
            const valid = await bcrypt.compare(p.password, hash)
            return { profileId: p.profileId, valid }
          })
        )
        return res.json({ results })
      }

      // ---- Change own password ----
      case 'change-password': {
        const { profileId, oldPassword, newPassword } = body
        if (!profileId || !oldPassword || !newPassword) {
          return res.status(400).json({ error: 'Missing fields' })
        }
        if (newPassword.length < 2) {
          return res.status(400).json({ error: 'Password too short' })
        }

        // Verify old password
        const rows = await db`SELECT password_hash FROM profiles WHERE id = ${profileId}`
        const hash = rows[0]?.password_hash
        if (!hash) return res.status(404).json({ error: 'Profile not found' })

        const valid = await bcrypt.compare(oldPassword, hash)
        if (!valid) return res.json({ success: false, error: 'Falsches Passwort' })

        // Hash and save new password
        const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS)
        await db`UPDATE profiles SET password_hash = ${newHash}, updated_at = ${new Date().toISOString()} WHERE id = ${profileId}`
        return res.json({ success: true })
      }

      // ---- Admin: reset another player's password ----
      case 'admin-reset-password': {
        const { adminId, adminPassword, targetProfileId, newPassword } = body
        if (!adminId || !adminPassword || !targetProfileId || !newPassword) {
          return res.status(400).json({ error: 'Missing fields' })
        }

        // Verify admin
        const adminRows = await db`SELECT password_hash, is_admin FROM profiles WHERE id = ${adminId}`
        const admin = adminRows[0]
        if (!admin || !admin.is_admin) return res.status(403).json({ error: 'Not admin' })

        const adminValid = await bcrypt.compare(adminPassword, admin.password_hash)
        if (!adminValid) return res.json({ success: false, error: 'Admin-Passwort falsch' })

        // Hash and set new password for target
        const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS)
        await db`UPDATE profiles SET password_hash = ${newHash}, updated_at = ${new Date().toISOString()} WHERE id = ${targetProfileId}`
        return res.json({ success: true })
      }

      // ---- Admin: create profile with password ----
      case 'create-profile': {
        const { name, password, color } = body
        if (!name || !password) return res.status(400).json({ error: 'Missing name or password' })

        // Check name unique
        const existing = await db`SELECT id FROM profiles WHERE LOWER(name) = LOWER(${name.trim()})`
        if (existing.length > 0) return res.status(409).json({ error: 'Name existiert bereits' })

        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        const hash = await bcrypt.hash(password, SALT_ROUNDS)
        await db`INSERT INTO profiles (id, name, color, password_hash, is_admin, created_at, updated_at)
                  VALUES (${id}, ${name.trim()}, ${color || null}, ${hash}, 0, ${now}, ${now})`
        return res.json({ success: true, id, name: name.trim() })
      }

      // ---- One-time: migrate all profiles to have passwords ----
      case 'migrate-passwords': {
        // Always check for profiles without passwords (new profiles may exist)

        // Get all profiles without password
        const profiles = await db`SELECT id, name FROM profiles WHERE password_hash IS NULL`
        let count = 0
        for (const p of profiles) {
          const defaultPw = p.name + '1'
          const hash = await bcrypt.hash(defaultPw, SALT_ROUNDS)
          await db`UPDATE profiles SET password_hash = ${hash} WHERE id = ${p.id}`
          count++
        }

        // Set "David" as admin
        await db`UPDATE profiles SET is_admin = 1 WHERE LOWER(name) = 'david'`

        // Mark as done
        await db`INSERT INTO system_meta (key, value) VALUES ('passwords_migrated', 'true')
                  ON CONFLICT (key) DO UPDATE SET value = 'true'`

        return res.json({ migrated: true, count })
      }

      // ---- Get profile auth info (for login screen) ----
      case 'get-auth-profiles': {
        const rows = await db`SELECT id, name, color, is_admin FROM profiles ORDER BY name`
        return res.json({
          profiles: rows.map(r => ({
            id: r.id,
            name: r.name,
            color: r.color,
            isAdmin: r.is_admin === 1 || r.is_admin === true,
          }))
        })
      }

      default:
        return res.status(400).json({ error: 'Unknown auth request type' })
    }
  } catch (error) {
    console.error('[API/Auth] Error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}
