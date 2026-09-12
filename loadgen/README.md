# Loadgen

Generate real Claude Code traffic against a **throwaway clone of a public repo**. Never this project.

## 1. Throwaway target

```bash
git clone --depth 1 https://github.com/expressjs/express.git /tmp/express-loadgen
npx tsx loadgen/setup.ts /tmp/express-loadgen
```

Setup creates sibling worktrees `wt-01`..`wt-10` (idempotent). It refuses this repo and clones with fewer than 50 source files.

## 2. Capture (leave running)

```bash
npm run loadgen:capture
```

Appends new daemon interrupts onto `fixtures/interrupts.jsonl` (never overwrites).

## 3. Agents

Default permission mode — the hook must see every tool call:

```bash
npm run loadgen -- --grid /tmp/express-loadgen
```

Without tmux (Windows): omit `--grid`. Logs: `loadgen/logs/agent-NN.log`.

```bash
npm run loadgen -- /tmp/express-loadgen
```

## 4. Baseline (unsupervised)

```bash
npx tsx loadgen/baseline.ts /tmp/express-loadgen
```

Writes `loadgen/baseline-report.md`.

## 5. Stats

```bash
npm run loadgen:stats
```
