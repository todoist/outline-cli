---
name: write-tests
description: Writes or changes tests in this repository to its quality bar, with the right helpers and layer. Use when adding, fixing or reviewing tests, when a change "needs a test", or when deciding whether a test may change.
---

# Write tests

## Where tests live

- Next to the code: `src/lib/refs.ts` → `src/lib/refs.test.ts`. A command group has its own test file (`src/commands/attachment.test.ts`, `src/commands/account.test.ts`), or its tests sit in the shared `src/commands/commands.test.ts`.
- Vitest without globals: import `describe`, `it`, `expect` and `vi` from `vitest`. The config doesn't restore mocks, so each file does it in `afterEach` (`vi.restoreAllMocks()`, and `vi.clearAllMocks()` when module mocks hold calls between tests).
- Command tests mock the API and the signed-in account at the top: `vi.mock('../lib/api.js', () => ({ apiRequest: vi.fn() }))` and `vi.mock('../lib/auth.js', () => mockOutlineAuthModule())`. Each test sets the API's answer, imports the command (`await import('./attachment.js')`), builds the program with `createTestProgram(registerXxxCommand)` and runs `program.parseAsync(['node', 'ol', ...])`. Capture output with `captureConsole()` or `captureStream()` and read it with `lines(spy)`. Read `src/commands/attachment.test.ts` for the shape.
- `src/lib/api.test.ts` mocks `fetchWithRetry` and answers with `okResponse` and `errResponse`; the tests in `src/transport/` stub the global `fetch` (`vi.stubGlobal`) or run a local HTTP server.
- Auth tests use the accounts in `src/_fixtures/auth.ts` and a temporary folder named with `process.pid`, never the real config or keyring.
- Agent tooling tests live in `.agents/scripts/` and run copies of the tools in throwaway repos (`.agents/scripts/lib/test-repo.ts`).

## Helpers

From `src/_fixtures/`: `lines`, `linesText`, `mockProcessExit`, `mockOutlineAuthModule`, `okResponse`, `errResponse`, `captureProxyEnv`, `clearProxyEnv`, `restoreProxyEnv`, and the fixtures `STORED_ACCOUNT`, `STORED_ACCOUNT_BOB`, `AUTH_INFO` and `TWO_USER_CONFIG`. From `@todoist/cli-core/testing`: `createTestProgram`, `captureConsole`, `captureStream`, `mockStdin`, `describeEmptyMachineOutput`. Build records from these fixtures instead of by hand where they fit, and add a fixture when several tests need a new shape.

## The quality bar

Read [references/test-rules.md](references/test-rules.md) before writing or reviewing a test. In short: a test counts only if it can fail. It asserts outcomes, takes expected values from outside the code under test, mocks only real boundaries, and you saw it fail once.

Done when each new test has failed once for the right reason, and then passes.

## When an existing test may change

- **The behaviour changed on purpose** (a feature or a fix): change the assertions that describe it, and say which in the report.
- **A refactor:** only how the test reaches the code (imports, names, call sites). Never its inputs or assertions, including expected output strings.
- **Never** to make a failing check pass without a behaviour change: no `.skip`, no deleted test, no looser matcher (`toEqual` → `toMatchObject`, exact arguments → `toHaveBeenCalled()`, an exact string → a shorter `toContain`).
