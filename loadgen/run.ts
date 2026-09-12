import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tasks } from './tasks.ts'
import { pad, parseArgs, projectRoot, worktreePath } from './util.ts'

function claudeBin(): string {
  return process.platform === 'win32' ? 'claude.cmd' : 'claude'
}

function hasTmux(): boolean {
  const r = spawnSync('tmux', ['-V'], { encoding: 'utf8' })
  return r.status === 0
}

function spawnAgent(cwd: string, task: string, logPath: string, skipPerms: boolean): void {
  const args = skipPerms
    ? ['-p', task, '--dangerously-skip-permissions']
    : ['-p', task]
  mkdirSync(join(projectRoot(), 'loadgen', 'logs'), { recursive: true })
  const out = createWriteStream(logPath, { flags: 'a' })
  const child = spawn(claudeBin(), args, {
    cwd,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })
  child.stdout?.pipe(out)
  child.stderr?.pipe(out)
  child.on('error', (err) => {
    out.write(`\nspawn error: ${err.message}\n`)
  })
}

function runGrid(target: string, skipPerms: boolean): void {
  if (!hasTmux()) {
    console.error('tmux not found — spawning without a grid (install tmux/WSL for --grid)')
    runPlain(target, skipPerms)
    return
  }
  spawnSync('tmux', ['kill-session', '-t', 'agents'], { stdio: 'ignore' })
  const extra = skipPerms ? ' --dangerously-skip-permissions' : ''
  const line = (task: string) => `${claudeBin()} -p ${JSON.stringify(task)}${extra}`

  const first = worktreePath(target, 1)
  spawnSync('tmux', ['new-session', '-d', '-s', 'agents', '-c', first], { stdio: 'inherit' })
  spawnSync('tmux', ['send-keys', '-t', 'agents', line(tasks[0]!), 'C-m'], { stdio: 'inherit' })
  console.log('agent 01 started in tmux pane')

  for (let n = 2; n <= 10; n++) {
    const cwd = worktreePath(target, n)
    spawnSync('tmux', ['split-window', '-t', 'agents', '-c', cwd], { stdio: 'inherit' })
    spawnSync('tmux', ['send-keys', '-t', 'agents', line(tasks[n - 1]!), 'C-m'], { stdio: 'inherit' })
    spawnSync('tmux', ['select-layout', '-t', 'agents', 'tiled'], { stdio: 'inherit' })
    console.log(`agent ${pad(n)} started in tmux pane`)
  }
  spawnSync('tmux', ['select-layout', '-t', 'agents', 'tiled'], { stdio: 'inherit' })
  const attach = spawnSync('tmux', ['attach', '-t', 'agents'], { stdio: 'inherit' })
  if (attach.status !== 0) {
    console.log('tmux session "agents" is running (could not attach)')
  }
}

function runPlain(target: string, skipPerms: boolean): void {
  const logDir = join(projectRoot(), 'loadgen', 'logs')
  mkdirSync(logDir, { recursive: true })
  for (let n = 1; n <= 10; n++) {
    const cwd = worktreePath(target, n)
    const logPath = join(logDir, `agent-${pad(n)}.log`)
    spawnAgent(cwd, tasks[n - 1]!, logPath, skipPerms)
    console.log(`agent ${pad(n)} started cwd=${cwd} log=${logPath}`)
  }
}

const { grid, skipPerms, target } = parseArgs(process.argv.slice(2))
if (!target) {
  console.error('usage: npm run loadgen -- [--grid] <throwaway-clone-path>')
  process.exit(1)
}
if (skipPerms) {
  console.error('refusing --skip-permissions on the live loadgen path (use loadgen/baseline.ts)')
  process.exit(1)
}

if (grid) runGrid(target, false)
else runPlain(target, false)
