import express from 'express'
import './db.ts'

const app = express()

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.listen(7777, () => {
  console.log('server listening on http://localhost:7777')
})
