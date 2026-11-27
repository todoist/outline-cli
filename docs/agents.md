# Working with coding agents

This repository is set up so coding agents prove their work before they call it done. This page explains the parts, what each one guarantees, and where it stops. It grows as each part lands.

## Layers

1. **Git hooks** run for everyone, people and agents alike, on every commit and push.
2. **`npm run verify`** runs every CI check locally and records a pass.
3. **`AGENTS.md`** tells agents what done means. Claude Code reads it through `CLAUDE.md`; Codex and other agents read it directly.

## Rules and what holds them

| Rule                                          | Held by                                                                          | Certainty                                |
| --------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------- |
| No commits on `main`                          | `pre-commit` and `commit-msg` → `.agents/scripts/branch-guard.sh`                | Enforced locally; `--no-verify` skips it |
| No pushes to `main`                           | `pre-push` → `branch-guard.sh`; the "Protect default branch" and "main" rulesets | Enforced on GitHub                       |
| Committed files are linted and formatted      | `pre-commit` (lefthook, staged files only); CI                                   | Checked in CI                            |
| Type check passes before a commit             | `pre-commit`; CI                                                                 | Checked in CI                            |
| Tests pass before a push                      | `pre-push`; CI                                                                   | Checked in CI                            |
| Agent tooling never ships in the npm package  | `.agents/scripts/package-contents.test.ts`                                       | Checked in CI                            |
| `npm run verify` runs what CI runs            | `.agents/scripts/lib/steps.test.ts` compares it with the pull-request workflows  | Checked in CI                            |
| Verify skips only files no local check reads  | `.agents/scripts/lib/tree.test.ts` runs oxfmt on each one                        | Checked in CI                            |
| Run `npm run verify` before calling work done | `AGENTS.md`                                                                      | Asked                                    |
| Never weaken a check to pass it               | `AGENTS.md`                                                                      | Asked                                    |

"Checked in CI" means every pull request runs it and shows the result. A local hook alone is a speed bump: `git commit --no-verify` skips it.

**Gap:** the rulesets on `main` require a pull request but no passing status checks, so today a red check doesn't block a merge by itself and whoever merges has to look. Making the `Lint` and `Test` jobs required status checks on the `main` ruleset would turn "checked in CI" into "enforced in CI".

## Git hooks

