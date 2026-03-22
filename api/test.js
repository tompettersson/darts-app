module.exports = (req, res) => {
  res.json({ ok: true, time: Date.now(), hasDbUrl: !!process.env.DATABASE_URL })
}
