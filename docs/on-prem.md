# Enterprise on-prem (planned)

Not implemented. Target: the interrupt daemon, approve UI, and policy store run **inside the customer network** with no required cloud SaaS.

## Why on-prem

- Agent shell commands, repo paths, and policy decisions never leave the building.
- Boss RBAC and policy packs stay on customer disks (see the planned section in the root README).
- Air-gapped / regulated shops can still run the same binary layout as a laptop demo.

## What ships in the box

One Compose stack (or equivalent) that starts the same way on every machine:

| Service | Role |
| --- | --- |
| `daemon` | Express policy daemon (`:7777`) — hooks, park, SSE, decide |
| `web` | Approve UI (proxies `/api` to the daemon) |
| `db` volume | SQLite `app.db` (WAL) plus `policies.json` |

Optional later: reverse proxy with TLS, SSO (OIDC/LDAP) in front of the UI, and the [AI stack](./ai-stack.md) sidecar.

## Machine contract

- Linux, Windows (Docker Desktop / WSL2), or macOS — same compose file.
- Bind or named volumes for `/data/app.db` and `/data/policies.json` so a restart does not wipe rules.
- Hooks on developer IDEs still POST to `http://127.0.0.1:7777` (or the on-prem hostname). Fail closed if the daemon is down.
- No Mongo, no cloud SDK, no extra control plane required for the core path.

## Ops sketch

```bash
docker compose -f deploy/compose.yaml up -d
curl -sS http://127.0.0.1:7777/api/health
```

Upgrade = pull the pinned image tag and recreate containers. Policy packs import/export by `id` so an org can clone the same allow/deny set onto a new server without clicking through the UI again.

## Hardening (enterprise)

- Daemon listens on loopback or an internal VLAN only.
- Boss-layer blacklist is read-only to project operators.
- Back up `/data` (db + policy JSON). Restore is copy the volume, then start compose.
- Spoken policy expansion and UI decide both audit into the same interrupt log.
