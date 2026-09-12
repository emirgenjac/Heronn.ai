export type Token = { kind: 'word' | 'op'; value: string }

export type Stage = {
  bin: string
  argv0: string
  subcommand: string
  flags: string[]
  operands: string[]
}

export type ParsedCommand = {
  stages: Stage[]
  ops: string[]
}

const FLAGS_WITH_VALUE = new Set([
  '-m',
  '--message',
  '--msg',
  '-C',
  '--directory',
  '-o',
  '--output',
  '--prefix',
  '--file',
  '-e',
  '--exclude',
  '--spec',
])

const HAS_SUBCOMMAND = new Set([
  'git',
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'npx',
  'pnpx',
  'bunx',
  'cargo',
  'go',
  'docker',
  'kubectl',
])

const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun'])
const TEST_RUNNERS = new Set(['vitest', 'jest', 'mocha', 'ava', 'tap'])

export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = input.length

  while (i < n) {
    const c = input[i]!
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }
    if (c === '|' && input[i + 1] === '|') {
      tokens.push({ kind: 'op', value: '||' })
      i += 2
      continue
    }
    if (c === '|') {
      tokens.push({ kind: 'op', value: '|' })
      i++
      continue
    }
    if (c === '&' && input[i + 1] === '&') {
      tokens.push({ kind: 'op', value: '&&' })
      i += 2
      continue
    }
    if (c === ';') {
      tokens.push({ kind: 'op', value: ';' })
      i++
      continue
    }

    let word = ''
    let quote: '"' | "'" | null = null
    while (i < n) {
      const ch = input[i]!
      if (quote) {
        if (ch === '\\' && quote === '"' && i + 1 < n) {
          word += input[i + 1]
          i += 2
          continue
        }
        if (ch === quote) {
          quote = null
          i++
          continue
        }
        word += ch
        i++
        continue
      }
      if (ch === '"' || ch === "'") {
        quote = ch
        i++
        continue
      }
      if (ch === '\\' && i + 1 < n) {
        word += input[i + 1]
        i += 2
        continue
      }
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') break
      if (ch === '|' || ch === ';') break
      if (ch === '&' && input[i + 1] === '&') break
      word += ch
      i++
    }
    if (word.length > 0) tokens.push({ kind: 'word', value: word })
  }
  return tokens
}

function basename(cmd: string): string {
  const slash = Math.max(cmd.lastIndexOf('/'), cmd.lastIndexOf('\\'))
  return slash === -1 ? cmd : cmd.slice(slash + 1)
}

function expandShortFlags(token: string): string[] {
  if (token.startsWith('--')) {
    const eq = token.indexOf('=')
    return [eq === -1 ? token : token.slice(0, eq)]
  }
  if (token.startsWith('-') && token.length > 2 && !token.startsWith('-=')) {
    const body = token.slice(1)
    if ([...body].every((ch) => ch !== '=' && ch !== '-')) {
      return [...body].map((ch) => `-${ch}`)
    }
  }
  return [token]
}

function parseStage(words: string[]): Stage {
  const expanded: string[] = []
  for (const w of words) {
    if (w.startsWith('-')) expanded.push(...expandShortFlags(w))
    else expanded.push(w)
  }

  const flags: string[] = []
  const rest: string[] = []
  let i = 0
  const bin = basename(expanded[i++] ?? '')
  while (i < expanded.length) {
    const t = expanded[i]!
    if (t.startsWith('-')) {
      flags.push(t)
      if (FLAGS_WITH_VALUE.has(t) && i + 1 < expanded.length && !expanded[i + 1]!.startsWith('-')) {
        i += 2
        continue
      }
      i++
      continue
    }
    rest.push(t)
    i++
  }

  let subcommand = ''
  let operands = rest
  if (HAS_SUBCOMMAND.has(bin) && rest.length > 0) {
    subcommand = rest[0]!
    operands = rest.slice(1)
  }

  const normalized = normalizePm(bin, subcommand, operands)
  return {
    bin,
    argv0: normalized.argv0,
    subcommand: normalized.subcommand,
    flags,
    operands: normalized.operands,
  }
}

function normalizePm(
  bin: string,
  subcommand: string,
  operands: string[],
): { argv0: string; subcommand: string; operands: string[] } {
  if (bin === 'npx' || bin === 'pnpx' || bin === 'bunx') {
    const name = subcommand
    if (TEST_RUNNERS.has(name)) {
      return { argv0: 'npm', subcommand: 'test', operands: [] }
    }
  }

  if (PACKAGE_MANAGERS.has(bin)) {
    let sub = subcommand
    if (sub === 'add' || sub === 'i') sub = 'install'
    if (sub === 't') sub = 'test'
    if (sub === 'test') return { argv0: 'npm', subcommand: 'test', operands: [] }
    if (sub === 'install') return { argv0: 'npm', subcommand: 'install', operands }
    return { argv0: 'npm', subcommand: sub, operands }
  }

  return { argv0: bin, subcommand, operands }
}

export function parseCommand(command: string): ParsedCommand {
  const tokens = tokenize(command)
  const stages: Stage[] = []
  const ops: string[] = []
  let current: string[] = []

  const flush = () => {
    if (current.length === 0) return
    stages.push(parseStage(current))
    current = []
  }

  for (const t of tokens) {
    if (t.kind === 'op') {
      flush()
      ops.push(t.value)
    } else {
      current.push(t.value)
    }
  }
  flush()
  return { stages, ops }
}
