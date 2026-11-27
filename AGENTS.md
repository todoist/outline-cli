# Outline CLI

> For repo structure, where things live and the shared helpers, read
> [CODEBASE.md](./CODEBASE.md) first. This file covers the **rules**;
> CODEBASE.md is the **map**.

TypeScript CLI for the [Outline](https://www.getoutline.com) wiki API. Binary name: `ol`.

## Definition of done

- **Done means proven:** a test that failed before the change and passes after, or the command's real output (`node dist/index.js <command>`, signed in to a test account). For a refactor: tests that pin the behaviour, passing before and after. Reading code or a passing compile is not proof.
- **Run `npm run verify` before calling a change done.** It runs every check CI runs, in a few seconds, and records the pass. It prints what it cannot see, and says when nothing it checks has changed.
- **Never weaken a check to pass it.** Don't skip, delete or loosen tests, edit lint, type or test config to get green, or use `--no-verify`. If a check looks wrong, say so and stop.
- **Report honestly:** what ran, what it showed, and what you did not verify.

## Skills

Use the matching skill without being asked. They live in `.agents/skills/` (Claude Code reads them through `.claude/skills/`).

- `verify`: before saying a change is done, fixed or ready.
- `fix-bug`: something is broken or wrong.
- `build-feature`: a new command, flag or behaviour.
- `add-command`: the checklist of files to touch for a new command or subcommand.
- `refactor`: changing structure without changing behaviour. Other tasks send restructuring here, as a separate change.
- `write-tests`: writing or changing tests; `.agents/skills/write-tests/references/test-rules.md` is the quality bar.
- `learn`: after a correction, to turn it into a check.

## Build & Run

```bash
npm install           # install dependencies and the git hooks
npm run build         # compile TypeScript to dist/
npm run dev           # watch mode (rebuild on changes)
npm run type-check    # type check src/ and the agent tooling (.agents/scripts)
npm test              # run all tests
npx vitest run src/lib/output.test.ts  # run a single test file
npm run lint:check    # lint src/ and the agent tooling with oxlint
npm run lint:write    # lint with oxlint and auto-fix
npm run format        # format with oxfmt
npm run format:check  # check formatting without writing
npm run verify        # every check CI runs (lint, format, types, build, tests, skill sync)
```

**Run the CLI directly** after a build, no linking needed: `node dist/index.js --help`, `node dist/index.js <command> ...`. `npm link` makes the `ol` binary available globally.

## Rules when changing code

- **Errors:** throw `CliError(code, message, hints?)` from `src/lib/errors.ts` for anything user-facing, and add a new code to its `ErrorCode` type. The top-level `parseAsync().catch` in `src/index.ts` prints it, as JSON under `--json` and `--ndjson`. It also prints a `BaseCliError` thrown by `@todoist/cli-core` helpers (such as the delegated `changelog` command) the same way. Some older commands print `formatError(...)` and call `process.exit(1)` themselves, which ignores `--json`; don't copy that.
- **References:** documents and collections are named by ID, URL, URL slug or name. Resolve them with `resolveDocumentRef` / `resolveDocumentId` and `resolveCollectionRef` / `resolveCollectionId` from `src/lib/refs.ts`; never parse ids by hand.
- **Output:** commands print through `outputItem` and `outputList` from `src/lib/output.ts`, with a human formatter and an `essentialKeys` list: `--json` prints the essential fields, `--full` every field, `--ndjson` one record per line. In human output the name comes first and the id after it.
- **Text input:** `document create` and `document update` take the body from `--text`, `--file <path>` or `--stdin`, one at a time, and read it before any API call. On `update` without `--title`, a leading `# Heading` in the text becomes the title.
- **Deletes need `--confirm`:** without it, a delete fails with `CONFIRMATION_REQUIRED` before any API call.
- **Style:** oxlint (`.oxlintrc.json`) and oxfmt (`.oxfmtrc.json`): 4-space indentation, single quotes, no semicolons, 100-character lines, sorted imports. The pre-commit hook runs both on staged files, then the type check. TypeScript strict mode, target ES2022, NodeNext modules. Avoid `any` types and forced typecasts. Prefer `for` loops over `.forEach()`.

## Testing

Vitest with module mocking. Tests are colocated next to the source they cover (`src/lib/refs.ts` → `src/lib/refs.test.ts`); shared test fixtures live in `src/_fixtures/`. `npm run verify` runs them with every other CI check.

- Mock `apiRequest` with `vi.mock('../lib/api.js', () => ({ apiRequest: vi.fn() }))`, and the signed-in account with `vi.mock('../lib/auth.js', () => mockOutlineAuthModule())`.
- Stub `fetch` globally for API and transport tests.
- Capture output with `captureConsole(method?)` / `captureStream(stream?)` from `@todoist/cli-core/testing` (auto-restoring spies); read `spy.mock.calls`, or `lines(spy)` from `src/_fixtures/testing.ts`.
- Build the command harness with `createTestProgram(register)` from `@todoist/cli-core/testing` (applies `exitOverride()`), then `program.parseAsync(['node', 'ol', ...])`.
- Auth tests use a temporary folder named with `process.pid` for filesystem isolation.
- The root `tsconfig.json` leaves the tests out, and vitest strips types without checking them, so a type error in a test fails nothing. Keep tests typed anyway.

## Git hooks and agent tooling

- Commits and pushes to `main` are refused by the git hooks. Work on a branch.
- Agent tooling lives in `.agents/scripts/`, never in `scripts/` (which ships in the npm package).
- How it all fits together: [`docs/agents.md`](docs/agents.md).

## Skill Content (Agent Command Reference)

The file `src/lib/skills/content.ts` exports `SKILL_CONTENT`, a command reference that gets installed into AI agent skill directories via `ol skill install`. It is the source of truth agents use to learn the CLI's commands.

**Whenever commands, subcommands, flags, or options are added, updated, or removed in `src/commands/`, the `SKILL_CONTENT` in `src/lib/skills/content.ts` must be updated to match.**

After updating `SKILL_CONTENT`:

1. Run `npm run sync:skill` to regenerate `skills/outline-cli/SKILL.md` (the standalone skill file used by `npx skills add`); it builds first.
2. Run `ol skill update claude-code` (and any other installed agents) to propagate changes to installed skill files.

A CI check (`npm run check:skill-sync`) runs on pull requests and fails if `skills/outline-cli/SKILL.md` is out of sync with `content.ts`. `npm run verify` runs it too.

## Keeping CODEBASE.md accurate

`CODEBASE.md` is a structural map, not a file index. Update it when **structure** changes, not on every new file:

- a new folder under `src/`, or a new command file;
- a new broadly reusable helper in `src/lib/`;
- changes to command registration, auth or token storage, or build, test and release tooling.
