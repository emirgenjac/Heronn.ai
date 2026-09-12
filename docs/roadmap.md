# Roadmap

What exists today vs what we still owe. Implementation is **not** started for items marked planned.

For the spoken 2-minute version see [pitch.md](./pitch.md). For how the current code is wired see [codebase.md](./codebase.md).

---

## Now (shipped in this repo)

- Local Express daemon on `:7777`, SQLite WAL, frozen `shared/types.ts`.
- Cursor `beforeShellExecution` / `preToolUse` and Claude Code `PreToolUse` hooks (both run `evaluateCommand`: blacklist → class allow → park).
- Fail-closed parse path (`ask`, never auto-allow on garbage).
- Global blacklist (prefixes + bins + engine destructive checks).
- Command classes + project JSON allowlist (`allowClasses` / `allowPrefixes` / `decisions`).
- Engine fingerprints + `addRule` so exact shapes can auto-resolve.
- Park up to 540s, SSE snapshot, keyboard approve UI.
- Loadgen against a throwaway clone (not this repo).

---

## Next (product, still local)

These close the demo-to-daily-driver gap.

| Item | Notes |
| --- | --- |
| MCP host adapter | `host: 'mcp'` is on the type union; no `/hook/mcp` yet. |
| Spoken prompt to expand policies | Natural language → `allowClasses` / prefixes / blacklist. Still never auto-allow `git-destructive`, `unknown`, or blacklisted. |
| Import / export policy packs by `id` | JSON round-trip of blacklist + classMap + project allows. Merge by id; do not clobber a different pack that shares a prefix. |
| UI: LIVE by default + empty leftover fixtures | Operators should not see year-old `int-00x` rows. |
| Hold park past Node fetch ~300s | Hook relay should not drop the HTTP wait before the 540s waiter. |
| Audit trail in the UI | Filter `decidedBy` (`blacklist` / `policy` / `rule` / `web`). |
| Policy editor | View/edit `policies.json` without a text editor (still fail-closed saves). |

---

## Org layer (boss RBAC)

Policies stack; a lower role **cannot weaken a higher deny**.

| Layer | Who | What |
| --- | --- | --- |
| Org / boss | Owner, admin | Global blacklist, org-wide deny, publish packs by id |
| Team | Lead | Extra allows, still bound by org deny |
| Project | Repo | Today’s `projects[repo]` |
| Agent / user | Operator | One-shot Allow/Deny; “always allow” only if parents permit |

Lookup stays fail-closed: **org blacklist → team deny → project allow → park**.

---

## Enterprise on-prem

Full sketch: [on-prem.md](./on-prem.md).

- One Compose file: daemon + web + volume for `app.db` and `policies.json`.
- Same layout on Linux / Windows / macOS.
- Loopback or internal VLAN only; TLS + OIDC/LDAP in front of the UI later.
- Backup = copy `/data`. Restore = copy back, `compose up`.
- Air-gap: no cloud SaaS, no vendor SDK in the control plane.

---

## Bring-your-own AI stack

Full sketch: [ai-stack.md](./ai-stack.md).

- `deploy/ai-stack.yaml` with a stack `id` and provider list (Cursor hooks, Claude hooks, OpenAI-compatible local LLM image).
- `docker compose -f deploy/compose.yaml -f deploy/compose.override.yaml up`.
- Pin image **digests**. Missing provider → fail closed for that host, never a silent public API.
- Stack config does **not** grant shell permission; policy still decides.

---

## Later

- Multi-daemon HA (today park waiters are in-process memory).
- Signed policy packs (who published this `id`).
- Per-sandbox / network-egress classes beyond curl/wget.
- Windows-native service wrapper so the daemon starts at login without `npm run dev`.
- Metrics: time-to-decide, autonomy over a week, blacklist hit rate — for the boss dashboard.

---

## Explicitly out of scope (keep it)

- Rewriting `shared/types.ts`.
- Cloud-only control plane as a requirement to use the product.
- Auto-allowing destructive git or unknown commands because a human said “allow all”.
- Running loadgen against **this** repository.
