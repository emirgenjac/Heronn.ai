# Portable AI stack from config (planned)

Not implemented. Every customer (or every laptop) should **import their own AI stack** from a checked-in config so the rest of this product does not care which model vendor they use.

## Idea

A single file — shipped next to Compose — declares providers. Docker (or Podman) starts whatever that file names. The policy daemon stays the same: it only sees host hooks (`cursor`, `claude-code`, `mcp`) and command text.

```yaml
# deploy/ai-stack.yaml  (example shape, not wired)
id: acme-onprem-stack
providers:
  - id: cursor
    kind: cursor-hooks
    endpoint: http://127.0.0.1:7777/hook/cursor
  - id: claude-code
    kind: claude-hooks
    endpoint: http://127.0.0.1:7777/hook/claude-code
  - id: local-llm
    kind: openai-compat
    image: ghcr.io/example/vllm:pinned
    baseUrl: http://llm:8000/v1
    model: org/internal-coder
```

`id` on the stack matches the planned policy-pack import/export: you can copy `acme-onprem-stack` plus its policy pack onto another machine and get the same agents + the same allow/deny rules.

## Import

1. Drop `ai-stack.yaml` (and optional `compose.override.yaml`) into `deploy/`.
2. `docker compose -f deploy/compose.yaml -f deploy/compose.override.yaml up -d`
3. The daemon reads provider `id`s from the stack file; it does not bake in a cloud SDK.

Swap vendor = change the file, recreate containers. No app rewrite. Works on a developer laptop, a CI runner, and the [on-prem](./on-prem.md) box because the only contract is HTTP + images.

## What “works on every machine” means

- Pin **image digests**, not `latest`.
- Models and weights live in a volume or an internal registry the air-gap already mirrors.
- GPU is optional: CPU image for laptops, GPU overlay for the server.
- If a provider is missing, fail closed for that host (hooks ask/deny) — do not silently send prompts to a public API.

## Out of scope for this file

The interrupt UI, blacklist, and project allowlists stay in this repo’s daemon. The stack config does not grant extra shell permission; boss RBAC and project policy still decide allow / deny / park.
