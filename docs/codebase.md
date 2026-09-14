# Codebase documentation

This is a **local interrupt / policy daemon** for AI coding agents. Cursor and Claude Code POST intended tool calls here *before* they run. The daemon blacklists dangerous commands, auto-allows by project-scoped command class, or **parks** the HTTP request until a human decides in the web UI.

Stack (enforced): **Node 22 + TypeScript (tsx), Express, better-sqlite3, React + Vite, zod**. No Bun, no workspaces, no Docker in the running demo, no Mongo, no ORMs, no cloud SDKs.

`shared/types.ts` is **frozen**. Do not rename fields or change the host/action unions. `Interrupt.args` must stay `Record<string, unknown>`.

---

## How to run

```bash
npm install
npm run dev
```

| Process | URL |
| --- | --- |
| Daemon | http://localhost:7777 — `GET /api/health` → `{ "ok": true }` |
| Web | http://localhost:5173 — Vite proxies `/api` (and SSE `/api/stream`) to 7777 |

Scripts in root `package.json`:

| Script | What |
| --- | --- |
| `dev` | `concurrently` server + web |
| `dev:server` | `tsx watch server/index.ts` |
| `dev:web` | `vite --config web/vite.config.ts` |
| `loadgen*` | Throwaway-clone traffic (never this repo) |

The approve UI talks to the daemon only when `web/src/live.ts` exports `LIVE = true`. If `false`, it plays mock groups from `fixtures/interrupts.jsonl`.

HTTP timeouts on the daemon are **0** (`requestTimeout`, `headersTimeout`, `timeout`) so a parked hook can wait up to **540 seconds** (`server/waiters.ts`).

---

## Repository layout

```
shared/types.ts          Frozen contracts (Interrupt, Rule, Decision, Group, Stats)
server/index.ts          Express app, routes, hook handlers
server/db.ts             better-sqlite3 WAL → ../app.db
server/pipeline.ts       Fingerprint match → auto or park
server/waiters.ts        In-memory park/settle (9 min → ask)
server/snapshot.ts       Pending groups + stats for the UI
server/sse.ts            event: update every 1s + on broadcast()
server/adapters/         Claude Code + Cursor hook JSON → Interrupt
server/engine/           Parse, classify paths, fingerprint, in-memory rules
server/policy/           Blacklist, command class, project JSON store, evaluateCommand
server/engineStub.ts     Unused leftover; pipeline imports engine/index.ts
web/                     React approve UI
.cursor/hooks.json       Cursor beforeShellExecution + preToolUse → relay
.cursor/hooks/relay.mjs  POST stdin to /hook/cursor (Windows-safe)
fixtures/interrupts.jsonl  Sample + captured interrupts
loadgen/                 Multi-agent traffic against a throwaway clone
docs/                    Pitch, roadmap, on-prem, AI stack
```

There is a **single** root `package.json` (no npm workspaces). `tsconfig.json`: `strict`, `moduleResolution: "bundler"`, `allowImportingTsExtensions`, `noEmit`, `verbatimModuleSyntax`.

---

## Data model (`shared/types.ts`)

**Hosts:** `'claude-code' | 'cursor' | 'mcp'`  
**Actions:** `'allow' | 'deny' | 'ask'`

| Type | Role |
| --- | --- |
| `Interrupt` | One gated tool call. `fingerprint` / `title` / `detail` / `destructive` are filled by `canonicalise`. |
| `Rule` | Engine fingerprint rule: `scope` repo or global, `action` allow or deny, `hits`. |
| `Decision` | UI/API payload: `interruptIds`, `action`, `createRule`, `scope`, `by`. |
| `Group` | Pending interrupts collapsed by fingerprint for the list UI. |
| `Stats` | `blocked`, `oldestMs`, `autoResolved`, `total`, `autonomy` (= autoResolved / max(total, 1)). |

SQLite (`server/db.ts`):

- `interrupts` — full interrupt plus `state` (`pending` \| `auto` \| `decided`), `decision`, `decidedBy`, `decidedAt`. `args` stored as JSON text.
- `rules` — persisted fingerprint rules. Loaded into memory on `server/engine/index.ts` import via `loadRules()`.

Project policy is **not** in SQLite. It lives in `server/policy/policies.json`.

---

## Request flow

```
IDE hook  →  POST /hook/cursor or /hook/claude-code
                │
                ├─ parse fail / missing command  →  permission ask (never allow)
                │
                └─ Interrupt
                      │
                      ▼
              evaluateCommand (Cursor + Claude)
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
    blacklist     class+prefix   handleInterrupt
    deny now      JSON allow     engine fingerprint
                  (microtask        │
                   log auto)        ├─ match → auto (rule)
                                    └─ insert pending + SSE + park(id)
                                              │
                                              ▼
                                    human POST /api/decide
                                      settle waiters
                                      optional addRule + recordAllow
```

