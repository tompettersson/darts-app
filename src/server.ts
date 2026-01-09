// src/server.ts
import express, { Request, Response } from 'express'
import cors from 'cors'

const app = express()

app.use(cors())
app.use(express.json())

// Healthcheck
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true })
})

// Minimaler Endpoint zum Empfangen eines Matches (MVP)
app.post('/matches', (req: Request, res: Response) => {
  const payload = req.body
  // hier könnte man validieren/speichern
  const id = payload?.matchId ?? Date.now().toString()
  res.status(201).json({ received: true, id })
})

// (Optional) Dummy-Endpoint, um Outbox-Tests zu simulieren
app.post('/outbox', (req: Request, res: Response) => {
  // später: persistieren / weiterverarbeiten
  res.status(200).json({ queued: true, items: Array.isArray(req.body) ? req.body.length : 1 })
})

const PORT = Number(process.env.PORT ?? 5174)
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`)
})
