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

## Cursor beforeShellExecution / PreToolUse hook

This repo ships [`.cursor/hooks.json`](.cursor/hooks.json). A small Node relay ([`.cursor/hooks/relay.mjs`](.cursor/hooks/relay.mjs)) POSTs hook stdin to `http://127.0.0.1:7777/hook/cursor` with a 540s timeout so the hook works on Windows PowerShell as well as Unix. `beforeShellExecution` is `failClosed: true` so a down daemon or timeout blocks the shell instead of allowing it.

The daemon accepts either Cursor body shape:

- `{ "command", "cwd", "sandbox?" }` (`beforeShellExecution`)
- `{ "tool_name", "tool_input": { "command" }, "cwd", "session_id?" }` (`preToolUse`)

Policy order: global blacklist (immediate deny) → project JSON class/prefix allowlist (auto-allow) → park for the web UI. Approving with “create rule” writes that command’s class (for example `dependency`) and a stable prefix into `server/policy/policies.json` for that repo, so `npm install` and `pnpm add` share one allow.
