# Adria Hack AI Project

Local policy daemon for AI coding agents: blacklist dangerous shell, auto-allow by command class, otherwise park for a human. Node 22 + TypeScript (tsx), Express, better-sqlite3, React + Vite, zod.

## Docs

- [2-minute pitch](docs/pitch.md) — selling points, read-aloud script
- [Codebase](docs/codebase.md) — how this repo is wired
- [Roadmap](docs/roadmap.md) — shipped vs next vs on-prem
- [Enterprise on-prem](docs/on-prem.md)
- [Bring-your-own AI stack](docs/ai-stack.md)

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

Policy order: global blacklist (immediate deny) → **this PC** allowlist → **this project** allowlist → park for the web UI. Approving with “this project” or “this PC” writes the command class and prefix into `server/policy/policies.json` (`projects[repo]` vs `machine`). `npm install` and `pnpm add` still share class `dependency`. Blacklist is always machine-wide and cannot be weakened by a project allow.


Spoken policy prompts, pack import/export by id, boss RBAC, on-prem Compose, and bring-your-own models are planned — see [docs/roadmap.md](docs/roadmap.md).
