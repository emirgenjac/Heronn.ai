import type { Interrupt, Rule } from '../shared/types.ts'

// TODO(lane-2): replace with import from './engine/index.ts'

export function canonicalise(i: Interrupt): Pick<Interrupt, 'fingerprint' | 'title' | 'detail' | 'destructive'> {
  return {
    fingerprint: i.tool + ':' + JSON.stringify(i.args),
    title: i.tool,
    detail: '',
    destructive: false,
  }
}

export function match(_fingerprint: string, _repo: string): Rule | null {
  return null
}

export function addRule(
  _fingerprint: string,
  _scope: 'repo' | 'global',
  _repo: string | null,
  _action: 'allow' | 'deny',
): void {}
