# Heronn

Heronn is a policy daemon for Cursor and Claude Code. It runs on your machine and listens only on 127.0.0.1.

A hook sends each command to Heronn before it runs. Heronn allows it, or holds the hook until you click Allow or Deny.

## What it decides

The checks run in this order:

1. Blacklist. `git push --force`, `rm -rf`, and the other entries in `server/policy/policies.json` wait on the Queue. You can allow one once. That allow is not saved.
2. An allow saved for this PC, or for this project, lets that command class or prefix through.
3. A saved deny waits on the Queue. Anything else is written to Logs as ask, and the hook returns. It does not stay on the Queue.

Saved allows are stored in `server/policy/policies.json`.

## Run

```bash
npm install
npm run dev
```

- Daemon: http://127.0.0.1:7777 — `GET /api/health` returns `{ "ok": true }`
- Queue: http://localhost:5173

Node 22, TypeScript, Express, better-sqlite3, React, and Vite.

## Docs

- [Pitch](docs/pitch.md) — overview. The code in this repo is the behavior.
- [Codebase](docs/codebase.md) — how the repo is wired
- [Roadmap](docs/roadmap.md)
- [On-prem notes](docs/on-prem.md)
- [AI stack](docs/ai-stack.md) — not part of Heronn. Nothing in that file is implemented.

## If the Queue stays empty

The Queue lists commands that are still waiting. Refreshing the page does not create one.

Open this repo in Cursor, in the folder that contains `.cursor/hooks.json`. VS Code can start the servers. It does not run those hooks.

1. Run `npm run dev`. The footer on http://localhost:5173 should say LIVE.
2. `GET http://127.0.0.1:7777/api/health` should return `{ "ok": true }`.
3. Ask the agent to run a blacklisted command. `npm install` will not wait if that class is already allowed.
4. If the hook cannot reach the daemon, Cursor blocks the shell. The Hooks output shows `relay failed`.

A waiting command stays for 9 minutes. With no click, it moves to Logs as ask.

## Hooks

Cursor uses `.cursor/hooks.json`. The relay posts to `http://127.0.0.1:7777/hook/cursor` and can wait 540 seconds. The shell hook is fail-closed: a down daemon blocks the command.

Claude Code uses `.claude/hooks/relay.mjs`. The relay posts to `http://127.0.0.1:7777/hook/claude-code`. If the daemon is down or returns an error, the relay exits 2 and the tool does not run.
