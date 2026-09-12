import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'

export function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function worktreePath(target: string, n: number): string {
  return join(dirname(resolve(target)), `wt-${pad(n)}`)
}

export function worktreeBranch(n: number): string {
  return `loadgen/wt-${pad(n)}`
}

export function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

export function projectRoot(): string {
  return join(import.meta.dirname, '..')
}

export function parseArgs(argv: string[]): { grid: boolean; skipPerms: boolean; target: string } {
  const flags = new Set(argv.filter((a) => a.startsWith('-')))
  const rest = argv.filter((a) => !a.startsWith('-'))
  const target = rest[0] ?? process.env.LOADGEN_TARGET ?? ''
  return {
    grid: flags.has('--grid'),
    skipPerms: flags.has('--skip-permissions') || flags.has('--dangerously-skip-permissions'),
    target,
  }
}
