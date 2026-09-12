import { homedir } from 'node:os'
import path from 'node:path'
import type { Stage } from './parse.ts'

export type OperandKind = 'package' | 'path' | 'url' | 'flag' | 'literal'

const SENSITIVE = new Set(['.ssh', '.aws', '.env', 'credentials', 'keychain'])
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash'])
const DOWNLOADERS = new Set(['curl', 'wget'])

function pathApi(p: string): path.PlatformPath {
  return p.includes('\\') || /^[A-Za-z]:/.test(p) ? path.win32 : path.posix
}

export function posixHome(cwd: string): string {
  if (cwd.startsWith('/home/')) {
    const parts = cwd.split('/')
    if (parts.length >= 3 && parts[1] && parts[2]) return `/${parts[1]}/${parts[2]}`
  }
  if (cwd.startsWith('/Users/')) {
    const parts = cwd.split('/')
    if (parts.length >= 3 && parts[1] && parts[2]) return `/${parts[1]}/${parts[2]}`
  }
  return homedir()
}

export function repoRoot(cwd: string, repo: string): string {
  const api = pathApi(cwd)
  if (api.basename(cwd) === repo) return cwd
  return api.join(cwd, repo)
}

export function expandTilde(p: string, cwd: string): string {
  if (p === '~') return posixHome(cwd)
  if (p.startsWith('~/') || p.startsWith('~\\')) return posixHome(cwd) + p.slice(1)
  return p
}

export function resolvePath(p: string, cwd: string): string {
  const expanded = expandTilde(p, cwd)
  const api = pathApi(cwd)
  if (api.isAbsolute(expanded)) return api.normalize(expanded)
  return api.normalize(api.join(cwd, expanded))
}

export function isInsideRepo(abs: string, cwd: string, repo: string): boolean {
  const root = repoRoot(cwd, repo)
  const api = pathApi(root)
  const nAbs = api.normalize(abs)
  const nRoot = api.normalize(root)
  const sep = api.sep
  return nAbs === nRoot || nAbs.startsWith(nRoot.endsWith(sep) ? nRoot : nRoot + sep)
}

function isUrl(token: string): boolean {
  return (
    token.startsWith('http://') ||
    token.startsWith('https://') ||
    token.startsWith('ftp://') ||
    token.includes('://')
  )
}

function isScopedPackage(token: string): boolean {
  if (!token.startsWith('@')) return false
  const slash = token.indexOf('/')
  return slash > 1 && token.indexOf('/', slash + 1) === -1
}

function isPathToken(token: string): boolean {
  if (token.startsWith('/') || token.startsWith('~') || token.startsWith('.') || token.startsWith('\\')) {
    return true
  }
  if (/^[A-Za-z]:/.test(token)) return true
  if (token.includes('/') || token.includes('\\')) return true
  return false
}

function isPackageContext(argv0: string, subcommand: string): boolean {
  return subcommand === 'install' || subcommand === 'add' || subcommand === 'i' || argv0 === 'npx'
}

export function classifyOperand(token: string, argv0: string, subcommand: string): OperandKind {
  if (token.startsWith('-')) return 'flag'
  if (isUrl(token)) return 'url'
  if (isScopedPackage(token) && isPackageContext(argv0, subcommand)) return 'package'
  if (isPathToken(token)) return 'path'
  if (isPackageContext(argv0, subcommand)) return 'package'
  return 'literal'
}

export function redactOperand(
  token: string,
  argv0: string,
  subcommand: string,
  bin: string,
  cwd: string,
  repo: string,
): string {
  if (bin === 'git' && (subcommand === 'push' || subcommand === 'pull') && !token.startsWith('-')) {
    return '<ref>'
  }
  const kind = classifyOperand(token, argv0, subcommand)
  if (kind === 'package') return '<pkg>'
  if (kind === 'url') return '<url>'
  if (kind === 'path') {
    const abs = resolvePath(token, cwd)
    if (isInsideRepo(abs, cwd, repo)) return '<in-repo>'
    return pathApi(abs).normalize(abs)
  }
  return token
}

export function pathTouchesSensitive(p: string): boolean {
  const parts = p.split(/[/\\]/)
  for (const part of parts) {
    if (!part) continue
    const lower = part.toLowerCase()
    if (SENSITIVE.has(lower)) return true
    if (lower.startsWith('.env')) return true
    if (lower.includes('credentials') || lower.includes('keychain')) return true
  }
  return false
}

export function pathShape(p: string, cwd: string, repo: string): string {
  const abs = resolvePath(p, cwd)
  if (isInsideRepo(abs, cwd, repo)) return '<in-repo>'
  return pathApi(abs).normalize(abs)
}

export function isDestructivePath(p: string, cwd: string, repo: string): boolean {
  if (pathTouchesSensitive(p)) return true
  const abs = resolvePath(p, cwd)
  return !isInsideRepo(abs, cwd, repo)
}

export function isDestructiveCommand(parsed: { stages: Stage[]; ops: string[] }, cwd: string, repo: string): boolean {
  const { stages, ops } = parsed
  for (let i = 0; i < ops.length; i++) {
    if (ops[i] !== '|') continue
    const left = stages[i]
    const right = stages[i + 1]
    if (left && right && DOWNLOADERS.has(left.bin) && SHELLS.has(right.bin)) return true
  }

  for (const stage of stages) {
    if (stage.bin === 'rm') {
      const recursive = stage.flags.includes('-r') || stage.flags.includes('-R')
      const force = stage.flags.includes('-f')
      if (recursive && force) return true
    }
    if (stage.bin === 'git' && stage.subcommand === 'push') {
      if (stage.flags.includes('--force') || stage.flags.includes('-f')) return true
    }
    if (stage.bin === 'git' && stage.subcommand === 'reset' && stage.flags.includes('--hard')) return true
    if (stage.bin === 'chmod' && stage.operands.some((op) => op === '777' || op === '0777')) return true
    for (const op of stage.operands) {
      if (classifyOperand(op, stage.argv0, stage.subcommand) === 'path' && isDestructivePath(op, cwd, repo)) {
        return true
      }
      if (pathTouchesSensitive(op)) return true
    }
  }
  return false
}
