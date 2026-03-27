// api/keepalive.js
// Vercel Cron endpoint — pings the DB daily to prevent Supabase free-tier sleep
const postgres = require('postgres')

module.exports = async (req, res) => {
  try {
    const url = process.env.DATABASE_URL
    if (!url) return res.status(500).json({ error: 'No DATABASE_URL' })

    const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 10 })
    const result = await sql`SELECT NOW() as ts, (SELECT COUNT(*) FROM profiles) as profiles`
    await sql.end()

    return res.json({
      status: 'alive',
      timestamp: result[0]?.ts,
      profiles: result[0]?.profiles,
    })
  } catch (e) {
    return res.status(500).json({ status: 'error', message: e.message })
  }
}
