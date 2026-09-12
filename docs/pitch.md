# 2-minute pitch

Read this out loud. Target: ~2 minutes.

---

Coding agents are already running `npm install`, `curl | sh`, and `git push --force` on developer machines. Today the choice is binary: **yolo mode** (the agent does everything) or **click Allow 400 times a day**. Neither is how a company ships software.

**This project is a local policy daemon for AI tools.** Cursor and Claude Code call us *before* a shell command runs. We do three things, in order, fail-closed:

1. **Blacklist** — `rm -rf /`, force-push, `chmod 777`, `dd`, `mkfs` — denied immediately. Never parked. Never allow-listed by accident.
2. **Classify** — `npm install` and `pnpm add` are the same class: `dependency`. Approve once for the repo; the rest auto-allow. Tests, builds, git-read, network — each is a class you can grant.
3. **Park** — anything unknown hits a dark, keyboard-first UI. `j`/`k` to select, `a` allow, `d` deny, `r` always-allow. The agent waits (up to nine minutes). You decide once. We remember.

That is the product: **human in the loop only when it still matters**, autonomy going up as the policy learns, destructive actions never becoming a rule.

It runs on **localhost, SQLite, one Node process**. No cloud. No vendor SDK. Hooks fail closed if the daemon is down. The same design is how we sell **enterprise on-prem**: Docker Compose, your disk, your models. Import a policy pack by id. Boss RBAC so a team lead cannot override an org deny. Plug in Cursor, Claude, or an internal LLM from a YAML stack file — the daemon does not care which brain is talking, only which command wants to run.

**One line:** we do not stop AI agents. We make them governable.

---

## Selling points (if they interrupt)

| Point | Why it lands |
| --- | --- |
| Fail closed | Broken hook or down daemon **blocks** the shell. Security products that fail open are not security products. |
| Classes, not fingerprints | Approving `npm install foo` also covers `pnpm add bar`. That is how autonomy actually goes up. |
| Destructive never auto-learns | Force-push and `rm -rf` cannot become an “always allow” rule. |
| 9-minute park + live UI | The agent is held on the HTTP request. The human is not racing a toast in the IDE. |
| Host-agnostic | Cursor `beforeShellExecution` and Claude `PreToolUse` already plug in. MCP is on the type union. |
| On-prem / air-gap path | SQLite + JSON policy + Compose. Commands never leave the building. |
| Bring your own model | `ai-stack.yaml` — swap vLLM / Cursor / Claude without rewriting the control plane. |
| Keyboard ops UI | Built for a human clearing a queue, not a settings page. |
