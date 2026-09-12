import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { git, pad, worktreeBranch, worktreePath } from './util.ts'

const SOURCE_EXT = new Set(['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs'])

function countSources(root: string): number {
  let n = 0
  const walk = (dir: string) => {
    let entries
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'coverage') continue
      const p = join(dir, name)
      let st
      try {
        st = statSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(p)
      else {
        const dot = name.lastIndexOf('.')
        if (dot !== -1 && SOURCE_EXT.has(name.slice(dot))) n++
      }
    }
  }
  walk(root)
  return n
}

function isOwnRepo(target: string): boolean {
  const pkgPath = join(target, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string }
      if (pkg.name === 'adria-hack-ai-project') return true
    } catch {
      /* ignore */
    }
  }
  try {
    const remotes = git(target, ['remote', '-v'])
    if (remotes.includes('Adria-Hack-AI-Project')) return true
  } catch {
    /* ignore */
  }
  return false
}

function listedWorktrees(target: string): Set<string> {
  try {
    const out = git(target, ['worktree', 'list', '--porcelain'])
    const paths = new Set<string>()
    for (const line of out.split('\n')) {
      if (line.startsWith('worktree ')) paths.add(resolve(line.slice('worktree '.length)))
    }
    return paths
  } catch {
    return new Set()
  }
}

const targetArg = process.argv[2]
if (!targetArg) {
  console.error('usage: npx tsx loadgen/setup.ts <throwaway-clone-path>')
  process.exit(1)
}

const target = resolve(targetArg)
if (!existsSync(join(target, '.git'))) {
  console.error(`not a git repo: ${target}`)
  process.exit(1)
}
if (!existsSync(join(target, 'package.json'))) {
  console.error(`missing package.json: ${target}`)
  process.exit(1)
}
if (isOwnRepo(target)) {
  console.error('refusing to use this project as the loadgen target — clone a public throwaway repo')
  process.exit(1)
}

const sources = countSources(target)
if (sources < 50) {
  console.error(`need 50+ source files, found ${sources} in ${target}`)
  process.exit(1)
}

const existing = listedWorktrees(target)
for (let n = 1; n <= 10; n++) {
  const dest = worktreePath(target, n)
  const branch = worktreeBranch(n)
  if (existing.has(resolve(dest)) || existsSync(dest)) {
    console.log(`skip wt-${pad(n)} (already exists)`)
    continue
  }
  try {
    git(target, ['worktree', 'add', '-b', branch, dest])
  } catch {
    git(target, ['worktree', 'add', dest, branch])
  }
  console.log(`created ${dest} on ${branch}`)
}
console.log('setup ok')
