import { parseCommand, tokenize } from '../engine/parse.ts'
import { normalizeCmd } from './prefix.ts'

export type CommandClass =
  | 'dependency'
  | 'test'
  | 'build'
  | 'git-read'
  | 'git-write'
  | 'git-destructive'
  | 'fs-write'
  | 'network'
  | 'unknown'

const NEVER_AUTO = new Set<CommandClass>(['git-destructive', 'unknown'])

const GIT_READ = new Set(['status', 'diff', 'log', 'branch', 'show', 'rev-parse', 'remote'])
const GIT_WRITE = new Set(['add', 'commit', 'checkout'])
const DEP_SUBS = new Set(['install', 'add', 'ci', 'i'])
const TEST_BINS = new Set(['jest', 'mocha', 'vitest', 'ava', 'tap'])
const BUILD_BINS = new Set(['tsc', 'vite', 'webpack', 'esbuild', 'rollup'])
const FS_WRITE_BINS = new Set(['mkdir', 'touch', 'cp', 'mv'])
const NETWORK_BINS = new Set(['curl', 'wget'])
const PM_BINS = new Set(['npm', 'pnpm', 'yarn', 'bun'])
const NPX_BINS = new Set(['npx', 'pnpx', 'bunx'])
const RUN_TEST_SCRIPTS = new Set(['test', 'tests'])
const RUN_BUILD_SCRIPTS = new Set(['build'])

export function neverAutoAllow(cls: CommandClass): boolean {
  return NEVER_AUTO.has(cls)
}

export function classifyCommand(command: string, classMap: Record<string, string> = {}): CommandClass {
  const parsed = parseCommand(command)
  const stage = parsed.stages[0]
  if (!stage) return 'unknown'

  if (stage.bin === 'git') {
    if (stage.subcommand === 'push' && (stage.flags.includes('--force') || stage.flags.includes('-f'))) {
      return 'git-destructive'
    }
    if (stage.subcommand === 'reset' && stage.flags.includes('--hard')) return 'git-destructive'
    if (GIT_READ.has(stage.subcommand)) return 'git-read'
    if (GIT_WRITE.has(stage.subcommand)) return 'git-write'
    return 'unknown'
  }

  if (stage.argv0 === 'npm' && stage.subcommand === 'install') return 'dependency'
  if (stage.argv0 === 'npm' && stage.subcommand === 'test') return 'test'
  if (stage.argv0 === 'npm' && stage.subcommand === 'run') {
    const script = stage.operands[0] ?? ''
    if (RUN_TEST_SCRIPTS.has(script)) return 'test'
    if (RUN_BUILD_SCRIPTS.has(script)) return 'build'
  }
  if (PM_BINS.has(stage.bin) && DEP_SUBS.has(stage.subcommand)) return 'dependency'

  const inner = NPX_BINS.has(stage.bin) ? stage.subcommand : ''
  if (TEST_BINS.has(stage.bin) || TEST_BINS.has(inner)) return 'test'
  if (
    BUILD_BINS.has(stage.bin) ||
    BUILD_BINS.has(inner) ||
    (stage.bin === 'cargo' && stage.subcommand === 'build')
  ) {
    return 'build'
  }
  if (stage.bin === 'cargo' && stage.subcommand === 'test') return 'test'
  if (FS_WRITE_BINS.has(stage.bin)) return 'fs-write'
  if (NETWORK_BINS.has(stage.bin)) return 'network'

  const mapped = classMap[stage.bin] ?? classMap[stage.argv0]
  if (mapped === 'dependency') {
    const sub = stage.subcommand || stage.operands[0] || ''
    if (DEP_SUBS.has(sub) || stage.subcommand === 'install') return 'dependency'
  }
  if (
    mapped === 'test' ||
    mapped === 'build' ||
    mapped === 'git-read' ||
    mapped === 'git-write' ||
    mapped === 'fs-write' ||
    mapped === 'network'
  ) {
    return mapped
  }

  return 'unknown'
}

export function stablePrefix(command: string): string {
  const parsed = parseCommand(command)
  const stage = parsed.stages[0]
  if (!stage) return normalizeCmd(command)

  const words: string[] = []
  for (const t of tokenize(command)) {
    if (t.kind !== 'word') break
    if (t.value.startsWith('-')) continue
    words.push(t.value)
    if (words.length >= 2) break
  }

  if (stage.subcommand) return `${stage.bin} ${words[1] ?? stage.subcommand}`
  if (FS_WRITE_BINS.has(stage.bin) || NETWORK_BINS.has(stage.bin) || BUILD_BINS.has(stage.bin)) {
    return stage.bin
  }
  return normalizeCmd(command)
}
