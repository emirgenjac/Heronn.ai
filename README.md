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

## Planned (not implemented)

These belong in the product next; they are not wired yet.

### Spoken prompt to expand policies

A human (or the UI) can expand policy in natural language instead of only clicking Allow on a single parked command. Example: “allow all test runners in this repo” or “never auto-allow docker compose.” The daemon would parse that into `allowClasses` / `allowPrefixes` / blacklist updates for the current project, still never auto-allowing `git-destructive`, `unknown`, or anything already blacklisted.

### Import / export policy with ID

Every policy pack gets a stable `id` (org- or repo-scoped). Export dumps that pack as JSON (blacklist, classMap, allowClasses, allowPrefixes, decisions). Import loads a pack by `id` into another daemon or repo without colliding with local edits — merge by id, do not overwrite a different pack that happens to share a prefix. Round-trip should preserve the id so the same policy can be copied across machines and projects.

### Policy hierarchy from boss RBAC

Policies stack from the boss down; a lower role cannot weaken a higher deny.

| Layer | Who | What it can do |
| --- | --- | --- |
| Org / boss | Owner, admin | Global blacklist, org-wide deny, publish packs by id |
| Team | Lead | Extra allows for that team, still bound by org deny |
| Project | Repo policy | Today’s `projects[repo]` allowClasses / prefixes |
| Agent / user | Operator | One-shot Allow / Deny in the UI; “always allow” only if the parent layers permit it |

Lookup order stays fail-closed: org blacklist → team deny → project allow → park. A boss deny always wins over a project allow.

### Enterprise on-prem and portable AI stack

Docs only for now:

- [Enterprise on-prem](docs/on-prem.md) — same Compose layout on every machine, data stays on customer disks.
- [Import your own AI stack](docs/ai-stack.md) — `ai-stack.yaml` + Docker/Podman so Cursor, Claude Code, or a local LLM is config, not code.
