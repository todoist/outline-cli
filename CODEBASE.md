# CODEBASE.md: repo map

> **Purpose:** a short orientation file so agents (and people) can find their way around
> without exploring. Describes _what is where_; `AGENTS.md` describes _how to change things_.
> Update it when structure shifts, not on every new file.

## What this project is

`@todoist/outline-cli` is a **TypeScript CLI** for the Outline wiki API. Binary name: `ol`.
It publishes a single executable (`dist/index.js`).

ESM-only · Node ≥ 24 · npm ≥ 11 · Commander · vitest · oxlint + oxfmt · TypeScript 7 ·
semantic-release on merge to `main`.

## Top-level layout

```
/
├─ src/                   # All source. See tree below.
├─ scripts/               # postinstall.js, sync-skill.js, check-skill-sync.js. Ships in the npm package
├─ dist/                  # Build output (tsc). Never edit.
├─ skills/outline-cli/    # Generated SKILL.md (from src/lib/skills/content.ts)
├─ .github/workflows/     # lint.yml, test.yml, check-skill-sync.yml, check-semantic-pull-request.yml,
│                         # release.yml, issue-automation.yml
├─ .agents/
│  ├─ skills/             # Skills for agents working on this repo (verify, fix-bug, build-feature,
│  │                      # add-command, refactor, write-tests, learn, review-changes)
│  ├─ checks/             # Review checks reviewers and Doistbot apply (AGENTS.md links them)
│  └─ scripts/            # Agent tooling (verify, git hook branch guard, review worktree) and its
│                         # tests. Not published
├─ .claude/skills/        # Links to .agents/skills/, where Claude Code finds them
├─ AGENTS.md              # Prescriptive rules: definition of done, skills, review checks, build
│                         # commands, skill sync
├─ CODEBASE.md            # This file: the map
├─ CLAUDE.md              # Imports AGENTS.md for Claude Code; nothing else
├─ docs/agents.md         # How the agent tooling fits together
├─ tsconfig.json          # Builds src/; leaves out *.test.ts and src/_fixtures/
├─ vitest.config.ts       # Test runner config
├─ .oxlintrc.json / .oxfmtrc.json
├─ lefthook.yml           # Git hooks (pre-commit, commit-msg, pre-push)
└─ release.config.js      # semantic-release config
```

## `src/` tree

```
src/
├─ index.ts               # Entry: Commander setup, registers every command, the --user selector,
│                         # and the top-level error handler
├─ postinstall.ts         # Runs after npm install: refreshes installed skills, removes old skill folders
├─ commands/              # One file per command group, each exporting registerXxxCommand(program)
│  ├─ search.ts, document.ts, collection.ts, attachment.ts
│  ├─ auth.ts, account.ts, skill.ts
│  ├─ changelog.ts, update/   # Thin wrappers over @todoist/cli-core/commands
├─ lib/                   # Shared helpers (catalogue below)
│  └─ skills/             # SKILL_CONTENT and the per-agent installers behind `ol skill`
├─ transport/             # fetch with retries, and the undici dispatcher (proxy support)
├─ types/                 # Type declarations for untyped packages
└─ _fixtures/             # Shared test fixtures and helpers (left out of the build)
```

## Commands

Each file in `src/commands/` exports a `registerXxxCommand(program)` that builds its subcommands with Commander's chaining API and async action handlers; `src/index.ts` calls each one. Every call to Outline goes through `apiRequest` in `src/lib/api.ts`.

## `src/lib/` catalogue

- **api.ts:** `apiRequest<T>(path, body)`. Every Outline API call is a POST with Bearer auth; it refreshes OAuth tokens before and after a request when needed, and shows a spinner from `API_SPINNER_CONFIG` (blue reads, green creates, yellow updates and deletes).
- **auth.ts:** token, base URL and OAuth client ID resolution: `OUTLINE_API_TOKEN` and `OUTLINE_URL`, else the stored account. **auth-provider.ts** holds the OAuth login flow and the keyring-backed token store; **config.ts** reads and writes `~/.config/outline-cli/config.json`; **user-records.ts**, **user-ref-store.ts** and **outline-account.ts** map stored accounts for the `--user` selector; **migrate-auth.ts** moves the old single-token config into the account list.
- **output.ts:** `outputItem()` and `outputList()` for human, `--json` (essential keys, or all with `--full`) and `--ndjson` output; `formatError()` / `formatErrorJson()`.
- **errors.ts:** `CliError` and the `ErrorCode` type, over cli-core's error class (`BaseCliError`).
- **refs.ts:** resolves documents and collections from an ID, URL, slug or name.
- **attachments.ts:** upload, download and the parsing of attachment links in document text.
- **global-args.ts:** `--json`, `--ndjson`, `--accessible` (`OL_ACCESSIBLE`), `--no-spinner` (`OL_SPINNER`) and the root `--user` flag, read before Commander parses.
- **spinner.ts:** `withSpinner()` from cli-core; off when not a TTY, in JSON output, in CI and with `--no-spinner`.
- **markdown.ts:** terminal markdown rendering through marked.

## Testing

- **Runner:** vitest. `npm test` (one-shot), `npm run test:watch`. It also runs the agent tooling's tests in `.agents/scripts/`.
- **Location:** colocated `*.test.ts` next to the module under test; shared fixtures in `src/_fixtures/auth.ts`, `src/_fixtures/testing.ts` and `src/_fixtures/proxy-env.ts`.
- **Mocks:** `vi.mock` of `src/lib/api.ts` (`apiRequest`) and `src/lib/auth.ts` (`mockOutlineAuthModule()`), and a stubbed global `fetch` for the API and transport layers. `@todoist/cli-core/testing` provides `createTestProgram`, `captureConsole`, `captureStream` and `mockStdin`.
- **Config:** `vitest.config.ts` inlines `@todoist/cli-core` so module mocks reach its imports.

## Build & tooling

- **Build:** `npm run build` (`tsc` with `tsconfig.json`, which leaves the tests out of `dist/`).
- **Type-check:** `npm run type-check` (`tsc --noEmit` for `src/`, then `.agents/scripts/tsconfig.json` for the agent tooling). The root config leaves tests out, so test files aren't type-checked.
- **Lint and format:** `npm run lint:check` (oxlint on `src/` and `.agents/scripts/`), `npm run format:check` (oxfmt on every file it can format, Markdown, JSON and YAML included).
- **Verify:** `npm run verify` runs every check the pull-request workflows run and records a pass. See `docs/agents.md`.
- **Git hooks:** lefthook, installed by the `prepare` script. See `docs/agents.md`.
- **Release:** semantic-release on merge to `main` (`.github/workflows/release.yml`), a pre-release from `next`. PR titles must follow Conventional Commits, checked by `check-semantic-pull-request.yml`.
