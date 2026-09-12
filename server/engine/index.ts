export { canonicalise } from './canonicalise.ts'
export { addRule, deleteRule, listRules, loadRules, match } from './rules.ts'

import { loadRules } from './rules.ts'

loadRules()
