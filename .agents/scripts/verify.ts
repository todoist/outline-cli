// `npm run verify`: every check CI runs on a pull request, in a few seconds.
// Records a fingerprint of the tree only when everything passed.

import { CHECKOUT_ROOT, branchBase, defaultBranchRef, resolveCommit } from './lib/git.ts'
import { forgetPassedPatch } from './lib/patches.ts'
import { clearVerified } from './lib/state.ts'
import { BLIND_SPOTS, preflight, removeLocalOnlyEnv, VERIFY_STEPS } from './lib/steps.ts'
import { runVerify } from './lib/verify.ts'

const root = CHECKOUT_ROOT
const ref = defaultBranchRef(root)
const base = ref ? branchBase(root, ref) : undefined

const problems = preflight(root)
if (problems.length > 0) {
    // A run that stops here is a run that didn't pass: forget the tree and the branch's changes, as
    // a failing check would.
    clearVerified(root)
    const head = resolveCommit(root, 'HEAD')
    if (head !== undefined && base !== undefined) forgetPassedPatch(root, base, head)
    for (const problem of problems) console.log(`✗ ${problem}`)
    process.exit(1)
}

for (const name of removeLocalOnlyEnv(process.env)) {
    console.log(`Ignoring ${name}: CI does not set it.`)
}

const result = await runVerify({
    root,
    steps: VERIFY_STEPS,
    base,
    baseName: ref?.replace(/^refs\/(remotes|heads)\//, '') ?? 'main',
})

if (result.recorded) {
    console.log('Not covered by these checks:')
    for (const spot of BLIND_SPOTS) console.log(`- ${spot}`)
}
process.exit(result.ok ? 0 : 1)
