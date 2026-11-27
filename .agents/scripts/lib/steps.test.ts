import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeJson } from './state.ts'
import { CI_EQUIVALENTS, preflight, removeLocalOnlyEnv, VERIFY_STEPS } from './steps.ts'
import { REPO_ROOT } from './test-repo.ts'
import { CHECKED_WORKFLOWS } from './tree.ts'

const WORKFLOWS_DIR = join(REPO_ROOT, '.github/workflows')
const readWorkflowFile = (name: string) => readFileSync(join(WORKFLOWS_DIR, name), 'utf8')

// A line in a `run: |` script that runs a tool, and the shell around tools that runs nothing new.
const TOOL_LINE = /^(npm|npx|node|gh|tsc|vitest|oxlint|oxfmt)\s/
const SHELL_LINE = /^(if|then|else|elif|fi|for|while|do|done|case|esac|echo|exit|set|#)(\s|;|$)/

// A `run` key anywhere on a line: a block step, a flow mapping (`- { run: npm test }`) and the like.
const RUN_KEY = /(^|[\s{,])run\s*:/

/**
 * The commands a workflow runs: each one-line `run:`, and every tool line of a `run: |` script, so a
 * check added to a script cannot hide behind the command that was already there. `unread` holds
 * every line that runs something this can't read, such as a step written as a flow mapping or a
 * script line that isn't a known tool, so a new check can't hide there either.
 */
function readWorkflow(text: string): { commands: string[]; unread: string[] } {
    const commands: string[] = []
    const unread: string[] = []
    const lines = text.split('\n')
    let scriptIndent: number | undefined
    for (const line of lines) {
        const trimmed = line.trim()
        if (scriptIndent !== undefined) {
            if (!trimmed) continue
            if (line.search(/\S/) > scriptIndent) {
                if (TOOL_LINE.test(trimmed)) commands.push(trimmed)
                else if (!SHELL_LINE.test(trimmed)) unread.push(trimmed)
                continue
            }
            scriptIndent = undefined
        }
        const match = line.match(/^(\s+)(?:- )?run: (.+)$/)
        if (!match) {
            if (RUN_KEY.test(line.replace(/#.*$/, ''))) unread.push(trimmed)
            continue
        }
        const [, indent = '', value = ''] = match
        if (value.startsWith('|')) scriptIndent = indent.length
        else commands.push(value.trim())
    }
    return { commands, unread }
}

const workflowCommands = (text: string) => readWorkflow(text).commands

/** The `on:` trigger, inline (`on: [push, pull_request]`) or as an indented block. */
function triggers(text: string): string {
    const match = text.match(/^["']?on["']?:(.*)\n((?:(?:[ \t].*)?\n)*)/m)
    return match ? `${match[1]}\n${match[2]}` : ''
}

const runsOnPullRequests = (text: string) => /\bpull_request(_target)?\b/.test(triggers(text))

describe('reading workflows', () => {
    it.each([
        ['on:\n    pull_request:\n', true],
        ['on:\n    pull_request_target:\n        types: [opened]\n', true],
        ['on: [push, pull_request]\n', true],
        ['on: { pull_request: {} }\n', true],
        ['"on": pull_request\n', true],
        ['on:\n    issues:\n        types: [opened]\n', false],
        ["on:\n    push:\njobs:\n    a:\n        if: github.event_name == 'pull_request'\n", false],
    ])('%j runs on pull requests: %s', (text, expected) => {
        expect(runsOnPullRequests(text)).toBe(expected)
    })

    it('takes every tool line of a script, not only its last one', () => {
        const text = [
            'steps:',
            '    - run: |',
            '          if ! command -v gh >/dev/null 2>&1; then',
            '              echo "skipping"',
            '              exit 0',
            '          fi',
            '          npm run new-check',
            '          npx oxlint src',
            '    - run: npm test',
            '',
        ].join('\n')
        expect(readWorkflow(text)).toEqual({
            commands: ['npm run new-check', 'npx oxlint src', 'npm test'],
            unread: [],
        })
    })

    it('reports a step or script line it cannot read, rather than skipping it', () => {
        const text = [
            'steps:',
            '    - { name: Docs, run: npm run check-docs }',
            '    - run: |',
            '          echo "checking"',
            '          bash scripts/check-links.sh',
            '    - name: Test',
            '      run: npm test',
            '',
        ].join('\n')
        expect(readWorkflow(text)).toEqual({
            commands: ['npm test'],
            unread: ['- { name: Docs, run: npm run check-docs }', 'bash scripts/check-links.sh'],
        })
    })
})

describe('verify covers CI', () => {
    const pullRequestWorkflows = readdirSync(WORKFLOWS_DIR)
        .filter((name) => /\.ya?ml$/.test(name))
        .filter((name) => runsOnPullRequests(readWorkflowFile(name)))

    it('reads every pull-request workflow that runs a command', () => {
        const running = pullRequestWorkflows
            .filter((name) => {
                const { commands, unread } = readWorkflow(readWorkflowFile(name))
                return commands.length > 0 || unread.length > 0
            })
            .map((name) => `.github/workflows/${name}`)
        expect(running.toSorted()).toEqual(CHECKED_WORKFLOWS.toSorted())
    })

    it.each(pullRequestWorkflows)('can read every command %s runs', (name) => {
        expect(readWorkflow(readWorkflowFile(name)).unread).toEqual([])
    })

    it('has an equivalent for every command in those workflows, and only those', () => {
        const commands = new Set(
            CHECKED_WORKFLOWS.flatMap((path) => workflowCommands(readWorkflowFile(basename(path)))),
        )
        expect(commands.size).toBeGreaterThan(4)
        expect([...commands].toSorted()).toEqual(
            CI_EQUIVALENTS.map((entry) => entry.run).toSorted(),
        )
    })

    it('says why a command has no verify step', () => {
        for (const entry of CI_EQUIVALENTS) {
            if (entry.steps.length === 0) expect(entry.why, entry.run).toBeTruthy()
        }
    })

    it('runs the same commands as the package.json scripts CI calls', () => {
        const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
            scripts: Record<string, string>
        }
        const normalize = (command: string) => command.trim().replace(/^npx /, '')
        const stepCommand = (name: string) => {
            const step = VERIFY_STEPS.find((candidate) => candidate.name === name)
            return normalize([basename(step?.command ?? ''), ...(step?.args ?? [])].join(' '))
        }
        const scripted = CI_EQUIVALENTS.filter((entry) => entry.steps.length > 0)
        for (const entry of scripted) {
            const [, run, test] = entry.run.match(/^npm (?:run (\S+)|(test))$/) ?? []
            const script = run ?? test
            expect(script, entry.run).toBeDefined()
            const commands = (pkg.scripts[script ?? ''] ?? '').split('&&').map(normalize)
            expect({ script, commands }).toEqual({ script, commands: entry.steps.map(stepCommand) })
        }
    })

    it('names only steps that exist', () => {
        const names = VERIFY_STEPS.map((step) => step.name)
        for (const entry of CI_EQUIVALENTS) {
            for (const step of entry.steps) expect(names).toContain(step)
        }
        for (const step of VERIFY_STEPS) {
            if (step.after) expect(names).toContain(step.after)
            for (const other of step.waitFor ?? []) expect(names).toContain(other)
        }
    })

    it('reads dist/ only once the build has written it', () => {
        const step = (name: string) => VERIFY_STEPS.find((candidate) => candidate.name === name)
        expect(step('tests')?.waitFor).toContain('build')
        expect(step('skill-sync')?.after).toBe('build')
    })
})

describe('removeLocalOnlyEnv', () => {
    it('keeps a real Outline token and the CLI settings CI never sets away from the checks', () => {
        const env = {
            PATH: '/usr/bin',
            OUTLINE_API_TOKEN: 'real-token',
            OUTLINE_URL: 'https://wiki.example.com',
            OL_ACCESSIBLE: '1',
            FORCE_COLOR: '1',
        }
        expect(removeLocalOnlyEnv(env).toSorted()).toEqual([
            'FORCE_COLOR',
            'OL_ACCESSIBLE',
            'OUTLINE_API_TOKEN',
            'OUTLINE_URL',
        ])
        expect(env).toEqual({ PATH: '/usr/bin' })
    })
})

describe('preflight', () => {
    let root: string

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'agent-preflight-'))
        writeJson(join(root, 'package.json'), {
            engines: { node: '>=24' },
            dependencies: { commander: '1.0.0' },
            devDependencies: { vitest: '2.0.0' },
        })
        writeJson(join(root, 'package-lock.json'), {
            packages: {
                '': { dependencies: { commander: '1.0.0' }, devDependencies: { vitest: '2.0.0' } },
                'node_modules/commander': { version: '1.0.0' },
                'node_modules/vitest': { version: '2.0.0' },
            },
        })
        writeInstalled({
            'node_modules/commander': { version: '1.0.0' },
            'node_modules/vitest': { version: '2.0.0' },
        })
    })

    // What npm records about the tree it installed.
    const writeInstalled = (packages: Record<string, { version: string }>) =>
        writeJson(join(root, 'node_modules/.package-lock.json'), { packages })

    afterEach(() => rmSync(root, { recursive: true, force: true }))

    it('passes a current install on a supported Node', () => {
        expect(preflight(root, '24.0.0')).toEqual([])
    })

    it('rejects a Node older than package.json engines', () => {
        const [problem] = preflight(root, '22.22.2')
        expect(problem).toContain('Node 22.22.2 is older than the >=24')
    })

    it('names a dependency whose installed version differs from the lockfile', () => {
        writeInstalled({
            'node_modules/commander': { version: '0.9.0' },
            'node_modules/vitest': { version: '2.0.0' },
        })
        expect(preflight(root, '24.0.0')).toEqual([
            'node_modules does not match package-lock.json: commander 0.9.0 (lockfile: 1.0.0). Run `npm ci`.',
        ])
    })

    it('names a dependency that is not installed', () => {
        writeInstalled({ 'node_modules/commander': { version: '1.0.0' } })
        expect(preflight(root, '24.0.0')[0]).toContain('vitest missing (lockfile: 2.0.0)')
    })

    it('names a transitive dependency that changed while every direct one kept its version', () => {
        const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as {
            packages: Record<string, unknown>
        }
        lock.packages['node_modules/ansi-regex'] = { version: '6.1.0' }
        writeJson(join(root, 'package-lock.json'), lock)
        writeInstalled({
            'node_modules/commander': { version: '1.0.0' },
            'node_modules/vitest': { version: '2.0.0' },
            'node_modules/ansi-regex': { version: '6.0.0' },
        })
        expect(preflight(root, '24.0.0')).toEqual([
            'node_modules does not match package-lock.json: ansi-regex 6.0.0 (lockfile: 6.1.0). Run `npm ci`.',
        ])
    })

    it('names a package still installed after the lockfile dropped it', () => {
        writeInstalled({
            'node_modules/commander': { version: '1.0.0' },
            'node_modules/vitest': { version: '2.0.0' },
            'node_modules/left-pad': { version: '1.3.0' },
        })
        expect(preflight(root, '24.0.0')).toEqual([
            'node_modules does not match package-lock.json: left-pad installed (lockfile: none). Run `npm ci`.',
        ])
    })

    it('accepts optional packages for other platforms that were never installed', () => {
        const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as {
            packages: Record<string, unknown>
        }
        lock.packages['node_modules/@oxlint/darwin-arm64'] = { version: '1.0.0', optional: true }
        lock.packages['node_modules/@oxfmt/win32-x64'] = { version: '1.0.0', devOptional: true }
        writeJson(join(root, 'package-lock.json'), lock)
        expect(preflight(root, '24.0.0')).toEqual([])
    })

    it('says when node_modules has no record of what npm installed', () => {
        rmSync(join(root, 'node_modules/.package-lock.json'))
        expect(preflight(root, '24.0.0')).toEqual([
            'node_modules has no record of what npm installed. Run `npm ci`.',
        ])
    })

    it('names a dependency package.json and the lockfile disagree on', () => {
        writeJson(join(root, 'package.json'), {
            engines: { node: '>=24' },
            dependencies: { commander: '1.1.0', added: '1.0.0' },
            devDependencies: { vitest: '2.0.0' },
        })
        expect(preflight(root, '24.0.0')).toEqual([
            'package.json and package-lock.json disagree: commander (package.json: 1.1.0, lockfile: 1.0.0), added (package.json: 1.0.0, lockfile: none). Run `npm install`.',
        ])
    })

    it('says when the lockfile is missing', () => {
        rmSync(join(root, 'package-lock.json'))
        expect(preflight(root, '24.0.0')).toEqual([
            'package-lock.json is missing or unreadable. Run `npm install`.',
        ])
    })

    it('says when node_modules is missing', () => {
        rmSync(join(root, 'node_modules'), { recursive: true })
        expect(preflight(root, '24.0.0')).toEqual(['node_modules is missing. Run `npm ci`.'])
    })
})
