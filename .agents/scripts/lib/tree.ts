// Fingerprints of the working tree, by file content. Hashing content (not mtimes) catches edits
// made in the same second, and hashing in-process writes nothing to git's object store. Files are
// hashed the way git hashes a blob, so the same content gets the id git would give it.

import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'
import { git } from './git.ts'

/** Path → mode and content hash for every tracked and untracked, non-ignored file. */
export type Snapshot = Record<string, string>

export function snapshot(root: string): Snapshot {
    const listed = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    if (!listed.ok) throw new Error(`git ls-files failed: ${listed.stderr.trim()}`)
    const files: Snapshot = {}
    for (const path of new Set(listed.stdout.split('\0').filter(Boolean))) {
        const hash = hashPath(join(root, path))
        // A tracked file deleted from disk is left out, exactly as it is once the deletion is
        // staged, so staging a deletion doesn't change the snapshot.
        if (hash !== undefined) files[path] = hash
    }
    return files
}

function hashPath(path: string): string | undefined {
    try {
        const stat = lstatSync(path)
        if (stat.isSymbolicLink()) return `link:${blobId(Buffer.from(readlinkSync(path)))}`
        if (stat.isDirectory()) return 'dir' // a nested repository, listed but not entered
        return `${stat.mode & 0o111 ? 'x' : '-'}:${blobId(readFileSync(path))}`
    } catch {
        // Gone, or went away while being read.
        return undefined
    }
}

/** The id git gives a blob with this content. */
function blobId(content: Buffer): string {
    return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex')
}

/**
 * The pull-request workflows that run checks. .agents/scripts/lib/steps.test.ts compares verify
 * with their commands, and reads every other workflow to check none of them runs a command on pull
 * requests, so every workflow counts as code.
 */
export const CHECKED_WORKFLOWS = [
    '.github/workflows/check-skill-sync.yml',
    '.github/workflows/lint.yml',
    '.github/workflows/test.yml',
]

/** The kind of file, as far as local checks are concerned. */
export type FileKind = 'docs' | 'unchecked' | 'code'

/**
 * - docs: prose no local check reads. `npm run format:check` (oxfmt) reads Markdown, JSON and YAML
 *   as well as code, so that is only what `.oxfmtrc.json` leaves out: CHANGELOG.md, which the
 *   release writes.
 * - unchecked: files only CI reads. `.nvmrc` picks CI's Node version; verify runs on yours.
 * - code: everything else, including every other Markdown file, the workflows, lockfiles, the
 *   generated skill and tests.
 *
 * tree.test.ts keeps this honest: oxfmt has to leave alone every file in the checkout classified as
 * docs or unchecked.
 */
export function classify(path: string): FileKind {
    if (path === 'CHANGELOG.md') return 'docs'
    if (path === '.nvmrc') return 'unchecked'
    return 'code'
}

/**
 * Hash of every file local checks read, so editing docs, or files only CI reads, after a pass
 * keeps it valid.
 */
export function codeFingerprint(files: Snapshot): string {
    const hash = createHash('sha256')
    for (const path of Object.keys(files).sort()) {
        if (classify(path) === 'code') hash.update(`${path}\0${files[path]}\n`)
    }
    return hash.digest('hex')
}

/** Changed files local checks read. */
export function changedCodePaths(before: Snapshot, after: Snapshot): string[] {
    return changedPaths(before, after).filter((path) => classify(path) === 'code')
}

export function changedPaths(before: Snapshot, after: Snapshot): string[] {
    const paths = new Set([...Object.keys(before), ...Object.keys(after)])
    return [...paths].filter((path) => before[path] !== after[path]).sort()
}

/** Files that differ from `base`: committed, staged, unstaged and untracked. */
export function changedSince(root: string, base: string): string[] {
    const diff = git(root, ['diff', '--name-only', '-z', '--no-renames', base])
    if (!diff.ok) throw new Error(`git diff failed: ${diff.stderr.trim()}`)
    const untracked = git(root, ['ls-files', '-z', '--others', '--exclude-standard'])
    const paths = [...diff.stdout.split('\0'), ...untracked.stdout.split('\0')].filter(Boolean)
    return [...new Set(paths)].sort()
}
