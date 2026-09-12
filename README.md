# Adria Hack AI Project

Skeleton only. Node 22 + TypeScript (tsx), Express, better-sqlite3, React + Vite, zod.

## Run

```bash
npm install
npm run dev
```

- Server: http://localhost:7777 (`GET /api/health` → `{ "ok": true }`)
- Web: http://localhost:5173 (proxies `/api` to the server)

## Claude Code PreToolUse hook

Point a `PreToolUse` command hook at the daemon. Pipe stdin JSON to the server and set a hook timeout of at least 540s so a parked permission request can wait for a human:

```bash
curl -sS -X POST http://127.0.0.1:7777/hook/claude-code -H "Content-Type: application/json" --data-binary @-
```