Cursor and Claude both call `evaluateCommand` (blacklist → class allow → fingerprint / park).

### HTTP API

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/health` | `{ ok: true }` |
| GET | `/api/groups` | Snapshot `{ groups, stats }` |
| GET | `/api/stream` | SSE `event: update`, 1s heartbeat, timeouts 0 |
| POST | `/api/decide` | Zod `Decision`. Marks decided, `settle`, maybe `addRule` + `recordAllow`, `broadcast`. |
| POST | `/api/replay` | Replays `fixtures/interrupts.jsonl` through `handleInterrupt` (speed optional). |
| POST | `/hook/claude-code` | Adapter → `evaluateCommand` → Claude hook JSON. |
| POST | `/hook/cursor` | Adapter → `evaluateCommand` → flat Cursor payload **and** `hookSpecificOutput`. |

Hook errors and unparseable bodies return **ask**, never allow. Express JSON parse errors on `/hook/*` are caught by the error middleware the same way.

`addRule` signature in the real engine is `(fingerprint, repo, scope, action)` — **not** the stub’s old argument order.

---

## Cursor and Claude adapters

### Cursor — `server/adapters/cursor.ts`

Accepts either:

- `{ command, cwd, sandbox? }` — `beforeShellExecution`
- `{ tool_name, tool_input: { command }, cwd, session_id? }` — `preToolUse`

Walks to git root (`.git`) and sets `repo` to that directory’s basename. `host: 'cursor'`, `tool: 'Shell'`, `args: { command }`. Missing command or cwd → `null` → ask.

Response:

```json
{
  "permission": "allow | deny | ask",
  "user_message": "…",
  "agent_message": "…",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "…",
    "permissionDecisionReason": "…"
  }
}
```

`.cursor/hooks.json` runs `node .cursor/hooks/relay.mjs` (not raw `curl`) because PowerShell breaks on `--data-binary @-`. `beforeShellExecution` is `failClosed: true`, timeout 540s.

### Claude Code — `server/adapters/claudeCode.ts`

`{ session_id?, cwd, tool_name, tool_input, tool_use_id? }`. Same git-root walk. Response is nested `hookSpecificOutput` only (`permissionDecision` allow/deny/ask). `.claude/settings.json` runs `node .claude/hooks/relay.mjs` against `POST /hook/claude-code`. If the daemon is unreachable, that relay returns `ask` and exits 0 so Claude Code’s native permission UI still runs.

---

## Policy layer (`server/policy/`)

### `evaluateCommand`

1. Blacklist (`isBlacklisted`) → `deny`, log `state=auto`, `decidedBy=blacklist`.
2. `classifyCommand` + `lookupAllow(repo, command, class)` → `allow`, log `decidedBy=policy`.
3. Else `handleInterrupt` (engine then park).

### Blacklist (`blacklist.ts` + `policies.json`)

Global. Hit = immediate deny. **Do not park. Do not write an allow.**

A command is blacklisted if:

- argv0 (or `sudo`/`doas` next token) is a banned bin: `dd`, `mkfs`, `shutdown`, `reboot`, `format`, `diskpart`
- normalized command matches a banned **prefix** (longest wins)
- engine `isDestructiveCommand` fires (`rm -rf`, force-push, `reset --hard`, `chmod 777`, `curl|sh`, path outside repo / `.ssh` `.aws` `.env` credentials keychain)

Prefix match (`prefix.ts`): collapse whitespace; `cmd === prefix` or `cmd.startsWith(prefix + ' ')`; if the prefix ends with a non-alnum (`dd if=`, `rm -rf /`) also `cmd.startsWith(prefix)`.

Shipped prefixes include `rm -rf /`, `git push --force`, `git push -f`, `git reset --hard`, `chmod 777`, `mkfs`, `dd if=`, fork bomb, `sudo dd`, `sudo mkfs`.

### Classification (`classifyCmd.ts`)

| Class | Examples |
| --- | --- |
| `dependency` | npm/pnpm/yarn/bun `install`/`add`/`ci` |
| `test` | `npm test`, jest, mocha, vitest |
| `build` | tsc, vite, webpack, `cargo build` |
| `git-read` | status, diff, log, branch, … |
| `git-write` | add, commit, checkout |
| `git-destructive` | force-push, `reset --hard` |
| `fs-write` | mkdir, touch, cp, mv |
| `network` | curl, wget |
| `unknown` | everything else |

`policies.json` `classMap` can map extra bins without a code change (`"poetry": "dependency"` still only classifies as dependency on install-like subs).

**Never auto-allow** `git-destructive` or `unknown` even if someone stuffed them into `allowClasses`. Blacklist still runs first.

### Project / PC store (`store.ts`)

Lookup after blacklist: **machine** (`this PC`) prefixes then classes, then **project** (`this repo`). A PC allow applies to every repo on this daemon. A project allow applies only to that git-root basename.

```json
{
  "blacklist": { "prefixes": [], "bins": [] },
  "classMap": { "npm": "dependency", "pnpm": "dependency" },
  "machine": {
    "allowClasses": ["test"],
    "allowPrefixes": [],
    "decisions": []
  },
  "projects": {
    "Adria-Hack-AI-Project": {
      "allowClasses": ["dependency"],
      "allowPrefixes": ["npm install"],
      "decisions": [{ "command": "npm install foo", "class": "dependency", "action": "allow", "ts": 0 }]
    }
  }
}
```

`recordAllow(repo, command, class, scope)` writes `machine` when `scope` is `global`, else `projects[repo]`. Engine `addRule` already uses the same scope (repo vs global fingerprint). Writes are a sync queue (read-modify-write). Unknown commands store the full normalized command as prefix, not the class.

On `POST /api/decide`, if `createRule` and allow and **not** destructive: engine `addRule` **and** `recordAllow` with `decision.scope`. Destructive rows never become rules.

---

## Engine (`server/engine/`)

Used for fingerprints, titles, destructive flags, and exact-command rules.

| File | Job |
| --- | --- |
| `parse.ts` | Tokenizer (no regex). Stages + ops (`|`, `&&`, …). Package-manager normalize (`pnpm add` → argv0 `npm` + `install`). |
| `classify.ts` | Operand kinds, path inside-repo vs sensitive, `isDestructiveCommand`. |
| `canonicalise.ts` | Bash/Shell: SHA-1 of `[argv0, subcommand, sorted flags, redacted operands, repo]`. Other tools: tool + arg keys + path shape (`file_path`, `path`, …). Unparseable → destructive + special fingerprint. |
| `rules.ts` | In-memory maps + SQLite persist. `match` prefers repo rule then global; increments hits. |
| `index.ts` | Re-exports; `loadRules()` on import. |
| `canonicalise.test.ts` | `node --import tsx --test server/engine/canonicalise.test.ts` |
| `bench.ts` | Micro-benchmark (~µs per canonicalise). |

Redaction: packages → `<pkg>`, URLs → `<url>`, in-repo paths → `<in-repo>`, git refs on push/pull → `<ref>`. That is why `npm install foo` and `pnpm add bar` can share a fingerprint **and** a policy class.

---

## Park / SSE / snapshot

- `park(id)` stores a resolver; timeout **always `ask`**.
- `settle(ids, action)` resolves those waiters so the hook HTTP response finally returns.
- `getSnapshot()` groups **pending** rows by fingerprint for the UI.
- `broadcast()` pushes the snapshot to all SSE clients; also on a 1s interval.

If the hook client disconnects (Node `fetch` header timeout ~300s), waiters can still sit until decide or 540s. Cards remain pending in SQLite until `/api/decide`.

---

## Web UI (`web/`)

Dark, keyboard-first queue. `App.tsx`:

| Key | Action |
| --- | --- |
| `j` / `k` | Select next / previous group |
| `a` | Allow all in the group |
| `d` | Deny all |
| `r` | Toggle “always allow this” (disabled if `destructive`) |
| Enter | Expand fingerprint / detail |

Allow + always-allow + not destructive → `createRule: true`, `scope: 'repo'`, `by: 'web'`. Toast: “Rule created — future matches auto-approved.” Empty state: **Nothing needs you.** Footer shows `LIVE` or `MOCK`.

`web/vite.config.ts` proxies `/api` to `127.0.0.1:7777` with timeouts 0 so SSE survives. Transient proxy errors (`ECONNREFUSED` / `ECONNRESET` while `tsx watch` restarts the daemon) are not printed as Vite errors. The UI backs off diag/SSE retries while `:7777` is down.

---

## Loadgen (`loadgen/`)

Generates **real** Claude Code traffic against a **throwaway clone of a public repo**. Setup **refuses this repository**. See `loadgen/README.md`. Capture appends to `fixtures/interrupts.jsonl` from `app.db`. `--grid` needs tmux (omit on Windows).

---

## Fail-closed rules of the house

- Parse error → **ask**, never allow.
- Daemon / hook crash with Cursor `failClosed: true` → shell **blocked**.
- Blacklist → deny, no park, no allow write.
- `git-destructive` / `unknown` → never class-auto-allow.
- Destructive interrupt → `createRule` ignored.
- Unparseable canonicalise → treated as destructive.

---

## Related docs

- [2-minute pitch](./pitch.md)
- [Roadmap](./roadmap.md)
- [Enterprise on-prem](./on-prem.md)
- [Portable AI stack](./ai-stack.md)