[Lefthook](https://github.com/evilmartians/lefthook) runs the hooks, configured in `lefthook.yml`. `npm install` installs them into `.git/hooks` through the `prepare` script (`lefthook install --reset-hooks-path`) on every install, so a hook added to `lefthook.yml` reaches existing clones. Lefthook's own `postinstall` runs only when lefthook itself is installed, npm warns it will soon need approval, and lefthook refuses to install or sync hooks while `core.hooksPath` is set locally; the reset removes that setting.

- **`pre-commit`** refuses a commit on `main`, then lints and formats the staged files (re-staging what the tools fix) and runs the type check. Unstaged changes in a partly staged file are left alone.
- **`commit-msg`** refuses a commit on `main` again. Lefthook runs no pre-commit job when nothing is staged, so without it an empty commit would get past.
- **`pre-push`** refuses a push to `main`, then runs the tests. It checks `git push --dry-run` too.
- If node is not on `PATH` (some GUI git clients), both hooks still apply the branch rule, skip the checks, and say so. CI runs the same checks.
- The default branch is read from `origin/HEAD`, falling back to `main`. Pushes to `next`, the pre-release branch, are allowed: syncing it with `main` is a direct push (see `CONTRIBUTING.md`).

The release workflow commits and pushes to `main` from GitHub Actions, and `npm ci` runs `prepare` there, which installs the hooks. The release step sets `LEFTHOOK=0`, so semantic-release's commit and push run no hooks, as before: every check already ran on the pull request. The guard also skips itself when `GITHUB_ACTIONS=true`, in case another workflow commits with the hooks on. That is the one exemption. The rulesets on GitHub are the real enforcement; the hooks only catch mistakes early.

## `npm run verify`

One command, every check the pull-request workflows run (`lint.yml`, `test.yml`, `check-skill-sync.yml`): lint, format, both type checks, the build, all tests and the skill sync check. It takes a few seconds, so it always checks the whole tree.

- **Before the checks** it stops if Node is older than `package.json` requires, or if `node_modules` does not match the lockfile, transitive dependencies included (npm's own record of what it installed, `node_modules/.package-lock.json`, against `package-lock.json`). Both make checks fail, or pass, for reasons unrelated to your change.
- **What counts as a change:** `npm run format:check` reads Markdown, JSON and YAML as well as code, so almost every file is something a local check reads. Only two files aren't: `CHANGELOG.md` (docs, which `.oxfmtrc.json` leaves out and the release writes) and `.nvmrc` (which only CI's Node setup reads). When nothing else changed since the branch left `main`, verify says there is nothing to check, or that CI is the only check for `.nvmrc`. `.agents/scripts/lib/tree.test.ts` runs oxfmt over a badly formatted copy of each of these and fails if oxfmt would read it.
- **Order:** lint, format and both type checks start together with the build. The tests wait for the build, as in `test.yml`, since `.agents/scripts/package-contents.test.ts` packs `dist/`; the skill sync check imports from `dist/`, so it runs once the build has passed.
- **`CI=true`** is set for the build, the tests and the skill sync check, as GitHub Actions sets it. Variables that change what the CLI does (`OL_ACCESSIBLE`, `OL_SPINNER`, `OUTLINE_API_TOKEN`, `OUTLINE_URL`, `OUTLINE_OAUTH_CLIENT_ID`, `OUTLINE_OAUTH_CALLBACK_PORT`, `FORCE_COLOR`) are removed, with a note, since CI never sets them. A real token never reaches the tests.
- **Output:** one line per step. A failing step prints the last 30 lines of its log and the log's path under `.tmp/agents/logs/`.
- **The record:** after a full pass it writes a content hash of every file local checks read (not `CHANGELOG.md`, not `.nvmrc`) to `.tmp/agents/verified.json`. A run that fails, or sees files change while it runs, deletes it.
- **Platforms:** macOS, Linux and WSL. Like the git hooks, it assumes a POSIX shell and runs npm's POSIX launchers in `node_modules/.bin`; on native Windows, run it in WSL.
- **What it cannot see:** a real Outline instance, output in a real terminal, CI's Node version from `.nvmrc` when yours differs, and the pull request title check. It prints these after every pass.

If a pull-request workflow gains a step, `.agents/scripts/lib/steps.test.ts` fails until verify gains it too, or says why it can't.

## Where the tooling lives

- `.agents/scripts/` holds scripts and their tests. It is not under `scripts/` because `scripts/` ships in the npm package.
- The tooling runs straight from TypeScript with Node's type stripping, so it only uses erasable syntax (`.agents/scripts/tsconfig.json` enforces this). `npm run type-check` covers it with that config, since the root `tsconfig.json` covers only `src/`, and `npm run lint:check` lints it.
- Tests run in `npm test` and CI. They copy the tools into throwaway git repositories and never touch your checkout. A test helper clears the variables git exports to hooks, since `npm test` itself runs inside `pre-push`.

## Releases

semantic-release publishes from `main` on every merge, and a pre-release from `next`. The squash-merged PR title decides whether anything ships: `feat:`, `fix:`, `perf:` and any breaking change (`!`) release; `chore:`, `ci:`, `docs:`, `test:` and `refactor:` do not. Changes to the agent tooling use `chore:` or `ci:`, so they never publish a new version. No path filter is needed.

## What fails open

- No node on `PATH` in a GUI client: the hooks skip lint, the type check and the tests, with a message. The branch rule still applies.
- `git commit --no-verify`: every local hook is skipped. CI and the rulesets still apply.
- Worktrees share the hooks in `.git/hooks`, so the branch rule works in a new worktree at once. Lint, format, types and tests need `npm ci` in that worktree first. Without the lefthook binary anywhere the hooks look, they print "Can't find lefthook in PATH" and let the commit through.
