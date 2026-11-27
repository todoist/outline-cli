// A separate worktree with the current change in it, for a reviewer that needs to run or break
// code. It checks out HEAD, applies the staged and unstaged diff, and copies untracked files that
// are not ignored. It does not link node_modules: reinstalling through a symlinked node_modules
// would empty the original checkout's install. A nested repository is left out: its contents
// aren't part of the change, and copying it would bring its .git and its ignored files along.

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { cleanGitEnv, git } from './git.ts'

/**
 * Runs git with bytes in and out, so a patch with text that isn't valid UTF-8 survives the round
 * trip.
 */
function gitBytes(
    root: string,
    args: string[],
    input?: Buffer,
): { ok: boolean; stdout: Buffer; stderr: string } {
    const result = spawnSync('git', args, {
        cwd: root,
        env: cleanGitEnv(),
        input,
        maxBuffer: 256 * 1024 * 1024,
    })
    return {
        ok: result.status === 0,
        stdout: result.stdout ?? Buffer.alloc(0),
        stderr: result.stderr?.toString() ?? '',
    }
}

/** What the copy left out: nested repositories, by the folder git lists them as. */
export type ReviewWorktree = { skipped: string[] }

export function createReviewWorktree(root: string, target: string): ReviewWorktree {
    if (existsSync(target)) throw new Error(`${target} already exists`)

    // Read the change before the worktree exists: a target inside the checkout would otherwise be
    // listed as an untracked folder and copied into itself. Fixed prefixes and no external diff,
    // textconv or colour, and the usual three lines of context, whatever the user's git config says,
    // so `git apply` can read the patch.
    const diff = gitBytes(root, [
        'diff',
        'HEAD',
        '--unified=3',
        '--binary',
        '--no-ext-diff',
        '--no-textconv',
        '--no-color',
        '--src-prefix=a/',
        '--dst-prefix=b/',
    ])
    if (!diff.ok) throw new Error(`git diff failed: ${diff.stderr.trim()}`)
    const untracked = git(root, ['ls-files', '-z', '--others', '--exclude-standard'])
    if (!untracked.ok) throw new Error(`git ls-files failed: ${untracked.stderr.trim()}`)
    const listed = untracked.stdout.split('\0').filter(Boolean)
    // Git lists a nested repository as its folder, with a trailing slash, rather than its files.
    const skipped = listed.filter((path) => path.endsWith('/'))

    const added = git(root, ['worktree', 'add', '--quiet', '--detach', target, 'HEAD'])
    if (!added.ok) throw new Error(`git worktree add failed: ${added.stderr.trim()}`)

    try {
        if (diff.stdout.length > 0) {
            const applied = gitBytes(target, ['apply', '--whitespace=nowarn'], diff.stdout)
            if (!applied.ok) throw new Error(`git apply failed: ${applied.stderr.trim()}`)
        }
        for (const path of listed) {
            if (path.endsWith('/')) continue
            mkdirSync(dirname(join(target, path)), { recursive: true })
            // verbatimSymlinks keeps a relative link relative, instead of pointing it back into
            // the original checkout.
            cpSync(join(root, path), join(target, path), {
                recursive: true,
                verbatimSymlinks: true,
            })
        }
    } catch (error) {
        // Leave nothing behind, so a retry is not refused with "already exists".
        git(root, ['worktree', 'remove', '--force', target])
        rmSync(target, { recursive: true, force: true })
        throw error
    }
    return { skipped }
}
