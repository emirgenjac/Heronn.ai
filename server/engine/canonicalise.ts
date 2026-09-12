import { createHash } from 'node:crypto'
import type { Interrupt } from '../../shared/types.ts'
import {
  isDestructiveCommand,
  isDestructivePath,
  pathShape,
  pathTouchesSensitive,
  redactOperand,
} from './classify.ts'
import { parseCommand, type Stage } from './parse.ts'

export type Canonical = {
  fingerprint: string
  title: string
  detail: string
  destructive: boolean
}

function sha1(value: unknown): string {
  return createHash('sha1').update(JSON.stringify(value)).digest('hex')
}

function isBash(tool: string): boolean {
  const t = tool.toLowerCase()
  return t === 'bash' || t === 'shell'
}

function titleForBash(stage: Stage, destructive: boolean): string {
  if (stage.argv0 === 'npm' && stage.subcommand === 'install') {
    return 'Install a package not in the lockfile'
  }
  if (stage.argv0 === 'npm' && stage.subcommand === 'test') return 'Run tests'
  if (stage.bin === 'mkdir') return 'Create a directory'
  if (stage.bin === 'git' && stage.subcommand === 'commit') return 'Create a git commit'
  if (stage.bin === 'git' && stage.subcommand === 'push' && destructive) return 'Force-push to remote'
  if (stage.bin === 'git' && stage.subcommand === 'push') return 'Push to remote'
  if (stage.bin === 'git' && stage.subcommand === 'reset') return 'Reset git state'
  if (stage.bin === 'curl' || stage.bin === 'wget') return 'Fetch a URL'
  if (stage.bin === 'rm') return 'Delete files'
  if (stage.bin === 'chmod') return 'Change file permissions'
  if (stage.subcommand) return `${stage.bin} ${stage.subcommand}`
  return stage.bin || 'Command'
}

function titleForOther(tool: string, destructive: boolean): string {
  if (tool === 'Write' || tool.toLowerCase() === 'write') {
    return destructive ? 'Write a file outside the repo' : 'Write a file in the repo'
  }
  return tool
}

function fingerprintBash(stage: Stage, cwd: string, repo: string): string {
  const redacted = stage.operands.map((op) =>
    redactOperand(op, stage.argv0, stage.subcommand, stage.bin, cwd, repo),
  )
  const flags = [...stage.flags].sort()
  return sha1([stage.argv0, stage.subcommand, flags, redacted, repo])
}

function otherPath(args: Record<string, unknown>): string | null {
  for (const key of ['path', 'file', 'target', 'filename']) {
    const v = args[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return null
}

function canonicaliseOther(i: Interrupt): Canonical {
  const keys = Object.keys(i.args).sort()
  const p = otherPath(i.args)
  const detail = p ?? JSON.stringify(i.args)
  try {
    const shape = p ? pathShape(p, i.cwd, i.repo) : ''
    const destructive = p ? isDestructivePath(p, i.cwd, i.repo) || pathTouchesSensitive(p) : false
    return {
      fingerprint: sha1([i.tool, keys, shape]),
      title: titleForOther(i.tool, destructive),
      detail,
      destructive,
    }
  } catch {
    return {
      fingerprint: sha1(['unparseable', detail, i.repo]),
      title: 'Unparseable command',
      detail,
      destructive: true,
    }
  }
}

export function canonicalise(i: Interrupt): Canonical {
  if (!isBash(i.tool)) return canonicaliseOther(i)

  const command = i.args.command
  const detail = typeof command === 'string' ? command : String(command ?? '')
  try {
    if (typeof command !== 'string' || command.trim() === '') {
      throw new Error('missing command')
    }
    const parsed = parseCommand(command)
    const stage = parsed.stages[0]
    if (!stage) throw new Error('empty command')
    const destructive = isDestructiveCommand(parsed, i.cwd, i.repo)
    return {
      fingerprint: fingerprintBash(stage, i.cwd, i.repo),
      title: titleForBash(stage, destructive),
      detail,
      destructive,
    }
  } catch {
    return {
      fingerprint: sha1(['unparseable', detail, i.repo]),
      title: 'Unparseable command',
      detail,
      destructive: true,
    }
  }
}
