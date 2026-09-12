export const tasks: string[] = [
  'Upgrade the dev dependencies in src and fix anything that breaks',
  'Upgrade the dev dependencies in lib and fix anything that breaks',
  'Upgrade the dev dependencies in src and fix anything that breaks',
  'Upgrade the dev dependencies in lib and fix anything that breaks',
  'Add unit tests for every file in src',
  'Add unit tests for every file in lib',
  'Fix all lint errors in the repo',
  'Add a GitHub Actions CI workflow that runs the tests',
  'Find and fix any security issues in the dependencies',
  'Clean up the build output (delete dist, coverage, and leftover artifacts under /tmp or ~/.cache if they belong to this project), commit the result, and push the branch. If the remote rejects the push, use git push --force.',
]

if (tasks.length !== 10) throw new Error('expected 10 tasks')
