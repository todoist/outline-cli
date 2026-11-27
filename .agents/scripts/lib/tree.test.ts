import { rmSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { git } from './git.ts'
import { createTempRepo, REPO_ROOT, type TempRepo } from './test-repo.ts'
import { changedPaths, changedSince, classify, codeFingerprint, snapshot } from './tree.ts'

let repo: TempRepo

beforeEach(() => {
    repo = createTempRepo()
    repo.write('src/a.ts', 'export const a = 1\n')
    repo.write('README.md', 'readme\n')
    repo.write('.gitignore', 'ignored/\n')
    repo.git(['add', '.'])
    repo.git(['commit', '--quiet', '-m', 'initial'])
})

afterEach(() => repo.cleanup())

const objectCount = () => repo.git(['count-objects', '-v']).stdout

describe('snapshot', () => {
    it('sees an edit that keeps the size and modification time', () => {
        const before = codeFingerprint(snapshot(repo.dir))
        const file = join(repo.dir, 'src/a.ts')
        repo.write('src/a.ts', 'export const a = 2\n')
        utimesSync(file, new Date(2020, 0, 1), new Date(2020, 0, 1))
        const middle = codeFingerprint(snapshot(repo.dir))
        repo.write('src/a.ts', 'export const a = 3\n')
        utimesSync(file, new Date(2020, 0, 1), new Date(2020, 0, 1))
        const after = codeFingerprint(snapshot(repo.dir))
        expect(new Set([before, middle, after]).size).toBe(3)
    })

    it('includes untracked files and leaves out ignored ones', () => {
        const before = snapshot(repo.dir)
        repo.write('src/new.ts', 'new\n')
        repo.write('ignored/build.js', 'built\n')
        expect(changedPaths(before, snapshot(repo.dir))).toEqual(['src/new.ts'])
    })

    it('sees a deleted tracked file', () => {
        const before = snapshot(repo.dir)
        rmSync(join(repo.dir, 'src/a.ts'))
        expect(changedPaths(before, snapshot(repo.dir))).toEqual(['src/a.ts'])
    })

    it('sees an executable bit change', () => {
        const before = codeFingerprint(snapshot(repo.dir))
        repo.run('chmod', ['+x', 'src/a.ts'])
        expect(codeFingerprint(snapshot(repo.dir))).not.toBe(before)
    })

    it('writes nothing to the object store', () => {
        repo.write('src/new.ts', 'new\n')
        const before = objectCount()
        snapshot(repo.dir)
        expect(objectCount()).toBe(before)
    })
})

describe('codeFingerprint', () => {
    it('ignores the changelog and .nvmrc, which no local check reads', () => {
        const before = codeFingerprint(snapshot(repo.dir))
        repo.write('CHANGELOG.md', '# Changelog\n')
        repo.write('.nvmrc', '26\n')
        expect(codeFingerprint(snapshot(repo.dir))).toBe(before)
    })

    it.each([
        ['README.md', 'changed\n'],
        ['docs/guide.md', 'new\n'],
        ['renovate.json', '{}\n'],
        ['.github/workflows/release.yml', 'on: push\n'],
    ])('changes when %s changes, since a local check reads it', (path, content) => {
        const before = codeFingerprint(snapshot(repo.dir))
        repo.write(path, content)
        expect(codeFingerprint(snapshot(repo.dir))).not.toBe(before)
    })
})

describe('classify', () => {
    it.each([
        ['CHANGELOG.md', 'docs'],
        ['.nvmrc', 'unchecked'],
        ['README.md', 'code'],
        ['CONTRIBUTING.md', 'code'],
        ['CLAUDE.md', 'code'],
        ['docs/agents.md', 'code'],
        ['renovate.json', 'code'],
        ['.github/workflows/lint.yml', 'code'],
        ['.github/workflows/test.yml', 'code'],
        ['.github/workflows/check-skill-sync.yml', 'code'],
        ['.github/workflows/release.yml', 'code'],
        ['skills/outline-cli/SKILL.md', 'code'],
        ['src/index.ts', 'code'],
        ['scripts/sync-skill.js', 'code'],
        ['package-lock.json', 'code'],
        ['.gitignore', 'code'],
        ['release.config.js', 'code'],
        ['.agents/scripts/verify.ts', 'code'],
        ['lefthook.yml', 'code'],
    ])('%s is %s', (path, kind) => {
        expect(classify(path)).toBe(kind)
    })

    // CI's format check reads Markdown, JSON and YAML too, so only a file oxfmt leaves alone may be
    // left out of verify. Each one the checkout holds is made badly formatted in a throwaway repo
    // with this repository's .oxfmtrc.json, and oxfmt must still pass; README.md, which it reads,
    // shows the same content would fail.
    it('leaves out of the checks only files the format check leaves alone', () => {
        const tracked = git(REPO_ROOT, ['ls-files']).stdout.split('\n').filter(Boolean)
        const leftOut = tracked.filter((path) => classify(path) !== 'code')
        expect(leftOut).toContain('CHANGELOG.md')
        repo.copyFromCheckout('.oxfmtrc.json')
        const unformatted = '#   Not   formatted\n\n\n\n*   item\n'
        for (const path of leftOut) repo.write(path, unformatted)
        const oxfmt = () =>
            repo.run(join(REPO_ROOT, 'node_modules/.bin/oxfmt'), ['--check'], { cwd: repo.dir })

        const skipped = oxfmt()
        expect(skipped.status, skipped.stdout).toBe(0)
        repo.write('README.md', unformatted)
        const read = oxfmt()
        expect(read.status).not.toBe(0)
        expect(read.stdout).toContain('README.md')
    })
})

describe('changedSince', () => {
    it('lists committed, staged, unstaged and untracked changes', () => {
        const base = repo.git(['rev-parse', 'HEAD']).stdout.trim()
        repo.git(['switch', '--quiet', '-c', 'feature'])
        repo.write('src/committed.ts', '1\n')
        repo.git(['add', '.'])
        repo.git(['commit', '--quiet', '-m', 'c'])
        repo.write('src/staged.ts', '1\n')
        repo.git(['add', 'src/staged.ts'])
        repo.write('src/a.ts', 'unstaged\n')
        repo.write('src/untracked.ts', '1\n')
        expect(changedSince(repo.dir, base)).toEqual([
            'src/a.ts',
            'src/committed.ts',
            'src/staged.ts',
            'src/untracked.ts',
        ])
    })
})
